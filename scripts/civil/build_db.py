#!/usr/bin/env python3
"""Build a unified, searchable local SQLite database of Surinamese civil-status records.

Sources
-------
* ``02-death``      Suriname Death Certificates 1845-1915 (flat table)
* ``03-birth``      Paramaribo Birth Certificates 1828-1921 (flat table)
* ``13-erkenningen``    Recognitions (relational "plat" tables)
* ``13-geboorten``      District births 1861-1880
* ``13-huwelijken``     Marriages 1801-1900 (registers X, I, II)

Every person-role cell becomes one row in ``persons``, so a single FTS5 query
searches across all datasets and roles at once.

EMBARGO: the raw folder ``data/13-Civil_records_under_embargo_raw_data`` and
every derived database/export are gitignored and must NEVER be committed.

Zero dependencies: Python stdlib only.

Usage
-----
    python3 scripts/civil/build_db.py [--out civil_records.db] [--quiet]
"""
from __future__ import annotations

import argparse
import csv
import os
import re
import sqlite3
import sys
import time
import unicodedata
from collections import Counter, defaultdict

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DEATH_CSV = os.path.join(
    REPO_ROOT,
    'data/02-death-certificates - Suriname Death Certificates 1845-1915 Version 1.0/Suriname_death_certificates_1845_1915.csv',
)
BIRTH_CSV = os.path.join(
    REPO_ROOT,
    'data/03-birth-certificates - Paramaribo Birth Certificates 1828-1921 Version 1.0/Paramaribo_birth_certificates_V1.0.csv',
)
C13 = os.path.join(REPO_ROOT, 'data/13-Civil_records_under_embargo_raw_data')

NULL_MARKERS = {'', '#', '?', '??', 'onbekend', '-', 'n.v.t.', 'niet vermeld', 'geen'}

# --------------------------------------------------------------------------
# Generic helpers
# --------------------------------------------------------------------------

def strip_diacritics(text: str) -> str:
    decomposed = unicodedata.normalize('NFKD', text)
    return ''.join(ch for ch in decomposed if not unicodedata.combining(ch))


def clean(value):
    """Normalize a cell: strip, collapse whitespace, map null markers to None."""
    if value is None:
        return None
    text = ' '.join(value.split())
    if text.lower() in NULL_MARKERS:
        return None
    return text


def to_int(value):
    if value is None:
        return None
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def normalize_name(*parts) -> str | None:
    joined = ' '.join(p for p in parts if p)
    if not joined:
        return None
    return ' '.join(strip_diacritics(joined).lower().split())


def soundex(name: str) -> str:
    """Compact ASCII Soundex, tolerant of the mixed Dutch/Portuguese corpus."""
    if not name:
        return ''
    letters = re.sub(r'[^a-z]', '', strip_diacritics(name).lower())
    if not letters:
        return ''
    codes = {'b': '1', 'f': '1', 'p': '1', 'v': '1',
             'c': '2', 'g': '2', 'j': '2', 'k': '2', 'q': '2', 's': '2', 'x': '2', 'z': '2',
             'd': '3', 't': '3',
             'l': '4',
             'm': '5', 'n': '5',
             'r': '6'}
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


def parse_date(value):
    """Return (iso_date, year, precision). Handles d-m-yyyy, dd-mm-yyyy, yyyy-mm-dd."""
    if not value:
        return None, None, None
    text = value.strip()
    m = re.match(r'^(\d{4})-(\d{1,2})-(\d{1,2})$', text)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    else:
        m = re.match(r'^(\d{1,2})-(\d{1,2})-(\d{4})$', text)
        if not m:
            m2 = re.search(r'(\d{3,4})', text)
            year = int(m2.group(1)) if m2 else None
            return None, (year if year and 1600 <= year <= 2000 else None), 'partial'
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if not (1600 <= y <= 2000):
        return text, None, 'invalid'
    iso = f'{y:04d}-{mo:02d}-{d:02d}'
    return iso, y, 'day'


