#!/usr/bin/env python3
"""Zero-dependency CLI search over the unified civil-records SQLite database.

Searches names across ALL civil-status datasets and roles at once (death
certificates, birth certificates, recognitions, district births, marriages),
using SQLite FTS5 for prefix/wildcard search plus Soundex and substring
fallbacks for fuzzy matching.

Examples
--------
    # prefix search across every dataset/role
    python3 scripts/civil/search.py jan de vries

    # only witnesses, in a given year range
    python3 scripts/civil/search.py --role witness --year 1880 jan

    # fuzzy / phonetic (tolerates spelling drift)
    python3 scripts/civil/search.py --fuzzy badloe

    # free-text substring anywhere in the name
    python3 scripts/civil/search.py --like olivieira

    # filter by dataset and place, emit JSON
    python3 scripts/civil/search.py --dataset 13-huwelijken --place paramaribo --json jan

    # database summary
    python3 scripts/civil/search.py --stats
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
import unicodedata

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_DB = os.path.join(REPO_ROOT, 'civil_records.db')


def strip_diacritics(text: str) -> str:
    return ''.join(ch for ch in unicodedata.normalize('NFKD', text) if not unicodedata.combining(ch))


def normalize(text: str) -> str:
    return ' '.join(strip_diacritics(text).lower().split())


def soundex(name: str) -> str:
    letters = re.sub(r'[^a-z]', '', strip_diacritics(name).lower())
    if not letters:
        return ''
    codes = {'b': '1', 'f': '1', 'p': '1', 'v': '1',
             'c': '2', 'g': '2', 'j': '2', 'k': '2', 'q': '2', 's': '2', 'x': '2', 'z': '2',
             'd': '3', 't': '3', 'l': '4', 'm': '5', 'n': '5', 'r': '6'}
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


def fts_match(terms, column: str | None = None) -> str:
    parts = []
    for term in terms:
        safe = term.replace('"', '')
        if column:
            parts.append(f'{column}:"{safe}"*')
        else:
            parts.append(f'"{safe}"*')
    return ' AND '.join(parts)


def build_filters(args, params):
    where = []
    if args.role:
        where.append(f"p.role IN ({','.join('?' * len(args.role))})")
        params.extend(args.role)
    if args.dataset:
        where.append(f"p.source_dataset IN ({','.join('?' * len(args.dataset))})")
        params.extend(args.dataset)
    if args.sex:
        where.append('p.sex = ?')
        params.append(args.sex)
    if args.year:
        where.append('p.event_year = ?')
        params.append(args.year)
    if args.from_year:
        where.append('p.event_year >= ?')
        params.append(args.from_year)
    if args.to_year:
        where.append('p.event_year <= ?')
        params.append(args.to_year)
    if args.place:
        where.append('lower(c.cert_place) LIKE ?')
        params.append(f'%{args.place.lower()}%')
    return (' AND ' + ' AND '.join(where)) if where else ''


def run_query(conn, args, mode):
    terms = [normalize(t) for t in args.terms if normalize(t)]
    params = []
    joins = """FROM persons p
               JOIN certificates c ON c.certificate_id = p.certificate_id"""
    select = """SELECT p.person_id, p.full_name, p.given_name, p.name_prefix, p.surname,
                       p.role, p.role_index, p.source_dataset, p.collection, p.register,
                       p.sex, p.age, p.occupation, p.place, p.event_date, p.event_year,
                       c.item_id, c.cert_date, c.cert_place, p.name_norm, p.name_soundex"""

    filters = build_filters(args, params)

    if mode == 'fts' and terms:
        fts = fts_match(terms, args.field)
        sql = f"""{select}
                  {joins}
                  JOIN persons_fts f ON f.rowid = p.person_id
                  WHERE persons_fts MATCH ?{filters}
                  ORDER BY bm25(persons_fts), p.surname
                  LIMIT ?"""
        params = [fts, *params, args.limit]
    elif mode == 'like' and terms:
        like = '%' + ' '.join(terms) + '%'
        sql = f"""{select}
                  {joins}
                  WHERE p.name_norm LIKE ?{filters}
                  ORDER BY p.surname, p.given_name
                  LIMIT ?"""
        params = [like, *params, args.limit]
    elif mode == 'soundex' and terms:
        # phonetically match the query (usually a surname) against stored codes
        codes = [soundex(t) for t in terms]
        clauses = ' OR '.join('p.name_soundex = ?' for _ in codes)
        sql = f"""{select}
                  {joins}
                  WHERE ({clauses}){filters}
                  ORDER BY p.surname, p.given_name
                  LIMIT ?"""
        params = [*codes, *params, args.limit]
    else:
        sql = f"""{select}
                  {joins}
                  WHERE 1=1{filters}
                  ORDER BY p.source_dataset, p.surname
                  LIMIT ?"""
        params = [*params, args.limit]

    return conn.execute(sql, params).fetchall()


def print_rows(rows, total_hint=None):
    if not rows:
        print('no matches')
        return
    header = f'{"name":<32} {"role":<12} {"dataset":<16} {"date":<11} {"place":<24} {"item/scan":<34}'
    print(header)
    print('-' * len(header))
    for row in rows:
        (_, full_name, given, prefix, surname, role, role_index, dataset, collection,
         register, sex, age, occupation, place, event_date, event_year, item_id,
         cert_date, cert_place, _, _) = row
        name = full_name or ' '.join(filter(None, [given, prefix, surname])) or '(unnamed)'
        role_label = role + (str(role_index) if role_index else '')
        date = event_date or cert_date or ''
        loc = (cert_place or place or '')[:24]
        print(f'{name[:32]:<32} {role_label[:12]:<12} {dataset[:16]:<16} {date[:11]:<11} {loc:<24} {str(item_id or "")[:34]:<34}')
    if total_hint:
        print(f'\n{len(rows)} row(s) shown (limit {total_hint}).')


def print_stats(conn):
    print('Unified civil-records database')
    print('=' * 44)
    for table in ('certificates', 'persons', 'relations', 'locations', 'annotations'):
        count = conn.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]
        print(f'  {table:<14} {count:>10,}')
    print('\n  persons per dataset:')
    for name, count in conn.execute(
            'SELECT source_dataset, COUNT(*) FROM persons GROUP BY 1 ORDER BY 2 DESC'):
        print(f'    {name:<18} {count:>9,}')
    print('\n  certificates per collection/register:')
    for collection, register, count in conn.execute(
            'SELECT collection, register, COUNT(*) FROM certificates GROUP BY 1,2 ORDER BY 3 DESC'):
        print(f'    {collection:<22} {register or "-":<20} {count:>7,}')
    named = conn.execute('SELECT COUNT(*) FROM persons WHERE name_norm IS NOT NULL').fetchone()[0]
    print(f'\n  named persons:   {named:,}')
    print(f'  role-only rows:  {conn.execute("SELECT COUNT(*) FROM persons WHERE name_norm IS NULL").fetchone()[0]:,}')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('terms', nargs='*', help='name terms (all must match)')
    parser.add_argument('--db', default=DEFAULT_DB)
    parser.add_argument('--role', action='append', help='filter by role (repeatable)')
    parser.add_argument('--dataset', action='append', help='filter by source_dataset (repeatable)')
    parser.add_argument('--sex')
    parser.add_argument('--year', type=int)
    parser.add_argument('--from-year', type=int)
    parser.add_argument('--to-year', type=int)
    parser.add_argument('--place', help='filter on certificate place')
    parser.add_argument('--field', choices=['full_name', 'given_name', 'surname', 'alias'],
                        help='restrict FTS match to one name column')
    parser.add_argument('--fuzzy', action='store_true',
                        help='fall back to substring then Soundex when prefix finds nothing')
    parser.add_argument('--like', action='store_true', help='force substring search')
    parser.add_argument('--limit', type=int, default=25)
    parser.add_argument('--json', action='store_true')
    parser.add_argument('--stats', action='store_true')
    args = parser.parse_args(argv)

    if not os.path.exists(args.db):
        sys.exit(f'database not found: {args.db}\nrun: python3 scripts/civil/build_db.py')

    conn = sqlite3.connect(args.db)
    conn.row_factory = None

    if args.stats:
        print_stats(conn)
        return 0

    if not args.terms:
        parser.error('provide at least one search term (or --stats)')

    import time
    started = time.perf_counter()
    mode = 'like' if args.like else 'fts'
    rows = run_query(conn, args, mode)
    if not rows and not args.like and args.fuzzy:
        rows = run_query(conn, args, 'like')
        mode = 'like(fallback)'
    if not rows and not args.like and args.fuzzy:
        rows = run_query(conn, args, 'soundex')
        mode = 'soundex(fallback)'
    elapsed = (time.perf_counter() - started) * 1000

    if args.json:
        keys = ['person_id', 'full_name', 'given_name', 'name_prefix', 'surname', 'role',
                'role_index', 'source_dataset', 'collection', 'register', 'sex', 'age',
                'occupation', 'place', 'event_date', 'event_year', 'item_id', 'cert_date',
                'cert_place', 'name_norm', 'name_soundex']
        print(json.dumps([dict(zip(keys, row)) for row in rows], ensure_ascii=False, indent=1))
    else:
        print_rows(rows, args.limit)
        print(f'\nmode={mode}  hits={len(rows)}  {elapsed:.0f} ms')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
