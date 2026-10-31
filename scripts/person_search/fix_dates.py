#!/usr/bin/env python3
"""Repair impossible years (transcription typos) in the person search database.

Runs at the end of build_db.py (before the cross-dataset table and place linking),
or standalone on an existing database, which keeps tables added outside the build:

    python3 scripts/person_search/fix_dates.py [suriname_person_search.db]

Only rule-based corrections where the right value follows from the record's own
context; every change is logged and stored in the table `date_fixes`, so it can be
checked and reported back to the source holder. The source files are not changed.

Rules
1. Migration registers (12): arrivals ended in 1939 and did not start before 1853
   (Javanese: 1890). A record dated outside that window, or with an unreadable year
   (e.g. 1024-10-01), is put on the arrival date of the other passengers of the
   same ship (collection + ship name): the most common date with the same day and
   month if there is one, otherwise the most common date of that ship.
   E.g. "British Nation II" 1984-12-12 -> 1884-12-12, "Lalla Rookh" 1843-06-05 -> 1873-06-05.
2. Civil records (13): a certificate year outside the year range of its own register
   (e.g. register "X (1801-1846)", year 2814) is corrected when exactly one other
   century puts it inside the range (2814 -> 1814). Registers without a year range
   (recognitions): a year before 1800 takes the year of the other certificates in
   the same inventory number, when nearly all of them share one year (1095 -> 1905).
3. Censuses (09, 10): a birth year after the census year is moved back one century
   when that gives a plausible age (0-110). E.g. 1990 in the 1950 census -> 1890.
4. Migration registers (12): a death year more than 20 years before the arrival (or
   unreadable, e.g. 1043) is moved to the one century that puts it within 90 years
   after the arrival (and before 1990).
   E.g. arrival 1900, death 1815-10-18 -> 1915-10-18.
"""
import os
import re
import sqlite3
import sys
from collections import Counter, defaultdict

LAST_MIGRATION_YEAR = 1940
FIRST_MIGRATION_YEAR = {'migration-chinese': 1853, 'migration-hindostani': 1853, 'migration-javanese': 1890}
LAST_DEATH_YEAR = 1990
DEATH_GAP = 20  # a death this many years before the arrival cannot be a late registration
FIRST_CIVIL_YEAR = 1800
INVENTORY_SHARE = 0.9  # share of an inventory's certificates that must have the same year