def sniff_delimiter(path: str) -> str:
    with open(path, encoding='utf-8-sig', newline='') as handle:
        first = handle.readline()
    return ';' if first.count(';') >= first.count(',') else ','


def read_table(path: str):
    """Return (headers, rows) with delimiter/quoting quirks normalized.

    Handles files whose entire header row is wrapped in one pair of quotes.
    """
    delimiter = sniff_delimiter(path)
    with open(path, encoding='utf-8-sig', newline='') as handle:
        raw_lines = [line for line in handle.read().splitlines() if line.strip()]
    if not raw_lines:
        return [], []
    body = '\n'.join(raw_lines)
    table = list(csv.reader(body.splitlines(), delimiter=delimiter))
    # Quirk: single quoted field hiding a delimited row (``"a";"b"``).
    if table and len(table[0]) == 1 and delimiter in table[0][0]:
        # Re-parsing with the same quoting returns the same single field, so strip
        # the outer quotes (and un-double inner ones) before splitting.
        unwrapped = []
        for ln in body.splitlines():
            s = ln.strip()
            unwrapped.append(s[1:-1].replace('""', '"') if len(s) >= 2 and s[0] == s[-1] == '"' else ln)
        table = list(csv.reader(unwrapped, delimiter=delimiter))
    headers = [h.strip().strip('"').strip() for h in table[0]]
    rows = []
    for raw in table[1:]:
        if len(raw) != len(headers):
            # pad/truncate to header width; memo fields can carry stray delimiters
            raw = (raw + [None] * len(headers))[: len(headers)]
        rows.append({headers[i]: (raw[i] or '').strip() for i in range(len(headers))})
    return headers, rows


def parse_column(name: str):
    """Split a role column into (prefix, canonical_suffix, index).

    ``parent_fname_1`` -> ('parent', 'given_name', 1); ``moth_sname`` ->
    ('moth', 'surname', None). Returns None for unrelated columns.
    """
    lowered = name.lower()
    if lowered in ('itemid', 'id', 'folio', 'folio1', 'folio2', 'cert_date', 'cert_place',
                   'cert_location', 'cert_type', 'cert_excerpt', 'release', 'notes_all',
                   'original_scanid', 'inventory_number', 'projectid', 'translation',
                   'translation_other', 'translation_comment', 'identifier', 'user_id',
                   'timestamp', 'text', 'status', 'scanid', 'scanimgurl', 'commentaar',
                   'projecttype', 'userid'):
        return None
    parts = lowered.split('_')
    index = None
    if parts and parts[-1].isdigit():
        index = int(parts[-1])
        parts = parts[:-1]
    for suffix, canon in SUFFIX_CANON:
        suffix_parts = suffix.split('_')
        if len(parts) > len(suffix_parts) and parts[-len(suffix_parts):] == suffix_parts:
            prefix = '_'.join(parts[: -len(suffix_parts)])
            return prefix, canon, index
    return None


# Longest-first so ``sig_other`` wins over ``other``.
SUFFIX_CANON = [
    ('sig_other', 'sig_other'),
    ('otherinfo', 'other_info'),
    ('other_info', 'other_info'),
    ('birthplace', 'birthplace'),
    ('birth_place', 'birthplace'),
    ('bdate_age', 'age'),
    ('death_date', 'death_date'),
    ('prev_owner', 'prev_owner'),
    ('reason_other', 'reason_other'),
    ('custody_of', 'custody_of'),
    ('relation', 'relation'),
    ('relation_other', 'relation_other'),
    ('fname', 'given_name'),
    ('sname', 'surname'),
    ('prefix', 'name_prefix'),
    ('alias', 'alias'),
    ('place', 'place'),
    ('dplace', 'death_place'),
    ('reason', 'reason'),
    ('alive', 'alive'),
    ('type', 'type'),
    ('ref', 'ref'),
    ('mother', 'mother_ref'),
    ('inf', 'info'),
    ('occ', 'occupation'),
    ('age', 'age'),
    ('sex', 'sex'),
    ('sig', 'sig'),
    ('cust', 'custodian_ref'),
    ('other', 'other_info'),
]

