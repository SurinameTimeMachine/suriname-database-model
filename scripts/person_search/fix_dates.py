#!/usr/bin/env python3
"""Repair impossible years (transcription typos) in the person search database.

Runs at the end of build_db.py (before the cross-dataset table and place linking),
or standalone on an existing database, which keeps tables added outside the build:

    python3 scripts/person_search/fix_dates.py [suriname_person_search.db]

Only rule-based corrections where the right value follows from the record's own
context; every change is logged and stored in the table `date_fixes`, so it can be
checked and reported back to the source holder. The source files are not changed.

Rules
1. Migration registers (12): arrivals ended in 1939. A record dated later is put
   on the arrival date most of the other passengers of the same ship
   (collection + ship name) have. E.g. "British Nation II" 1984-12-12 -> 1884-12-12.
2. Civil records (13): a certificate year outside the year range of its own register
   (e.g. register "X (1801-1846)", year 2814) is corrected when exactly one other
   century puts it inside the range (2814 -> 1814).
3. Censuses (09, 10): a birth year after the census year is moved back one century
   when that gives a plausible age (0-110). E.g. 1990 in the 1950 census -> 1890.
"""
import os
import re
import sqlite3
import sys
from collections import Counter, defaultdict

LAST_MIGRATION_YEAR = 1940

SCHEMA = """
DROP TABLE IF EXISTS date_fixes;
CREATE TABLE date_fixes (
  tbl TEXT, row_id INTEGER, certificate_id INTEGER, source_dataset TEXT,
  field TEXT, old_value TEXT, new_value TEXT, rule TEXT
);
"""


def year_of(text):
    m = re.search(r'(\d{4})', text or '')
    return int(m.group(1)) if m else None


def replace_year(text, old, new):
    return text.replace(str(old), str(new), 1) if text else text


def register_range(register):
    m = re.search(r'(1[6-9]\d\d)\s*-\s*(1[6-9]\d\d)', register or '')
    return (int(m.group(1)), int(m.group(2))) if m else None


def other_century(year, lo, hi):
    hits = {c * 100 + year % 100 for c in range(16, 20)} & set(range(lo, hi + 1))
    return hits.pop() if len(hits) == 1 else None