# Kept on a standalone re-run, so earlier fixes (already applied) stay logged.
SCHEMA = """
CREATE TABLE IF NOT EXISTS date_fixes (
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

    def set_cert_date(self, cert, ds, new_date, new_year, old_date, old_year, rule, raw_date=None):
        """Move a certificate and all persons on it to new_date/new_year.
        raw_date: the unreadable date text the persons still carry (precision 'invalid')."""
        c = self.conn
        if old_date is not None or new_date is not None:
            c.execute('UPDATE certificates SET event_date = ? WHERE certificate_id = ?', (new_date, cert))
            self.note('certificates', cert, cert, ds, 'event_date', old_date if raw_date is None else raw_date,
                      new_date, rule)
        c.execute('UPDATE certificates SET event_year = ? WHERE certificate_id = ?', (new_year, cert))
        self.note('certificates', cert, cert, ds, 'event_year', old_year, new_year, rule)
        if raw_date is not None:
            c.execute("UPDATE certificates SET date_precision = 'day' WHERE certificate_id = ?", (cert,))
        for pid, ev_date, ev_year, b_year in c.execute(
                'SELECT person_id, event_date, event_year, birth_year FROM persons WHERE certificate_id = ?',
                (cert,)).fetchall():
            fixed_raw = raw_date is not None and ev_date == raw_date
            nd = new_date if ev_date == old_date or fixed_raw else ev_date
            ny = new_year if ev_year == old_year or fixed_raw else ev_year
            if fixed_raw:
                c.execute("UPDATE persons SET date_precision = 'day' WHERE person_id = ?", (pid,))
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
        # an unreadable year leaves the certificate without a date; the persons keep the raw text
        rows = c.execute("""SELECT certificate_id, collection, address_text, event_date, event_year,
                                   (SELECT p.event_date FROM persons p WHERE p.certificate_id = c.certificate_id
                                       AND p.date_precision = 'invalid' AND p.event_date IS NOT NULL LIMIT 1)
                              FROM certificates c WHERE source_dataset = '12-migratie-datasets'
                               AND (event_year IS NOT NULL OR date_precision = 'invalid')""").fetchall()

        def plausible(coll, y):
            return y is not None and FIRST_MIGRATION_YEAR.get(coll, 0) <= y < LAST_MIGRATION_YEAR

        by_ship = defaultdict(Counter)
        for cert, coll, ship, d, y, raw in rows:
            if ship and d and plausible(coll, y):
                by_ship[(coll, ship)][d] += 1
        n = 0
        for cert, coll, ship, d, y, raw in rows:
            if plausible(coll, y):
                continue
            if y is None and not raw:
                continue
            bad = d or raw
            dates = by_ship.get((coll, ship))
            if not dates:
                self.log(f'    migration {cert}: date {bad}, ship {ship!r} unknown; left as is')
                continue
            same_day = Counter({k: v for k, v in dates.items() if bad and k[4:] == bad[-6:]})
            new_date, _ = (same_day or dates).most_common(1)[0]
            self.set_cert_date(cert, '12-migratie-datasets', new_date, int(new_date[:4]), d, y,
                               f'arrival date of the other passengers of ship {ship!r}',
                               raw_date=raw if y is None else None)
            n += 1
        return n

    def migration_deaths(self):
        c = self.conn
        n = 0
        for pid, cert, d_date, d_year, arrival in c.execute(
                """SELECT p.person_id, p.certificate_id, p.death_date, p.death_year, c.event_year
                     FROM persons p JOIN certificates c USING (certificate_id)
                    WHERE p.source_dataset = '12-migratie-datasets' AND c.event_year IS NOT NULL
                      AND p.death_date IS NOT NULL""").fetchall():
            y = d_year or year_of(d_date)
            if y is None or y >= arrival - DEATH_GAP:
                continue
            ny = other_century(y, arrival, min(arrival + 90, LAST_DEATH_YEAR))
            if not ny:
                continue
            nd = replace_year(d_date, y, ny)
            c.execute('UPDATE persons SET death_date = ?, death_year = ? WHERE person_id = ?', (nd, ny, pid))
            rule = f'death long before the arrival ({arrival}); other century'
            self.note('persons', pid, cert, '12-migratie-datasets', 'death_date', d_date, nd, rule)
            self.note('persons', pid, cert, '12-migratie-datasets', 'death_year', d_year, ny, rule)
            n += 1
        return n

    def civil(self):
        c = self.conn
        n = 0
        rows = c.execute(
            """SELECT certificate_id, register, cert_date, event_date, event_year, record_type, inventory_number
                 FROM certificates WHERE source_dataset = '13-civil' AND event_year IS NOT NULL""").fetchall()
        by_inventory = defaultdict(Counter)
        for cert, reg, cert_date, d, y, rtype, inv in rows:
            if inv and y >= FIRST_CIVIL_YEAR:
                by_inventory[(rtype, inv)][y] += 1
        for cert, reg, cert_date, d, y, rtype, inv in rows:
            rng = register_range(reg)
            if rng:
                if rng[0] <= y <= rng[1]:
                    continue
                ny = other_century(y, *rng)
                rule = f'year outside its register {reg!r}'
            else:
                if y >= FIRST_CIVIL_YEAR:
                    continue
                years = by_inventory.get((rtype, inv))
                ny = None
                if years:
                    top, k = years.most_common(1)[0]
                    if k >= INVENTORY_SHARE * sum(years.values()):
                        ny = top
                rule = f'year of the other certificates in inventory number {inv}'
            if not ny:
                if not rng:
                    self.log(f'    civil {cert}: year {y}, no common year in inventory {inv}; left as is')
                continue
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
    counts = {'migration records': f.migration(), 'civil records': f.civil(), 'census persons': f.census(),
              'migration deaths': f.migration_deaths()}
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
        if field in ('event_year', 'birth_year', 'death_year') and (tbl == 'certificates' or field != 'event_year'):
            seen[(ds, field, old, new, rule)] += 1
    for (ds, field, old, new, rule), k in sorted(seen.items(), key=lambda kv: tuple(map(str, kv[0]))):
        print(f'  {ds:22} {field:10} {old} -> {new}  x{k}  ({rule})')
    print('\nAll changes are in the table date_fixes. Run link_places.py again afterwards.')