PERSON_FIELDS = (
    'given_name', 'name_prefix', 'surname', 'alias', 'sex', 'age',
    'occupation', 'birthplace', 'place', 'other_info', 'sig', 'sig_other',
    'relation', 'alive', 'prev_owner', 'type', 'info', 'ref',
)

# --------------------------------------------------------------------------
# Person extraction
# --------------------------------------------------------------------------

def extract_persons(row, specs, base, accent_role=None):
    """Yield person dicts from a row given [(role, prefix, indexed, override)].

    ``override`` maps canonical field -> explicit column name (for irregular
    tables such as erkenningen/children where the mother lives alongside).
    """
    persons = []
    for spec in specs:
        role, prefix = spec['role'], spec['prefix']
        indexed = spec.get('indexed', False)
        override = spec.get('override', {})
        buckets = defaultdict(dict)

        if override:
            buckets[None] = {}
            for canon, column in override.items():
                value = clean(row.get(column))
                if value:
                    buckets[None][canon] = value
        else:
            for column, value in row.items():
                parsed = parse_column(column)
                if not parsed:
                    continue
                col_prefix, canon, index = parsed
                if col_prefix != prefix:
                    continue
                if indexed and index is None:
                    continue
                if not indexed and index is not None:
                    continue
                cleaned = clean(value)
                if cleaned:
                    buckets[index][canon] = cleaned

        for index, values in sorted(buckets.items(), key=lambda kv: (kv[0] is None, kv[0])):
            if not any(values.get(f) for f in ('given_name', 'name_prefix', 'surname', 'alias')):
                # keep non-name roles only if they carry some identifying content
                if not any(values.values()):
                    continue
            person = {field: values.get(field) for field in PERSON_FIELDS}
            person['role'] = role
            person['role_index'] = index
            person['raw_prefix'] = prefix
            person['full_name'] = ' '.join(
                p for p in (person.get('given_name'), person.get('name_prefix'), person.get('surname')) if p
            ) or None
            person['name_norm'] = normalize_name(person.get('given_name'), person.get('name_prefix'), person.get('surname'))
            person['name_soundex'] = soundex(person.get('surname') or person.get('given_name') or '')
            if accent_role and index is not None:
                person['role'] = f'{accent_role}{index}'
            persons.append(person)
    return persons


DEATH_SPECS = [
    {'role': 'deceased', 'prefix': 'dec'},
    {'role': 'informant', 'prefix': 'inf'},
    {'role': 'parent', 'prefix': 'parent', 'indexed': True},
    {'role': 'spouse', 'prefix': 'spouse', 'indexed': True},
    {'role': 'witness', 'prefix': 'witn', 'indexed': True},
]
BIRTH_SPECS = [
    {'role': 'child', 'prefix': 'child'},
    {'role': 'mother', 'prefix': 'moth'},
    {'role': 'father', 'prefix': 'fath'},
    {'role': 'informant', 'prefix': 'inf'},
    {'role': 'witness', 'prefix': 'witn', 'indexed': True},
]
GEBOORTE13_SPECS = [
    {'role': 'child', 'prefix': 'child'},
    {'role': 'mother', 'prefix': 'moth'},
    {'role': 'father', 'prefix': 'fath'},
    {'role': 'informant', 'prefix': 'inf'},
]
WITNESS_SPECS = [{'role': 'witness', 'prefix': 'witn'}]
COMPARANT_SPECS = [{'role': 'declarant', 'prefix': 'inf'}]
ERK_CHILD_SPECS = [
    {'role': 'child', 'prefix': 'child'},
    {'role': 'mother', 'prefix': 'mother',
     'override': {'given_name': 'mother_fname', 'name_prefix': 'mother_prefix',
                  'surname': 'mother_sname', 'death_date': 'mother_death_date',
                  'death_place': 'moth_dplace', 'sig': 'moth_sig',
                  'sig_other': 'moth_sig_other', 'info': 'mother_inf'}},
]
MARRIAGE_SPECS = [{'role': 'groom', 'prefix': 'groom'}, {'role': 'bride', 'prefix': 'bride'}]
GPARENT_SPECS = [{'role': 'parent_groom', 'prefix': 'gparent'}]
BPARENT_SPECS = [{'role': 'parent_bride', 'prefix': 'bparent'}]
MCHILD_SPECS = [{'role': 'child', 'prefix': 'child'}]
CUSTODIAN_SPECS = [
    {'role': 'custodian', 'prefix': 'cust'},
    {'role': 'custodian_parent', 'prefix': 'bparent'},
]


