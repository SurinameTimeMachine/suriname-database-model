#!/usr/bin/env python3
"""Zero-dependency CLI search over the unified person-centric database.

Searches names, aliases/former names, places and occupations across ALL
datasets and roles at once, using SQLite FTS5 (prefix + wildcard) with
substring and Soundex/phonetic fallbacks.

Examples
--------
    python3 scripts/person_search/search.py badloe
    python3 scripts/person_search/search.py --role owner --plantation marienburg
    python3 scripts/person_search/search.py --dataset 05-slave-emancipation --owner hulleman
    python3 scripts/person_search/search.py --contract 373/V
    python3 scripts/person_search/search.py --cross-dataset badloe
    python3 scripts/person_search/search.py --fuzzy livieira
    python3 scripts/person_search/search.py --stats
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
import time
import unicodedata

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_DB = os.path.join(REPO_ROOT, 'suriname_person_search.db')


def strip_diacritics(text):
    return ''.join(ch for ch in unicodedata.normalize('NFKD', text or '') if not unicodedata.combining(ch))


def normalize(text):
    return ' '.join(strip_diacritics(str(text or '')).lower().split())


def soundex(name):
    letters = re.sub(r'[^a-z]', '', strip_diacritics(name).lower())
    if not letters:
        return ''
    codes = {'b': '1', 'f': '1', 'p': '1', 'v': '1', 'c': '2', 'g': '2', 'j': '2', 'k': '2',
             'q': '2', 's': '2', 'x': '2', 'z': '2', 'd': '3', 't': '3', 'l': '4', 'm': '5',
             'n': '5', 'r': '6'}
    first = letters[0]
    out, prev = first, codes.get(first, '')
    for ch in letters[1:]:
        code = codes.get(ch, '')
        if code and code != prev:
            out += code
        if ch not in 'hw':
            prev = code
        if len(out) >= 4:
            break
    return (out + '000')[:4].upper()


SELECT = """SELECT p.person_id, p.full_name, p.role, p.source_dataset, p.sex, p.age,
                   p.birth_year, p.event_year, p.occupation, p.location,
                   p.plantation_name, p.district, p.status, p.contract_number,
                   c.item_id, c.record_type, c.register
            FROM persons p LEFT JOIN certificates c ON c.certificate_id = p.certificate_id"""


def filters(args, params):
    where = []
    if args.role:
        where.append(f"p.role IN ({','.join('?' * len(args.role))})")
        params.extend(args.role)
    if args.dataset:
        where.append(f"p.source_dataset IN ({','.join('?' * len(args.dataset))})")
        params.extend(args.dataset)
    if args.plantation:
        where.append('lower(p.plantation_name) LIKE ?')
        params.append(f'%{args.plantation.lower()}%')
    if args.status:
        where.append('p.status = ?')
        params.append(args.status)
    if args.year:
        where.append('(p.event_year = ? OR p.birth_year = ?)')
        params.extend([args.year, args.year])
    if args.from_year:
        where.append('p.event_year >= ?')
        params.append(args.from_year)
    if args.to_year:
        where.append('p.event_year <= ?')
        params.append(args.to_year)
    if args.place:
        where.append('lower(p.location) LIKE ?')
        params.append(f'%{args.place.lower()}%')
    return (' AND ' + ' AND '.join(where)) if where else ''


def run(conn, args, mode):
    terms = [normalize(t) for t in args.terms if normalize(t)]
    params = []
    flt = filters(args, params)
    if mode == 'fts':
        match = ' AND '.join(f'"{t.replace(chr(34), "")}"*' for t in terms)
        sql = f"""{SELECT} JOIN persons_fts f ON f.rowid = p.person_id
                  WHERE persons_fts MATCH ?{flt} ORDER BY rank LIMIT ?"""
        params = [match, *params, args.limit]
    elif mode == 'like':
        sql = f"""{SELECT} WHERE p.name_norm LIKE ?{flt}
                  ORDER BY p.surname, p.given_name LIMIT ?"""
        params = ['%' + ' '.join(terms) + '%', *params, args.limit]
    else:  # soundex
        codes = [soundex(t) for t in terms]
        clause = ' OR '.join('p.name_soundex = ?' for _ in codes)
        sql = f"""{SELECT} WHERE ({clause}){flt}
                  ORDER BY p.surname, p.given_name LIMIT ?"""
        params = [*codes, *params, args.limit]
    return conn.execute(sql, params).fetchall()


def print_rows(rows, limit):
    if not rows:
        print('no matches')
        return
    header = f'{"name":<30}{"role":<22}{"dataset":<24}{"yr":<6}{"place/plantation":<28}{"scan":<32}'
    print(header)
    print('-' * len(header))
    for r in rows:
        (_, full, role, dataset, sex, age, byear, eyear, occ, loc, plant, dist, status,
         contract, item, rtype, register) = r
        place = (plant or loc or dist or '')[:28]
        print(f'{(full or "(unnamed)")[:30]:<30}{role[:22]:<22}{dataset[:24]:<24}'
              f'{str(eyear or byear or ""):<6}{place:<28}{str(item or "")[:32]:<32}')
    print(f'\n{len(rows)} row(s) (limit {limit}).')


def stats(conn):
    conn.row_factory = sqlite3.Row
    print('suriname_person_search.db')
    print('=' * 52)
    for t in ('certificates', 'persons', 'person_names', 'relations', 'locations',
              'group_observations', 'annotations'):
        print(f'  {t:<20} {conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]:>10,}')
    print('\n  persons per dataset:')
    for row in conn.execute('SELECT source_dataset, COUNT(*) c FROM persons GROUP BY 1 ORDER BY 2 DESC'):
        print(f'    {row[0]:<28} {row[1]:>10,}')
    print('\n  top roles:')
    for row in conn.execute('SELECT role, COUNT(*) c FROM persons GROUP BY 1 ORDER BY 2 DESC LIMIT 15'):
        print(f'    {row[0]:<28} {row[1]:>10,}')
    print('\n  licensing/embargo:')
    for row in conn.execute('SELECT source_dataset, license, embargo FROM sources ORDER BY embargo DESC, 1'):
        print(f'    {row[0]:<28} {row[1]:<28} {"EMBARGO" if row[2] else "ok"}')


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('terms', nargs='*')
    ap.add_argument('--db', default=DEFAULT_DB)
    ap.add_argument('--role', action='append')
    ap.add_argument('--dataset', action='append')
    ap.add_argument('--plantation')
    ap.add_argument('--place')
    ap.add_argument('--status')
    ap.add_argument('--year', type=int)
    ap.add_argument('--from-year', type=int)
    ap.add_argument('--to-year', type=int)
    ap.add_argument('--owner', help='restrict enslaved persons to those of this owner')
    ap.add_argument('--contract', help='search by contract number')
    ap.add_argument('--cross-dataset', help='list datasets where this name appears')
    ap.add_argument('--fuzzy', action='store_true')
    ap.add_argument('--like', action='store_true')
    ap.add_argument('--limit', type=int, default=25)
    ap.add_argument('--json', action='store_true')
    ap.add_argument('--stats', action='store_true')
    args = ap.parse_args(argv)

    if not os.path.exists(args.db):
        sys.exit(f'database not found: {args.db}\nrun: python3 scripts/person_search/build_db.py')
    conn = sqlite3.connect(args.db)

    if args.stats:
        stats(conn)
        return 0

    if args.contract:
        # match against the small table of distinct contract numbers first, then
        # join to persons (avoids a substring scan over ~1.9M persons)
        has_lookup = conn.execute("SELECT 1 FROM sqlite_master WHERE name='contract_numbers'").fetchone()
        if has_lookup:
            rows = conn.execute(f"""
                WITH hits AS (SELECT contract_number FROM contract_numbers
                              WHERE contract_number LIKE ?)
                {SELECT} JOIN hits ON hits.contract_number = p.contract_number
                ORDER BY p.source_dataset LIMIT ?""",
                (f'%{args.contract}%', args.limit)).fetchall()
        else:
            rows = conn.execute(f"""{SELECT} WHERE p.contract_number LIKE ?
                                    ORDER BY p.source_dataset LIMIT ?""",
                                (f'%{args.contract}%', args.limit)).fetchall()
        output(rows, args)
        return 0

    if args.cross_dataset:
        name = normalize(args.cross_dataset)
        rows = conn.execute("""
            SELECT source_dataset, COUNT(*) c, GROUP_CONCAT(DISTINCT role) roles
            FROM persons WHERE name_norm LIKE ? GROUP BY 1 ORDER BY 2 DESC""",
            (f'%{name}%',)).fetchall()
        if args.json:
            print(json.dumps([{'source_dataset': d, 'count': c, 'roles': r} for d, c, r in rows],
                             ensure_ascii=False, indent=1))
            return 0
        for dataset, count, roles in rows:
            print(f'  {dataset:<28} {count:>8,}  {roles}')
        if not rows:
            print('no matches')
        return 0

    if args.owner:
        rows = conn.execute(f"""{SELECT}
            WHERE p.source_dataset = '05-slave-emancipation'
              AND p.role IN ('enslaved','emancipated')
              AND p.person_id IN (
                SELECT r.to_person FROM relations r JOIN persons o ON o.person_id = r.from_person
                 WHERE r.relation_type = 'enslaver-enslaved' AND o.name_norm LIKE ?)
            ORDER BY p.name_norm LIMIT ?""", (f'%{normalize(args.owner)}%', args.limit)).fetchall()
        output(rows, args)
        return 0

    if not args.terms:
        ap.error('provide search terms, or use --contract / --owner / --cross-dataset / --stats')

    started = time.perf_counter()
    mode = 'like' if args.like else 'fts'
    rows = run(conn, args, mode)
    if not rows and args.fuzzy:
        rows = run(conn, args, 'like')
        mode = 'like(fallback)'
    if not rows and args.fuzzy:
        rows = run(conn, args, 'soundex')
        mode = 'soundex(fallback)'
    elapsed = (time.perf_counter() - started) * 1000

    output(rows, args)
    if not args.json:
        print(f'\nmode={mode}  hits={len(rows)}  {elapsed:.0f} ms')
    return 0


JSON_KEYS = ['person_id', 'full_name', 'role', 'source_dataset', 'sex', 'age', 'birth_year',
             'event_year', 'occupation', 'location', 'plantation_name', 'district', 'status',
             'contract_number', 'item_id', 'record_type', 'register']


def output(rows, args):
    """Print rows of the shared SELECT as JSON (--json) or as a table."""
    if args.json:
        print(json.dumps([dict(zip(JSON_KEYS, r)) for r in rows], ensure_ascii=False, indent=1))
    else:
        print_rows(rows, args.limit)


if __name__ == '__main__':
    raise SystemExit(main())