class Fixer:
    def __init__(self, conn, log):
        self.conn, self.log = conn, log
        self.fixes = []

    def note(self, tbl, row_id, cert, ds, field, old, new, rule):
        self.fixes.append((tbl, row_id, cert, ds, field, None if old is None else str(old),
                           None if new is None else str(new), rule))

    def set_cert_date(self, cert, ds, new_date, new_year, old_date, old_year, rule):
        """Move a certificate and all persons on it to new_date/new_year."""
        c = self.conn
        if old_date is not None or new_date is not None:
            c.execute('UPDATE certificates SET event_date = ? WHERE certificate_id = ?', (new_date, cert))
            self.note('certificates', cert, cert, ds, 'event_date', old_date, new_date, rule)
        c.execute('UPDATE certificates SET event_year = ? WHERE certificate_id = ?', (new_year, cert))
        self.note('certificates', cert, cert, ds, 'event_year', old_year, new_year, rule)
        for pid, ev_date, ev_year, b_year in c.execute(
                'SELECT person_id, event_date, event_year, birth_year FROM persons WHERE certificate_id = ?',
                (cert,)).fetchall():
            nd = new_date if ev_date == old_date else ev_date
            ny = new_year if ev_year == old_year else ev_year
            # birth years computed as event year - age move along with the event
            nb = b_year - (old_year - new_year) if (b_year and old_year and b_year > new_year) else b_year
            c.execute('UPDATE persons SET event_date = ?, event_year = ?, birth_year = ? WHERE person_id = ?',
                      (nd, ny, nb, pid))
            if ny != ev_year:
                self.note('persons', pid, cert, ds, 'event_year', ev_year, ny, rule)
            if nb != b_year:
                self.note('persons', pid, cert, ds, 'birth_year', b_year, nb, rule)

    def migration(self):
        c = self.conn
        rows = c.execute("""SELECT certificate_id, collection, address_text, event_date, event_year
                              FROM certificates WHERE source_dataset = '12-migratie-datasets'
                               AND event_year IS NOT NULL""").fetchall()
        by_ship = defaultdict(Counter)
        for cert, coll, ship, d, y in rows:
            if ship and d and y < LAST_MIGRATION_YEAR:
                by_ship[(coll, ship)][d] += 1
        n = 0
        for cert, coll, ship, d, y in rows:
            if y < LAST_MIGRATION_YEAR:
                continue
            dates = by_ship.get((coll, ship))
            if not dates:
                self.log(f'    migration {cert}: year {y}, ship {ship!r} unknown; left as is')
                continue
            new_date, _ = dates.most_common(1)[0]
            self.set_cert_date(cert, '12-migratie-datasets', new_date, int(new_date[:4]), d, y,
                               f'arrival date of the other passengers of ship {ship!r}')
            n += 1
        return n

    def civil(self):
        c = self.conn
        n = 0
        for cert, reg, cert_date, d, y in c.execute(
                """SELECT certificate_id, register, cert_date, event_date, event_year FROM certificates
                    WHERE source_dataset = '13-civil' AND event_year IS NOT NULL""").fetchall():
            rng = register_range(reg)
            if not rng or rng[0] <= y <= rng[1]:
                continue
            ny = other_century(y, *rng)
            if not ny:
                continue
            rule = f'year outside its register {reg!r}'
            if cert_date and year_of(cert_date) == y:
                c.execute('UPDATE certificates SET cert_date = ? WHERE certificate_id = ?',
                          (replace_year(cert_date, y, ny), cert))
                self.note('certificates', cert, cert, '13-civil', 'cert_date', cert_date,
                          replace_year(cert_date, y, ny), rule)
            self.set_cert_date(cert, '13-civil', replace_year(d, y, ny), ny, d, y, rule)
            n += 1
        return n

    def census(self):
        c = self.conn
        n = 0
        for pid, cert, ds, b_date, b_year, ev_year in c.execute(
                """SELECT person_id, certificate_id, source_dataset, birth_date, birth_year, event_year
                     FROM persons WHERE source_dataset IN ('09-volkstelling-1921', '10-volkstelling-1950')
                      AND birth_year > event_year""").fetchall():
            ny = b_year - 100
            if not (ev_year - 110 <= ny <= ev_year):
                continue
            nd = replace_year(b_date, b_year, ny) if b_date and year_of(b_date) == b_year else b_date
            c.execute('UPDATE persons SET birth_year = ?, birth_date = ? WHERE person_id = ?', (ny, nd, pid))
            rule = f'birth year after the census ({ev_year}); one century back'
            self.note('persons', pid, cert, ds, 'birth_year', b_year, ny, rule)
            if nd != b_date:
                self.note('persons', pid, cert, ds, 'birth_date', b_date, nd, rule)
            n += 1
        return n


def run(conn, log=print):
    conn.executescript(SCHEMA)
    f = Fixer(conn, log)
    counts = {'migration records': f.migration(), 'civil records': f.civil(), 'census persons': f.census()}
    conn.executemany('INSERT INTO date_fixes VALUES (?, ?, ?, ?, ?, ?, ?, ?)', f.fixes)
    conn.commit()
    for k, v in counts.items():
        log(f'  dates fixed: {v} {k}')
    return counts, f.fixes


if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    db = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, '..', '..', 'suriname_person_search.db')
    conn = sqlite3.connect(db)
    print(f'Fixing impossible years in {db}')
    counts, fixes = run(conn)
    sys.path.insert(0, here)
    import build_db  # noqa: E402  (refresh the summary table that holds first/last years)
    conn.executescript(build_db.CROSS_DATASET)
    conn.commit()
    print('\nChanged certificate/birth years (old -> new, rule):')
    seen = Counter()
    for tbl, _, _, ds, field, old, new, rule in fixes:
        if field in ('event_year', 'birth_year') and (tbl == 'certificates' or field == 'birth_year'):
            seen[(ds, field, old, new, rule)] += 1
    for (ds, field, old, new, rule), k in sorted(seen.items()):
        print(f'  {ds:22} {field:10} {old} -> {new}  x{k}  ({rule})')
    print('\nAll changes are in the table date_fixes. Run link_places.py again afterwards.')