# --------------------------------------------------------------------------
# Database schema
# --------------------------------------------------------------------------

SCHEMA = """
DROP TABLE IF EXISTS persons_fts;
DROP TABLE IF EXISTS persons;
DROP TABLE IF EXISTS relations;
DROP TABLE IF EXISTS certificates;
DROP TABLE IF EXISTS locations;
DROP TABLE IF EXISTS annotations;

CREATE TABLE certificates (
  certificate_id INTEGER PRIMARY KEY,
  source_dataset TEXT NOT NULL,
  collection     TEXT NOT NULL,
  register       TEXT,
  item_id        TEXT,
  folio          TEXT,
  cert_date      TEXT,
  cert_year      INTEGER,
  cert_date_precision TEXT,
  cert_place     TEXT,
  cert_location  TEXT,
  cert_type      TEXT,
  source_file    TEXT,
  dup_count      INTEGER DEFAULT 0
);

CREATE TABLE persons (
  person_id      INTEGER PRIMARY KEY,
  certificate_id INTEGER NOT NULL REFERENCES certificates(certificate_id),
  source_dataset TEXT NOT NULL,
  collection     TEXT NOT NULL,
  register       TEXT,
  item_id        TEXT,
  role           TEXT NOT NULL,
  role_index     INTEGER,
  given_name     TEXT,
  name_prefix    TEXT,
  surname        TEXT,
  alias          TEXT,
  full_name      TEXT,
  name_norm      TEXT,
  name_soundex   TEXT,
  sex            TEXT,
  age            TEXT,
  occupation     TEXT,
  birthplace     TEXT,
  place          TEXT,
  other_info     TEXT,
  sig            TEXT,
  sig_other      TEXT,
  literate       INTEGER,
  relation       TEXT,
  alive          TEXT,
  prev_owner     TEXT,
  event_date     TEXT,
  event_year     INTEGER,
  raw_prefix     TEXT,
  source_file    TEXT
);

CREATE TABLE relations (
  relation_id    INTEGER PRIMARY KEY,
  certificate_id INTEGER NOT NULL REFERENCES certificates(certificate_id),
  relation_type  TEXT NOT NULL,
  from_person    INTEGER REFERENCES persons(person_id),
  to_person      INTEGER REFERENCES persons(person_id),
  detail         TEXT,
  source_file    TEXT
);

CREATE TABLE locations (
  location_id INTEGER PRIMARY KEY,
  certificate_id INTEGER NOT NULL REFERENCES certificates(certificate_id),
  raw_text TEXT NOT NULL,
  location_norm TEXT,
  field_origin TEXT,
  source_dataset TEXT
);

CREATE TABLE annotations (
  annotation_id INTEGER PRIMARY KEY,
  item_id    TEXT,
  user_id    TEXT,
  timestamp  TEXT,
  text       TEXT,
  status     TEXT,
  source_file TEXT
);
"""

