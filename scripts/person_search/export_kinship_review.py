"""Export the family notes of the migration registers that could not be linked, as a
spreadsheet for checking by hand.

    uv run --with openpyxl python scripts/person_search/export_kinship_review.py \
        [--out ../kinship-review.xlsx] [--base-url http://127.0.0.1:8001]

Uses the same rules as the database build (parse_kinship / resolve_kinship_ref in
build_db.py; see docs/person-search-kinship-linking.md) and reads the raw register
files, so it needs data/12-migratie-datasets but not the database.

The spreadsheet contains restricted data (dataset 12): keep it within the project team
and never commit it. The default output is next to the repository, not inside it.
"""
import argparse
import collections
import os
import re
import sys

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_db as b  # noqa: E402

REGISTERS = {'hindostani': ('Hindostani', 'nt00345'), 'javanese': ('Javanese', 'nt00346')}

# Problem categories, most specific first; a note gets the first that applies.
CATEGORIES = [
    ('Struck out or corrected',
     'The note says a number was crossed out or wrong (doorgestreept, foutief, correctie). '
     'Nothing in it was linked.'),
    ('Plain "no." number',
     '"no N" without a series: a muster-roll, contract or deed number. The columns '
     '"Candidate (contract)" and "Candidate (muster roll)" show what each reading would give.'),
    ('Contract not in register',
     'The contract number was read, but no record in this register has it (a gap in the '
     'index, or a slip of the pen).'),
    ('Points to own record',
     'The number read is the contract number of this record itself (e.g. "Man van AB644" '
     'in record AB644).'),
    ('MR (Marienburg) number only',
     'Only a Marienburg estate number (MR), which is not in the migration register.'),
    ('Names or free text only',
     'No contract number could be read: names only ("man van DUKHANI"), a story, or a '
     'kinship word we do not know.'),
]
_NOBODY = re.compile(r'^\s*geen\s+(?:vrouw|man|kinderen)\W*$', re.I)
_PLAIN_NO = re.compile(r'\bno(?![a-z])\.?\s*(\d+)(?!\d|[a-z]?\s*/?\s*[A-Z]{1,2}\b)', re.I)
_STRUCK = re.compile(r'\b(?:doorgestre?ept|foutief|moet zijn|correctie)\b', re.I)

FONT = 'Arial'
HEADER_FILL = PatternFill('solid', start_color='1F4E78')
INPUT_FILL = PatternFill('solid', start_color='FFF2CC')


def load_register(label, layout):
    """Return the records of one register as dicts, plus the lookups used for linking."""
    fields = {v: k for k, v in layout['fields'].items()}
    records, by_contract, by_muster = [], {}, {}
    for raw in b._read_headerless(layout['path']):
        get = lambda name: b.clean(raw[fields[name]]) if name in fields and fields[name] < len(raw) else None
        rec = {name: get(name) for name in ('contract_number', 'given_name', 'surname', 'sex', 'ship',
                                            'muster_number', 'plantation', 'uuid', 'arrival_date',
                                            'contract_start')}
        index = fields['kinship_refs']
        rec['notes'] = (raw[index].strip() if index < len(raw) else '') or None
        rec['id'] = len(records)
        records.append(rec)
        key = b.contract_key(rec['contract_number'])
        if key:
            by_contract[key] = (rec['id'], None)
        if rec['ship'] and rec['muster_number']:
            muster = (rec['ship'], rec['muster_number'])
            by_muster[muster] = None if muster in by_muster else (rec['id'], None)
    return records, by_contract, by_muster


def review_rows(label, records, by_contract, by_muster):
    """Yield one dict per family note that has something left to check."""
    series = {key.split('/')[0] for key in by_contract}
    for rec in records:
        notes = rec['notes']
        if not notes:
            continue
        linked, missing, own, mr = [], [], [], []
        for _, _, detail, _, key, _ in b.parse_kinship(notes, rec['contract_number'], series):
            other, _ = b.resolve_kinship_ref(key, rec['ship'], by_contract, by_muster)
            if other and other[0] != rec['id']:
                linked.append(f'{detail} {records[other[0]]["contract_number"]}')
            elif other:
                own.append(key)
            elif key.startswith('MR/'):
                mr.append(key)
            else:
                missing.append(key)
        plain_no = _PLAIN_NO.findall(notes)
        if _STRUCK.search(notes):
            category = CATEGORIES[0][0]
        elif plain_no and not linked:
            category = CATEGORIES[1][0]
        elif missing:
            category = CATEGORIES[2][0]
        elif own:
            category = CATEGORIES[3][0]
        elif mr and not linked:
            category = CATEGORIES[4][0]
        elif not linked and not _NOBODY.match(notes):
            category = CATEGORIES[5][0]
        else:
            continue   # fully linked, or 'geen vrouw' (no relative to link)
        letters = (b.contract_key(rec['contract_number']) or '/').split('/')[0]
        contract_candidates = [records[by_contract[k][0]]['contract_number']
                               for k in (f'{letters}/{n}' for n in plain_no) if k in by_contract]
        muster_candidates = [records[m[0]]['contract_number'] for m in
                             (by_muster.get((rec['ship'], n)) for n in plain_no) if m]
        yield {
            'category': category, 'record': rec, 'register': REGISTERS[label][0],
            'collection': REGISTERS[label][1], 'unresolved': ', '.join(missing + own + mr),
            'linked': ', '.join(linked), 'contract_candidates': ', '.join(contract_candidates),
            'muster_candidates': ', '.join(muster_candidates),
        }