INDEXES = """
CREATE INDEX idx_cert_item   ON certificates(item_id);
CREATE INDEX idx_cert_ds     ON certificates(source_dataset, cert_year);
CREATE INDEX idx_pers_cert   ON persons(certificate_id);
CREATE INDEX idx_pers_norm   ON persons(name_norm);
CREATE INDEX idx_pers_sdx    ON persons(name_soundex);
CREATE INDEX idx_pers_role   ON persons(role, source_dataset);
CREATE INDEX idx_pers_item   ON persons(item_id);
CREATE INDEX idx_ann_item    ON annotations(item_id);
CREATE INDEX idx_loc_norm    ON locations(location_norm);
CREATE VIRTUAL TABLE persons_fts USING fts5(
  full_name, given_name, surname, alias, place, occupation,
  content='persons', content_rowid='person_id',
  tokenize="unicode61 remove_diacritics 2"
);
"""


def literate_flag(sig, sig_other):
    text = ' '.join(filter(None, [sig, sig_other])).lower()
    if not text:
        return None
    if 'niet ondertekend' in text or 'analfabeet' in text or 'illiteracy' in text:
        return 0
    if 'ondertekend' in text or 'signed' in text:
        return 1
    return None


class Builder:
    def __init__(self, conn: sqlite3.Connection, quiet: bool = False):
        self.conn = conn
        self.quiet = quiet
        self.stats = Counter()
        self.unmapped_prefixes = Counter()

    def log(self, message: str):
        if not self.quiet:
            print(message, flush=True)

    def add_certificate(self, *, source_dataset, collection, register, item_id,
                        folio, cert_date, cert_place, cert_location, cert_type,
                        source_file, raw, person_specs):
        iso, year, precision = parse_date(cert_date)
        cur = self.conn.execute(
            """INSERT INTO certificates
               (source_dataset, collection, register, item_id, folio, cert_date,
                cert_year, cert_date_precision, cert_place, cert_location, cert_type, source_file)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (source_dataset, collection, register, item_id, folio, cert_date,
             year, precision, cert_place, cert_location, cert_type, source_file),
        )
        certificate_id = cur.lastrowid
        self.stats['certificates'] += 1

        persons = extract_persons(raw, person_specs, base=None)
        person_ids = {}
        for person in persons:
            person_id = self.add_person(certificate_id, source_dataset, collection,
                                        register, item_id, person, iso, year, source_file)
            person_ids[(person['role'], person['role_index'])] = person_id
            self.stats['persons'] += 1
        self.add_relations(certificate_id, source_dataset, person_ids, source_file)
        self.add_locations(certificate_id, source_dataset, raw, source_file)
        return certificate_id

    def add_person(self, certificate_id, source_dataset, collection, register,
                   item_id, person, event_date, event_year, source_file):
        cur = self.conn.execute(
            """INSERT INTO persons
               (certificate_id, source_dataset, collection, register, item_id, role, role_index,
                given_name, name_prefix, surname, alias, full_name, name_norm, name_soundex,
                sex, age, occupation, birthplace, place, other_info, sig, sig_other, literate,
                relation, alive, prev_owner, event_date, event_year, raw_prefix, source_file)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (certificate_id, source_dataset, collection, register, item_id,
             person['role'], person['role_index'], person.get('given_name'),
             person.get('name_prefix'), person.get('surname'), person.get('alias'),
             person.get('full_name'), person.get('name_norm'), person.get('name_soundex'),
             person.get('sex'), person.get('age'), person.get('occupation'),
             person.get('birthplace'), person.get('place'), person.get('other_info'),
             person.get('sig'), person.get('sig_other'),
             literate_flag(person.get('sig'), person.get('sig_other')),
             person.get('relation'), person.get('alive'), person.get('prev_owner'),
             event_date, event_year, person.get('raw_prefix'), source_file),
        )
        return cur.lastrowid

    def add_relations(self, certificate_id, source_dataset, person_ids, source_file):
        def ref(role, index=None):
            return person_ids.get((role, index))

        pairs = []
        child = ref('child')
        if child:
            for role in ('mother', 'father'):
                other = ref(role)
                if other:
                    pairs.append(('parent-child', other, child, role))
        groom, bride = ref('groom'), ref('bride')
        # parents of the groom/bride are parents of the spouses, not of a child
        for role, spouse in (('parent_groom', groom), ('parent_bride', bride)):
            other = ref(role)
            if other and spouse:
                pairs.append(('parent-child', other, spouse, role))
        if groom and bride:
            pairs.append(('spouse', groom, bride, 'groom-bride'))
        deceased = ref('deceased')
        if deceased:
            for index in range(1, 5):
                spouse = ref('spouse', index)
                if spouse:
                    pairs.append(('spouse', deceased, spouse, f'spouse{index}'))
            for index in range(1, 3):
                parent = ref('parent', index)
                if parent:
                    pairs.append(('parent-child', parent, deceased, f'parent{index}'))
        for index in range(1, 3):
            witness = ref('witness', index)
            if witness and (deceased or child or groom):
                pairs.append(('witness', witness, deceased or child or groom, f'witn{index}'))
        declarant = ref('declarant')
        if declarant and child:
            pairs.append(('declarant', declarant, child, 'declarant'))

        for relation_type, from_id, to_id, detail in pairs:
            self.conn.execute(
                """INSERT INTO relations (certificate_id, relation_type, from_person, to_person, detail, source_file)
                   VALUES (?,?,?,?,?,?)""",
                (certificate_id, relation_type, from_id, to_id, detail, source_file),
            )
            self.stats['relations'] += 1

    def add_locations(self, certificate_id, source_dataset, raw, source_file):
        for column, value in raw.items():
            lowered = column.lower()
            if not (lowered.endswith('place') or lowered.endswith('birthplace')
                    or lowered.endswith('location')):
                continue
            cleaned = clean(value)
            if not cleaned:
                continue
            self.conn.execute(
                """INSERT INTO locations (certificate_id, raw_text, location_norm, field_origin, source_dataset)
                   VALUES (?,?,?,?,?)""",
                (certificate_id, cleaned, normalize_name(cleaned), column, source_dataset),
            )
            self.stats['locations'] += 1

    def add_annotation(self, *, item_id, user_id, timestamp, text, status, source_file):
        self.conn.execute(
            """INSERT INTO annotations (item_id, user_id, timestamp, text, status, source_file)
               VALUES (?,?,?,?,?,?)""",
            (item_id, user_id, timestamp, text, status, source_file),
        )
        self.stats['annotations'] += 1


# --------------------------------------------------------------------------
# Dataset loaders
# --------------------------------------------------------------------------

def load_flat(builder: Builder, path: str, source_dataset: str, collection: str, specs):
    _, rows = read_table(path)
    source_file = os.path.relpath(path, REPO_ROOT)
    seen = set()
    dropped = 0
    for row in rows:
        key = tuple(sorted(row.items()))
        if key in seen:
            dropped += 1
            continue
        seen.add(key)
        builder.add_certificate(
            source_dataset=source_dataset, collection=collection, register=None,
            item_id=clean(row.get('original_scanid')) or clean(row.get('id')),
            folio=clean(row.get('folio')),
            cert_date=clean(row.get('cert_date')),
            cert_place=clean(row.get('cert_place')),
            cert_location=None, cert_type=None,
            source_file=source_file, raw=row, person_specs=specs,
        )
    builder.stats['exact_duplicate_rows_dropped'] += dropped
    builder.log(f'  {source_dataset}: {len(rows)} rows ({dropped} exact dupes dropped)')


def load_collection(builder: Builder, folder: str, source_dataset: str, collection: str,
                    register: str | None, master_file: str, master_specs,
                    side_tables):
    """Load a master "nonrepeatable-fields" table plus its side tables."""
    master_path = os.path.join(folder, master_file)
    if not os.path.exists(master_path):
        return
    source_file = os.path.relpath(master_path, REPO_ROOT)
    _, master_rows = read_table(master_path)

    side_data = {}
    for name, specs in side_tables:
        path = os.path.join(folder, name)
        if os.path.exists(path):
            _, rows = read_table(path)
            # Pre-index by itemID so master×side stays O(master + side).
            by_item = defaultdict(list)
            for side_row in rows:
                by_item[clean(side_row.get('itemID'))].append(side_row)
            side_data[name] = (os.path.relpath(path, REPO_ROOT), rows, specs, by_item)

    seen = set()
    dropped = 0
    for row in master_rows:
        key = tuple(sorted(row.items()))
        if key in seen:
            dropped += 1
            continue
        seen.add(key)
        item_id = clean(row.get('itemID'))
        folio = clean(row.get('folio')) or clean(row.get('folio1'))
        certificate_id = builder.add_certificate(
            source_dataset=source_dataset, collection=collection, register=register,
            item_id=item_id, folio=folio,
            cert_date=clean(row.get('cert_date')),
            cert_place=clean(row.get('cert_place')),
            cert_location=clean(row.get('cert_location')),
            cert_type=clean(row.get('cert_type')),
            source_file=source_file, raw=row, person_specs=master_specs,
        )
        for name, (side_file, side_rows, specs, by_item) in side_data.items():
            for side_row in by_item.get(item_id, ()):
                for person in extract_persons(side_row, specs, base=None):
                    builder.add_person(certificate_id, source_dataset, collection, register,
                                       item_id, person, None, None, side_file)
                    builder.stats['persons'] += 1
    builder.stats['exact_duplicate_rows_dropped'] += dropped
    builder.log(f'  {source_dataset}/{register or collection}: {len(master_rows)} master rows '
                f'({dropped} dupes), {sum(len(v[1]) for v in side_data.values())} side rows')