def style_header(ws, row, widths):
    for col, width in enumerate(widths, 1):
        cell = ws.cell(row=row, column=col)
        cell.font = Font(name=FONT, bold=True, color='FFFFFF')
        cell.fill = HEADER_FILL
        cell.alignment = Alignment(wrap_text=True, vertical='top')
        ws.column_dimensions[cell.column_letter].width = width


def write_workbook(rows, out, base_url, notes_total):
    wb = Workbook()
    readme = wb.active
    readme.title = 'Read me'
    sheet = wb.create_sheet('To check')
    summary = wb.create_sheet('Summary')

    # --- To check -------------------------------------------------------------------
    columns = [
        ('Category', 26), ('Register', 11), ('Contract', 10), ('Name', 22), ('Sex', 7),
        ('Ship', 20), ('Arrival / start', 13), ('Plantation', 20), ('Family note (as written)', 60),
        ('Read but not found', 18), ('Already linked from this note', 26),
        ('Candidate (contract)', 13), ('Candidate (muster roll)', 13),
        ('Search page', 12), ('Nationaal Archief', 12),
        ('Correct contract number(s)', 18), ('Relation', 16), ('Decision', 13),
        ('Checked by', 12), ('Remark', 30),
    ]
    first_input = len(columns) - 4
    for col, (title, _) in enumerate(columns, 1):
        sheet.cell(row=1, column=col, value=title)
    style_header(sheet, 1, [w for _, w in columns])
    for col in range(first_input, len(columns) + 1):
        sheet.cell(row=1, column=col).fill = PatternFill('solid', start_color='BF8F00')
    order = {name: i for i, (name, _) in enumerate(CATEGORIES)}
    rows.sort(key=lambda r: (order[r['category']], r['register'], r['record']['id']))
    for i, row in enumerate(rows, 2):
        rec = row['record']
        name = ' '.join(filter(None, (rec['given_name'], rec['surname'])))
        values = [row['category'], row['register'], rec['contract_number'], name, rec['sex'],
                  rec['ship'], rec['arrival_date'] or rec['contract_start'], rec['plantation'],
                  rec['notes'], row['unresolved'], row['linked'], row['contract_candidates'],
                  row['muster_candidates']]
        for col, value in enumerate(values, 1):
            cell = sheet.cell(row=i, column=col, value=value)
            cell.font = Font(name=FONT)
            cell.alignment = Alignment(wrap_text=col == 9, vertical='top')
        if rec['uuid']:
            obs = f'12-migratie-datasets/{rec["uuid"]}/migrant'
            for col, url, text in ((14, f'{base_url}/ui/index.html#obs={obs}', 'open'),
                                   (15, f'https://www.nationaalarchief.nl/onderzoeken/index/'
                                        f'{row["collection"]}/{rec["uuid"]}', 'index')):
                cell = sheet.cell(row=i, column=col, value=text)
                cell.hyperlink = url
                cell.font = Font(name=FONT, color='0563C1', underline='single')
        for col in range(first_input, len(columns) + 1):
            cell = sheet.cell(row=i, column=col)
            cell.fill = INPUT_FILL
            cell.font = Font(name=FONT)
            cell.alignment = Alignment(vertical='top', wrap_text=True)
    last = len(rows) + 1
    decision = DataValidation(type='list', formula1='"link,do not link,unclear"', allow_blank=True)
    sheet.add_data_validation(decision)
    decision_col = sheet.cell(row=1, column=first_input + 2).column_letter
    decision.add(f'{decision_col}2:{decision_col}{max(last, 2)}')
    sheet.freeze_panes = 'D2'
    sheet.auto_filter.ref = f'A1:{sheet.cell(row=1, column=len(columns)).column_letter}{last}'
    sheet.cell(row=1, column=9).comment = Comment(
        'Copied from the "Familierelaties" column of the Nationaal Archief index; line breaks kept.', 'export')

    # --- Summary (formulas, so the counts follow filtering and filled-in decisions) ----
    summary['A1'] = 'Category'
    summary['B1'] = 'Notes'
    summary['C1'] = 'Decided'
    summary['D1'] = 'Still open'
    style_header(summary, 1, [30, 10, 10, 12])
    rng = lambda letter: f"'To check'!${letter}$2:${letter}${max(last, 2)}"
    for i, (name, _) in enumerate(CATEGORIES, 2):
        summary.cell(row=i, column=1, value=name)
        summary.cell(row=i, column=2, value=f'=COUNTIF({rng("A")},A{i})')
        summary.cell(row=i, column=3, value=f'=COUNTIFS({rng("A")},A{i},{rng(decision_col)},"<>")')
        summary.cell(row=i, column=4, value=f'=B{i}-C{i}')
    total = len(CATEGORIES) + 2
    summary.cell(row=total, column=1, value='Total')
    for col, letter in ((2, 'B'), (3, 'C'), (4, 'D')):
        summary.cell(row=total, column=col, value=f'=SUM({letter}2:{letter}{total - 1})')
    for row in summary.iter_rows(min_row=2, max_row=total):
        for cell in row:
            cell.font = Font(name=FONT, bold=cell.row == total)

    # --- Read me ----------------------------------------------------------------------
    readme.column_dimensions['A'].width = 30
    readme.column_dimensions['B'].width = 100
    lines = [
        ('Family notes to check by hand', None),
        ('', None),
        ('What this is', 'Family notes ("Vrouw van 387", "Man van 530 en vader van 531/VI") in the '
                         'Javanese and Hindostani contract registers that the person search could not '
                         'turn into links. The rules are explained in docs/person-search-kinship-linking.md.'),
        ('Restricted data', 'Dataset 12 (migration registers) is restricted. Keep this file within the '
                            'project team. Do not commit it to git or share it publicly.'),
        ('Size', f'{len(rows)} notes to check, out of {notes_total} family notes in total. Notes that were '
                 'fully linked, and notes that only say there is no relative ("geen vrouw"), are left out.'),
        ('Not included', 'Notes where one part was linked and another part was skipped as being about '
                         'someone else (e.g. "man van Pinmiten d/v 897/UU"); see the doc, step 10.'),
        ('', None),
        ('How to fill in', 'Work in the sheet "To check". Only the yellow columns are for you; the other '
                           'columns come from the registers. Use the filter on "Category" to work one kind '
                           'of problem at a time. "open" opens the record on the search page (the search '
                           'server must be running); "index" opens the Nationaal Archief index page.'),
        ('Correct contract number(s)', 'The contract number(s) the note means, written like the registers '
                                       '(e.g. AB387). Several: separate with a comma.'),
        ('Relation', 'As the note says: wife, husband, married, lives with, mother, father, son, daughter, '
                     'brother, sister, other (explain in Remark).'),
        ('Decision', 'link = add this link; do not link = the note does not support a link; '
                     'unclear = needs another look or another source.'),
        ('Checked by', 'Your initials.'),
        ('Remark', 'Anything that explains the decision (e.g. "same ship, numbers adjacent").'),
        ('Example (filled in)', 'Category "Plain \\"no.\\" number", contract FF93, note "vr v no 104", '
                                'Candidate (contract) FF104, Candidate (muster roll) FF19  ->  Correct contract '
                                'number(s): FF104 · Relation: wife · Decision: link · Checked by: TvO · '
                                'Remark: FF104 is a man, FF19 a woman; contract reading fits.'),
        ('', None),
        ('Categories', None),
    ] + [(name, text) for name, text in CATEGORIES] + [
        ('', None),
        ('Summary sheet', 'Counts per category and how many have a Decision; it updates as you fill in.'),
        ('Made by', 'scripts/person_search/export_kinship_review.py (rerun after the data or rules change; '
                    'filled-in columns are not carried over).'),
    ]
    for i, (label, text) in enumerate(lines, 1):
        a = readme.cell(row=i, column=1, value=label)
        a.font = Font(name=FONT, bold=True, size=14 if i == 1 else 10)
        a.alignment = Alignment(vertical='top')
        if text:
            c = readme.cell(row=i, column=2, value=text)
            c.font = Font(name=FONT)
            c.alignment = Alignment(wrap_text=True, vertical='top')
    wb.save(out)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--out', default=os.path.join(os.path.dirname(b.REPO_ROOT), 'kinship-review.xlsx'))
    parser.add_argument('--base-url', default='http://127.0.0.1:8001',
                        help='address of the search server, for the "open" links')
    args = parser.parse_args()
    rows, notes_total = [], 0
    for label in REGISTERS:
        records, by_contract, by_muster = load_register(label, b.MIGRATION_LAYOUTS[label])
        notes_total += sum(1 for r in records if r['notes'])
        rows += review_rows(label, records, by_contract, by_muster)
    write_workbook(rows, args.out, args.base_url.rstrip('/'), notes_total)
    counts = collections.Counter((r['category'], r['register']) for r in rows)
    for (category, register), n in sorted(counts.items()):
        print(f'{category:32} {register:11} {n:5}')
    print(f'{len(rows)} notes written to {args.out}')


if __name__ == '__main__':
    main()