def load_comments(builder: Builder, folder: str, pattern_filter=None):
    if not os.path.isdir(folder):
        return
    for name in sorted(os.listdir(folder)):
        if not name.endswith('.csv'):
            continue
        if pattern_filter and not pattern_filter(name):
            continue
        path = os.path.join(folder, name)
        headers, rows = read_table(path)
        source_file = os.path.relpath(path, REPO_ROOT)
        for row in rows:
            lowered = {k.lower(): v for k, v in row.items()}
            item_id = clean(lowered.get('identifier')) or clean(lowered.get('scanid'))
            text = clean(lowered.get('commentaar')) or clean(lowered.get('text'))
            if not item_id and not text:
                continue
            builder.add_annotation(
                item_id=item_id,
                user_id=clean(lowered.get('user_id')) or clean(lowered.get('userid')),
                timestamp=clean(lowered.get('timestamp')),
                text=text,
                status=clean(lowered.get('status')) or clean(lowered.get('projecttype')),
                source_file=source_file,
            )
        builder.log(f'  annotations {name}: {len(rows)}')


def load_folder13(builder: Builder):
    erk = os.path.join(C13, 'erkenningen')
    load_collection(builder, erk, '13-erkenningen', 'erkenningen', None,
                    'nonrepeatable-fields-plat.csv', [],
                    [('children-plat.csv', ERK_CHILD_SPECS),
                     ('comparanten-plat.csv', COMPARANT_SPECS),
                     ('witnesses-plat.csv', WITNESS_SPECS)])
    geb = os.path.join(C13, 'Geboorten districten 1861-1880')
    load_collection(builder, geb, '13-geboorten', 'geboorten-districten', '1861-1880',
                    'nonrepeatable-fields-plat.csv', GEBOORTE13_SPECS,
                    [('witnesses-plat.csv', WITNESS_SPECS)])

    huw = os.path.join(C13, 'Huwelijken')
    registers = [
        ('huwelijken X (1801-1846)', 'X', '1801-1846'),
        ('huwelijken I (1846-1880)', 'I', '1846-1880'),
        ('huwelijken II (1881-1900)', 'II', '1881-1900'),
    ]
    for folder_name, register, years in registers:
        load_collection(builder, os.path.join(huw, folder_name), '13-huwelijken',
                        'huwelijken', f'{register} ({years})',
                        'nonrepeatable-fields-plat.csv', MARRIAGE_SPECS,
                        [('parents_groom-plat.csv', GPARENT_SPECS),
                         ('parents_bride-plat.csv', BPARENT_SPECS),
                         ('witnesses-plat.csv', WITNESS_SPECS),
                         ('child-plat.csv', MCHILD_SPECS),
                         ('custodian-plat.csv', CUSTODIAN_SPECS)])
    load_comments(builder, os.path.join(huw, 'comments huwelijken'))
    load_comments(builder, geb, lambda n: 'commentaren' in n)


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

def build(out_path: str, quiet: bool = False):
    started = time.time()
    if os.path.exists(out_path):
        os.remove(out_path)
    conn = sqlite3.connect(out_path)
    conn.executescript(SCHEMA)
    builder = Builder(conn, quiet=quiet)

    builder.log('Parsing datasets…')
    load_flat(builder, DEATH_CSV, '02-death', 'death-certificates', DEATH_SPECS)
    load_flat(builder, BIRTH_CSV, '03-birth', 'birth-certificates', BIRTH_SPECS)
    load_folder13(builder)

    # dup_count: number of rows sharing the same (source_dataset, item_id).
    # Computed in SQL with an index (a correlated subquery over ~170k rows is slow).
    conn.execute('CREATE INDEX idx_cert_ds_item ON certificates(source_dataset, item_id)')
    conn.execute("""
        UPDATE certificates
           SET dup_count = (
             SELECT COUNT(*) FROM certificates c2
              WHERE c2.source_dataset = certificates.source_dataset
                AND c2.item_id = certificates.item_id
           ) - 1
         WHERE item_id IS NOT NULL AND item_id <> ''
    """)

    builder.log('Building indexes + FTS5…')
    conn.executescript(INDEXES)
    conn.execute("INSERT INTO persons_fts(persons_fts) VALUES('rebuild')")
    conn.commit()

    stats = dict(builder.stats)
    counts = {
        table: conn.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]
        for table in ('certificates', 'persons', 'relations', 'locations', 'annotations')
    }
    per_dataset = conn.execute(
        'SELECT source_dataset, COUNT(*) FROM persons GROUP BY source_dataset ORDER BY 2 DESC'
    ).fetchall()
    per_role = conn.execute(
        'SELECT role, COUNT(*) FROM persons GROUP BY role ORDER BY 2 DESC LIMIT 15'
    ).fetchall()
    per_register = conn.execute(
        'SELECT collection, register, COUNT(*) FROM certificates GROUP BY collection, register ORDER BY 3 DESC'
    ).fetchall()
    conn.execute('VACUUM')
    conn.close()

    size = os.path.getsize(out_path)
    elapsed = time.time() - started
    if not quiet:
        print('\n' + '=' * 62)
        print('Unified civil-records database built')
        print('=' * 62)
        for table, count in counts.items():
            print(f'  {table:<14} {count:>9,}')
        print(f'  exact duplicate rows dropped: {stats.get("exact_duplicate_rows_dropped", 0):,}')
        print(f'  database size:  {size / 1024 / 1024:.1f} MB')
        print(f'  build time:     {elapsed:.1f}s')
        print('\n  persons per dataset:')
        for name, count in per_dataset:
            print(f'    {name:<20} {count:>8,}')
        print('\n  persons per role:')
        for name, count in per_role:
            print(f'    {name:<20} {count:>8,}')
        print('\n  certificates per collection:')
        for collection, register, count in per_register:
            print(f'    {collection:<20} {register or "-":<20} {count:>7,}')
    return counts, size, stats


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', default=os.path.join(REPO_ROOT, 'civil_records.db'))
    parser.add_argument('--quiet', action='store_true')
    args = parser.parse_args()
    build(args.out, quiet=args.quiet)
