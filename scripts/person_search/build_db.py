#!/usr/bin/env python3
"""Build the unified, person-centric Suriname heritage search database.

One SQLite file (``suriname_person_search.db``) holding person attestations from
every person-bearing dataset in the repository (map folders 07/08 excluded):

  02-death, 03-birth, 04-ward-registers, 05-slave-emancipation, 06-almanakken,
  09-volkstelling-1921, 10-volkstelling-1950, 11-madeisu, 12-migratie-datasets,
  13-Civil_records_under_embargo_raw_data

Design follows the approved master person schema: ``sources`` / ``certificates``
/ ``persons`` / ``person_names`` / ``relations`` / ``locations`` /
``group_observations`` / ``annotations`` + FTS5 ``persons_fts``.

EMBARGO / RESTRICTED: raw data in ``12-migratie-datasets`` and
``13-Civil_records_under_embargo_raw_data`` (and every derived DB/export) is
gitignored and must NEVER be committed.

Zero dependencies (Python stdlib only; XLSX read via zipfile + ElementTree).

Usage
-----
    python3 scripts/person_search/build_db.py
    python3 scripts/person_search/build_db.py --out /tmp/x.db --quiet
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import sqlite3
import sys
import time
import unicodedata
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_OUT = os.path.join(REPO_ROOT, 'suriname_person_search.db')

P = lambda *parts: os.path.join(REPO_ROOT, *parts)

DEATH_CSV = P('data/02-death-certificates - Suriname Death Certificates 1845-1915 Version 1.0',
              'Suriname_death_certificates_1845_1915.csv')
BIRTH_CSV = P('data/03-birth-certificates - Paramaribo Birth Certificates 1828-1921 Version 1.0',
              'Paramaribo_birth_certificates_V1.0.csv')
WARD_CSV = P('data/04-ward-registers - Paramaribo Ward Registers 1828-1847', 'WR28-47.csv')
SLAVE_CSV = P('data/05-slave-emancipation - Suriname Slave and Emancipation Registers Dataset Version 1.1',
              'Dataset Suriname Slave and Emancipation Registers Version 1.1.csv')
ALMANAK_CSV = P('data/06-almanakken - Plantations Surinaamse Almanakken',
                'Plantations Surinaamse Almanakken v2.0 (1).csv')
ALMANAK_XLSX = P('data/06-almanakken - Plantations Surinaamse Almanakken', 'disambiguating persons',
                 'standaardisering personen almanakken.xlsx')
CENSUS21_CSV = P('data/09-volkstelling-1921', 'NT00445_VT1921_Aangevuld_kolomnamen.csv')
CENSUS50_TSV = P('data/10-volkstelling-1950', 'vt1950.txt')
CENSUS50_TSV2 = P('data/10-volkstelling-1950', 'vt1950_2.txt')
MADEISU_XLSX = P('data/11-madeisu', 'Brondocument historisch register- DetailsContractarbeiders.xlsx')
MADEISU_PLANT_XLSX = P('data/11-madeisu', 'Brondocument historisch register - Plantages.xlsx')
MIG_HIND = P('data/12-migratie-datasets', 'NT00345_hindostanen.csv')
MIG_CHIN = P('data/12-migratie-datasets', 'NT00347_chinezen.csv')
C13 = P('data/13-Civil_records_under_embargo_raw_data')

NULL_MARKERS = {'', '#', '?', '??', 'onbekend', '-', 'n.v.t.', 'niet vermeld', 'geen',
                'niet van toepassing', 'onbekend.', '#n/a', '<empty>', '"'}

# ---------------------------------------------------------------------------
# Generic helpers
# ---------------------------------------------------------------------------

def strip_diacritics(text: str) -> str:
    return ''.join(ch for ch in unicodedata.normalize('NFKD', text) if not unicodedata.combining(ch))


def clean(value):
    if value is None:
        return None
    text = ' '.join(str(value).split())
    if text.lower() in NULL_MARKERS:
        return None
    return text


def to_int(value):
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def normalize(text) -> str | None:
    if not text:
        return None
    return ' '.join(strip_diacritics(str(text)).lower().split()) or None


def soundex(name: str) -> str:
    letters = re.sub(r'[^a-z]', '', strip_diacritics(name or '').lower())
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


DATE_DMY = re.compile(r'^(\d{1,2})-(\d{1,2})-(\d{4})$')
DATE_ISO = re.compile(r'^(\d{4})-(\d{1,2})-(\d{1,2})$')


def parse_date(value):
    """Return (iso, year, precision)."""
    if not value:
        return None, None, None
    text = str(value).strip()
    m = DATE_ISO.match(text)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    else:
        m = DATE_DMY.match(text)
        if not m:
            m2 = re.search(r'(\d{3,4})', text)
            year = int(m2.group(1)) if m2 else None
            return None, (year if year and 1600 <= year <= 2000 else None), 'partial'
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if not (1600 <= y <= 2000):
        return text, None, 'invalid'
    return f'{y:04d}-{mo:02d}-{d:02d}', y, 'day'


def birth_year_of(value):
    """Extract a plausible 4-digit birth year."""
    if not value:
        return None
    m = re.search(r'(1[5-9]\d\d|20[0-2]\d)', str(value))
    return int(m.group(1)) if m else None


def sniff_delimiter(path: str) -> str:
    opener = io.open
    with opener(path, encoding='utf-8-sig', newline='') as handle:
        first = handle.readline()
    return ';' if first.count(';') >= first.count(',') else ','


def read_table(path: str):
    delimiter = sniff_delimiter(path)
    with open(path, encoding='utf-8-sig', newline='') as handle:
        lines = [line for line in handle.read().splitlines() if line.strip()]
    if not lines:
        return [], []
    table = list(csv.reader(lines, delimiter=delimiter))
    if table and len(table[0]) == 1 and delimiter in table[0][0]:
        table = list(csv.reader(lines, delimiter=delimiter, quotechar='"'))
    header = [h.strip().strip('"') for h in table[0]]
    rows = []
    for raw in table[1:]:
        if len(raw) != len(header):
            raw = (raw + [None] * len(header))[: len(header)]
        rows.append({header[i]: (raw[i] or '').strip() for i in range(len(header))})
    return header, rows


def read_tsv(path: str):
    with open(path, encoding='utf-8-sig', newline='') as handle:
        lines = [line for line in handle.read().splitlines() if line.strip()]
    table = list(csv.reader(lines, delimiter='\t'))
    header = [h.strip() for h in table[0]]
    rows = []
    for raw in table[1:]:
        raw = (raw + [None] * len(header))[: len(header)]
        rows.append({header[i]: (raw[i] or '').strip() for i in range(len(header))})
    return rows


def read_double_encoded_csv(path: str):
    """Read a CSV wrapped in one outer quoting layer (census 1921)."""
    with open(path, encoding='utf-8-sig', newline='') as handle:
        raw = handle.read()
    outer = [r[0] for r in csv.reader(io.StringIO(raw)) if r]
    table = list(csv.reader(io.StringIO('\n'.join(outer))))
    header = [h.strip() for h in table[0]]
    # The 1921 export declares 11 headers but every row carries 12 values;
    # the surplus field is the record UUID.
    surplus = max((len(r) for r in table[1:]), default=len(header)) - len(header)
    header = header + [f'__extra_{i}__' for i in range(max(0, surplus))]
    if surplus >= 1:
        header[-1] = '__uuid__'
    rows = []
    for raw_row in table[1:]:
        values = list(raw_row) + [''] * (len(header) - len(raw_row))
        rows.append({header[i]: values[i].strip() for i in range(len(header))})
    return rows


NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'


def read_xlsx(path: str, sheet: str = 'xl/worksheets/sheet1.xml'):
    with zipfile.ZipFile(path) as archive:
        shared = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            shared = [t.text or '' for t in ET.fromstring(archive.read('xl/sharedStrings.xml')).iter(NS + 't')]
        worksheet = ET.fromstring(archive.read(sheet))
    grid = {}
    for row in worksheet.iter(NS + 'row'):
        for cell in row.iter(NS + 'c'):
            ref = cell.get('r') or ''
            col = ''.join(ch for ch in ref if ch.isalpha())
            index = int(''.join(ch for ch in ref if ch.isdigit()) or 0)
            kind = cell.get('t')
            value_el = cell.find(NS + 'v')
            if kind == 'inlineStr':
                inline = cell.find(NS + 'is')
                value = ''.join(t.text or '' for t in inline.iter(NS + 't')) if inline is not None else ''
            elif value_el is None:
                value = ''
            elif kind == 's':
                value = shared[int(value_el.text)]
            else:
                value = value_el.text or ''
            grid[(index, col)] = value.strip()
    if not grid:
        return []
    max_row = max(r for r, _ in grid)
    header_cols = sorted({c for r, c in grid if r == 1}, key=lambda c: (len(c), c))
    header = [grid.get((1, c), '') for c in header_cols]
    rows = []
    for r in range(2, max_row + 1):
        record = {header[i]: grid.get((r, header_cols[i]), '') for i in range(len(header))}
        if any((v or '').strip() for v in record.values()):
            rows.append(record)
    return rows


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

SCHEMA = """
PRAGMA journal_mode = OFF;
PRAGMA synchronous = OFF;

CREATE TABLE sources (
  source_dataset TEXT PRIMARY KEY,
  title TEXT, license TEXT, embargo INTEGER DEFAULT 0, raw_path TEXT, notes TEXT
);

CREATE TABLE certificates (
  certificate_id INTEGER PRIMARY KEY,
  source_dataset TEXT NOT NULL,
  record_type TEXT NOT NULL,
  collection TEXT, register TEXT, item_id TEXT,
  inventory_number TEXT, folio TEXT, page TEXT,
  certificate_number TEXT, contract_number TEXT, slavenregister_id TEXT,
  registration_number TEXT, series TEXT,
  event_date TEXT, event_year INTEGER, date_precision TEXT,
  cert_date TEXT, cert_place TEXT, cert_location TEXT,
  district TEXT, plantation_name TEXT, ward_code TEXT, address_text TEXT,
  source_file TEXT, dup_count INTEGER DEFAULT 0
);

CREATE TABLE persons (
  person_id INTEGER PRIMARY KEY,
  certificate_id INTEGER NOT NULL,
  source_dataset TEXT NOT NULL,
  given_name TEXT, name_prefix TEXT, surname TEXT, alias TEXT, former_name TEXT,
  full_name TEXT, name_norm TEXT, name_soundex TEXT,
  sex TEXT, age TEXT, age_numeric INTEGER,
  birth_date TEXT, birth_year INTEGER, death_date TEXT, death_year INTEGER,
  event_date TEXT, event_year INTEGER, date_precision TEXT,
  religion TEXT, ethnicity TEXT, origin TEXT, nationality TEXT,
  occupation TEXT, literacy TEXT, literate INTEGER,
  location TEXT, address_text TEXT, ward_code TEXT, district TEXT, plantation_name TEXT,
  registration_number TEXT, contract_number TEXT, slavenregister_id TEXT,
  role TEXT NOT NULL, role_index INTEGER, status TEXT,
  confidence TEXT, raw_prefix TEXT, source_file TEXT
);

CREATE TABLE person_names (
  name_id INTEGER PRIMARY KEY,
  person_id INTEGER NOT NULL,
  kind TEXT NOT NULL, value TEXT, value_norm TEXT, source_file TEXT
);

CREATE TABLE relations (
  relation_id INTEGER PRIMARY KEY,
  certificate_id INTEGER,
  relation_type TEXT NOT NULL,
  from_person INTEGER, to_person INTEGER,
  confidence TEXT, detail TEXT, source_file TEXT
);

CREATE TABLE locations (
  location_id INTEGER PRIMARY KEY,
  certificate_id INTEGER, raw_text TEXT NOT NULL, location_norm TEXT,
  place_id TEXT, precision TEXT, field_origin TEXT, source_dataset TEXT
);

CREATE TABLE group_observations (
  group_id INTEGER PRIMARY KEY,
  certificate_id INTEGER, category TEXT NOT NULL, count INTEGER,
  detail TEXT, source_dataset TEXT, source_file TEXT
);

CREATE TABLE annotations (
  annotation_id INTEGER PRIMARY KEY,
  item_id TEXT, user_id TEXT, timestamp TEXT, text TEXT, status TEXT, source_file TEXT
);

CREATE INDEX idx_cert_item ON certificates(item_id);
CREATE INDEX idx_cert_ds_item ON certificates(source_dataset, item_id);
CREATE INDEX idx_cert_ds ON certificates(source_dataset, record_type, event_year);
CREATE INDEX idx_pers_cert ON persons(certificate_id);
CREATE INDEX idx_pers_norm ON persons(name_norm);
CREATE INDEX idx_pers_sdx ON persons(name_soundex);
CREATE INDEX idx_pers_role ON persons(role, source_dataset);
CREATE INDEX idx_pers_item ON persons(certificate_id, role);
CREATE INDEX idx_names_person ON person_names(person_id);
CREATE INDEX idx_names_norm ON person_names(value_norm);
CREATE INDEX idx_rel_cert ON relations(certificate_id);
CREATE INDEX idx_ann_item ON annotations(item_id);
CREATE INDEX idx_loc_norm ON locations(location_norm);
"""

FTS = """
CREATE VIRTUAL TABLE persons_fts USING fts5(
  full_name, given_name, surname, alias, former_name, location, occupation,
  content='persons', content_rowid='person_id',
  tokenize="unicode61 remove_diacritics 2");
"""

# Precomputed so the Datasette "cross-dataset matches" canned query is instant
# (grouping 1.9M persons live exceeds the SQL time limit).
CROSS_DATASET = """
DROP TABLE IF EXISTS cross_dataset_names;
CREATE TABLE cross_dataset_names AS
  SELECT name_norm AS person_name,
         COUNT(DISTINCT source_dataset) AS datasets,
         GROUP_CONCAT(DISTINCT source_dataset) AS which_datasets,
         GROUP_CONCAT(DISTINCT role) AS roles,
         MIN(event_year) AS first_year, MAX(event_year) AS last_year,
         COUNT(*) AS attestations
    FROM persons
   WHERE name_norm IS NOT NULL
   GROUP BY name_norm
  HAVING datasets > 1;
CREATE INDEX idx_cross_name ON cross_dataset_names(person_name);
CREATE INDEX idx_cross_datasets ON cross_dataset_names(datasets DESC);
"""

SOURCES = [
    ('02-death', 'Suriname Death Certificates 1845-1915 v1.0', 'Embargo check', 0, 'data/02-death-certificates …', ''),
    ('03-birth', 'Paramaribo Birth Certificates 1828-1921 v1.0', 'Embargo check', 0, 'data/03-birth-certificates …', ''),
    ('04-ward-registers', 'Paramaribo Ward Registers 1828-1847', 'Open data', 0, 'data/04-ward-registers …', ''),
    ('05-slave-emancipation', 'Suriname Slave and Emancipation Registers v1.1', 'Open data', 0, 'data/05-slave-emancipation …', ''),
    ('06-almanakken', 'Plantations Surinaamse Almanakken v2.0', 'Open data', 0, 'data/06-almanakken …', ''),
    ('09-volkstelling-1921', 'Volkstelling 1921 (NT00445)', 'Open data', 0, 'data/09-volkstelling-1921', ''),
    ('10-volkstelling-1950', 'Volkstelling 1950 (2.10.19.02)', 'Open data', 0, 'data/10-volkstelling-1950', ''),
    ('11-madeisu', 'Madeisu contract labourers 1853-1864', 'Stichting Madeisu terms', 1, 'data/11-madeisu', 'Restricted to confirmed Madeisu terms'),
    ('12-migratie-datasets', 'Migration registers (Hindostani/Chinese)', 'Restricted - no reuse pending', 1, 'data/12-migratie-datasets', 'No public reuse until written terms'),
    ('13-civil', 'Civil records (births/deaths/recognitions/marriages)', 'Embargoed raw data', 1, 'data/13-Civil_records_under_embargo_raw_data', 'Local use only'),
]

# ---------------------------------------------------------------------------
# Builder
# ---------------------------------------------------------------------------

class Builder:
    def __init__(self, conn, quiet=False):
        self.conn = conn
        self.quiet = quiet
        self.stats = Counter()
        self.per_dataset = Counter()

    def log(self, msg):
        if not self.quiet:
            print(msg, flush=True)

    # -- core inserts ------------------------------------------------------
    def add_certificate(self, **kw):
        cols = ('source_dataset', 'record_type', 'collection', 'register', 'item_id',
                'inventory_number', 'folio', 'page', 'certificate_number', 'contract_number',
                'slavenregister_id', 'registration_number', 'series', 'event_date', 'event_year',
                'date_precision', 'cert_date', 'cert_place', 'cert_location', 'district',
                'plantation_name', 'ward_code', 'address_text', 'source_file')
        values = [kw.get(c) for c in cols]
        cur = self.conn.execute(
            f'INSERT INTO certificates ({",".join(cols)}) VALUES ({",".join("?" * len(cols))})',
            values)
        self.stats['certificates'] += 1
        return cur.lastrowid

    def add_person(self, certificate_id, source_dataset, role, source_file, **kw):
        given = clean(kw.get('given_name'))
        prefix = clean(kw.get('name_prefix'))
        surname = clean(kw.get('surname'))
        alias = clean(kw.get('alias'))
        former = clean(kw.get('former_name'))
        full = clean(kw.get('full_name')) or ' '.join(p for p in (given, prefix, surname) if p) or None
        norm = ' '.join(p for p in (given, prefix, surname) if p) or None
        birth_year = kw.get('birth_year') or birth_year_of(kw.get('birth_date'))
        event_date, event_year, precision = parse_date(kw.get('event_date') or kw.get('cert_date'))
        cur = self.conn.execute(
            """INSERT INTO persons
               (certificate_id, source_dataset, given_name, name_prefix, surname, alias, former_name,
                full_name, name_norm, name_soundex, sex, age, age_numeric, birth_date, birth_year,
                death_date, death_year, event_date, event_year, date_precision, religion, ethnicity,
                origin, nationality, occupation, literacy, literate, location, address_text,
                ward_code, district, plantation_name, registration_number, contract_number,
                slavenregister_id, role, role_index, status, confidence, raw_prefix, source_file)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (certificate_id, source_dataset, given, prefix, surname, alias, former,
             full, normalize(norm), soundex(surname or given),
             clean(kw.get('sex')), clean(kw.get('age')), to_int(re.sub(r'\D', '', str(kw.get('age') or ''))[:2] or None),
             clean(kw.get('birth_date')), birth_year,
             clean(kw.get('death_date')), birth_year_of(kw.get('death_date')), event_date, event_year, precision,
             clean(kw.get('religion')), clean(kw.get('ethnicity')), clean(kw.get('origin')),
             clean(kw.get('nationality')), clean(kw.get('occupation')), clean(kw.get('literacy')),
             kw.get('literate'), clean(kw.get('location')), clean(kw.get('address_text')),
             clean(kw.get('ward_code')), clean(kw.get('district')), clean(kw.get('plantation_name')),
             clean(kw.get('registration_number')), clean(kw.get('contract_number')),
             clean(kw.get('slavenregister_id')), role, kw.get('role_index'),
             clean(kw.get('status')), kw.get('confidence') or 'certain', clean(kw.get('raw_prefix')), source_file))
        self.stats['persons'] += 1
        self.per_dataset[source_dataset] += 1
        return cur.lastrowid

    def add_name(self, person_id, kind, value, source_file):
        value = clean(value)
        if not value:
            return
        self.conn.execute(
            'INSERT INTO person_names (person_id, kind, value, value_norm, source_file) VALUES (?,?,?,?,?)',
            (person_id, kind, value, normalize(value), source_file))

    def add_relation(self, certificate_id, rtype, from_person, to_person, confidence, detail, source_file):
        self.conn.execute(
            """INSERT INTO relations (certificate_id, relation_type, from_person, to_person,
                                      confidence, detail, source_file) VALUES (?,?,?,?,?,?,?)""",
            (certificate_id, rtype, from_person, to_person, confidence, detail, source_file))
        self.stats['relations'] += 1

    def add_location(self, certificate_id, raw, field, source_dataset, place_id=None, precision=None):
        raw = clean(raw)
        if not raw:
            return
        self.conn.execute(
            """INSERT INTO locations (certificate_id, raw_text, location_norm, place_id,
                                      precision, field_origin, source_dataset) VALUES (?,?,?,?,?,?,?)""",
            (certificate_id, raw, normalize(raw), place_id, precision, field, source_dataset))
        self.stats['locations'] += 1

    def add_group(self, certificate_id, category, count, detail, source_dataset, source_file):
        if not count:
            return
        self.conn.execute(
            """INSERT INTO group_observations (certificate_id, category, count, detail,
                                               source_dataset, source_file) VALUES (?,?,?,?,?,?)""",
            (certificate_id, category, count, detail, source_dataset, source_file))
        self.stats['groups'] += 1

    def add_annotation(self, item_id, text, source_file, user_id=None, timestamp=None, status=None):
        text = clean(text)
        if not text:
            return
        self.conn.execute(
            """INSERT INTO annotations (item_id, user_id, timestamp, text, status, source_file)
               VALUES (?,?,?,?,?,?)""",
            (item_id, user_id, timestamp, text, status, source_file))
        self.stats['annotations'] += 1


# ---------------------------------------------------------------------------
# Role-prefix extraction (civil certificates 02/03/13)
# ---------------------------------------------------------------------------

SUFFIX_CANON = [
    ('sig_other', 'sig_other'), ('otherinfo', 'other_info'), ('other_info', 'other_info'),
    ('birthplace', 'birthplace'), ('birth_place', 'birthplace'), ('bdate_age', 'age'),
    ('death_date', 'death_date'), ('prev_owner', 'prev_owner'), ('reason_other', 'reason_other'),
    ('custody_of', 'custody_of'), ('relation_other', 'relation_other'), ('relation', 'relation'),
    ('fname', 'given_name'), ('sname', 'surname'), ('prefix', 'name_prefix'), ('alias', 'alias'),
    ('place', 'place'), ('dplace', 'death_place'), ('reason', 'reason'), ('alive', 'alive'),
    ('type', 'type'), ('ref', 'ref'), ('mother', 'mother_ref'), ('inf', 'info'),
    ('occ', 'occupation'), ('age', 'age'), ('sex', 'sex'), ('sig', 'sig'), ('cust', 'custodian_ref'),
    ('other', 'other_info'),
]

IGNORED_COLUMNS = {
    'itemid', 'id', 'folio', 'folio1', 'folio2', 'cert_date', 'cert_place', 'cert_location',
    'cert_type', 'cert_excerpt', 'release', 'notes_all', 'original_scanid', 'inventory_number',
    'projectid', 'translation', 'translation_other', 'translation_comment', 'identifier',
    'user_id', 'timestamp', 'text', 'status', 'scanid', 'scanimgurl', 'commentaar', 'projecttype',
    'userid', 'regels', 'notitie',
}


def parse_column(name):
    lowered = name.lower()
    if lowered in IGNORED_COLUMNS:
        return None
    parts = lowered.split('_')
    index = None
    if parts and parts[-1].isdigit():
        index = int(parts[-1])
        parts = parts[:-1]
    for suffix, canon in SUFFIX_CANON:
        sp = suffix.split('_')
        if len(parts) > len(sp) and parts[-len(sp):] == sp:
            return '_'.join(parts[: -len(sp)]), canon, index
    return None


def extract_role_persons(row, specs, accent=False):
    out = []
    for spec in specs:
        role, prefix = spec['role'], spec['prefix']
        indexed = spec.get('indexed', False)
        override = spec.get('override')
        buckets = defaultdict(dict)
        if override:
            # Irregular tables (e.g. erkenningen/children) where a co-person
            # lives in explicitly named columns rather than a role prefix.
            values = {canon: clean(row.get(col)) for canon, col in override.items()}
            values = {k: v for k, v in values.items() if v}
            if values:
                buckets[None] = values
        else:
            for column, value in row.items():
                parsed = parse_column(column)
                if not parsed:
                    continue
                pre, canon, index = parsed
                if pre != prefix:
                    continue
                if indexed and index is None:
                    continue
                if not indexed and index is not None:
                    continue
                cleaned = clean(value)
                if cleaned:
                    buckets[index][canon] = cleaned
        for index, values in sorted(buckets.items(), key=lambda kv: (kv[0] is None, kv[0])):
            if not any(values.values()):
                continue
            person = dict(values)
            person['role'] = f'{role}{index}' if (accent and index is not None) else role
            person['role_index'] = index
            person['raw_prefix'] = prefix
            out.append(person)
    return out


DEATH_SPECS = [{'role': 'deceased', 'prefix': 'dec'}, {'role': 'informant', 'prefix': 'inf'},
               {'role': 'parent', 'prefix': 'parent', 'indexed': True},
               {'role': 'spouse', 'prefix': 'spouse', 'indexed': True},
               {'role': 'witness', 'prefix': 'witn', 'indexed': True}]
BIRTH_SPECS = [{'role': 'child', 'prefix': 'child'}, {'role': 'mother', 'prefix': 'moth'},
               {'role': 'father', 'prefix': 'fath'}, {'role': 'informant', 'prefix': 'inf'},
               {'role': 'witness', 'prefix': 'witn', 'indexed': True}]
GEBOORTE13_SPECS = [{'role': 'child', 'prefix': 'child'}, {'role': 'mother', 'prefix': 'moth'},
                    {'role': 'father', 'prefix': 'fath'}, {'role': 'informant', 'prefix': 'inf'}]
WITNESS_SPECS = [{'role': 'witness', 'prefix': 'witn'}]
COMPARANT_SPECS = [{'role': 'declarant', 'prefix': 'inf'}]
ERK_CHILD_SPECS = [
    {'role': 'child', 'prefix': 'child'},
    {'role': 'mother', 'prefix': 'mother',
     'override': {'given_name': 'mother_fname', 'name_prefix': 'mother_prefix',
                  'surname': 'mother_sname', 'death_date': 'mother_death_date',
                  'death_place': 'moth_dplace', 'sig': 'moth_sig',
                  'sig_other': 'moth_sig_other', 'info': 'mother_inf'}}]
MARRIAGE_SPECS = [{'role': 'groom', 'prefix': 'groom'}, {'role': 'bride', 'prefix': 'bride'}]
GPARENT_SPECS = [{'role': 'parent_groom', 'prefix': 'gparent'}]
BPARENT_SPECS = [{'role': 'parent_bride', 'prefix': 'bparent'}]
CUSTODIAN_SPECS = [{'role': 'custodian', 'prefix': 'cust'}, {'role': 'custodian_parent', 'prefix': 'bparent'}]


# ---------------------------------------------------------------------------
# Dataset loaders
# ---------------------------------------------------------------------------

def load_civil_flat(builder, path, source_dataset, record_type):
    specs = DEATH_SPECS if source_dataset == '02-death' else BIRTH_SPECS
    _, rows = read_table(path)
    source_file = os.path.relpath(path, REPO_ROOT)
    for row in rows:
        cert = builder.add_certificate(
            source_dataset=source_dataset, record_type=record_type,
            item_id=clean(row.get('original_scanid')) or clean(row.get('id')),
            inventory_number=clean(row.get('inventory_number')), folio=clean(row.get('folio')),
            cert_date=clean(row.get('cert_date')), cert_place=clean(row.get('cert_place')),
            event_date=clean(row.get('death_date') or row.get('birth_date')),
            source_file=source_file)
        persons = extract_role_persons(row, specs)
        ids = {}
        for person in persons:
            pid = builder.add_person(cert, source_dataset, person['role'], source_file,
                                     **{k: v for k, v in person.items() if k not in ('role',)})
            ids[(person['role'], person.get('role_index'))] = pid
        link_within_certificate(builder, cert, ids, source_file, source_dataset)
        for column in ('death_place', 'dec_place', 'dec_birthplace', 'birth_place', 'inf_place',
                       'witn_place_1', 'witn_place_2', 'moth_place'):
            if column in row:
                builder.add_location(cert, row.get(column), column, source_dataset)
        builder.add_annotation(clean(row.get('original_scanid')) or clean(row.get('id')),
                               row.get('notes_all'), source_file)
    builder.log(f'  {source_dataset}: {len(rows)} certificates')


def link_within_certificate(builder, cert, ids, source_file, source_dataset):
    def ref(role, index=None):
        return ids.get((role, index))

    child, deceased = ref('child'), ref('deceased')
    for role in ('mother', 'father'):
        other = ref(role)
        if other and child:
            builder.add_relation(cert, 'parent-child', other, child, 'certain', role, source_file)
    groom, bride = ref('groom'), ref('bride')
    if groom and bride:
        builder.add_relation(cert, 'spouse', groom, bride, 'certain', 'groom-bride', source_file)
    if deceased:
        for i in range(1, 5):
            sp = ref('spouse', i)
            if sp:
                builder.add_relation(cert, 'spouse', deceased, sp, 'certain', f'spouse{i}', source_file)
        for i in range(1, 3):
            par = ref('parent', i)
            if par:
                builder.add_relation(cert, 'parent-child', par, deceased, 'certain', f'parent{i}', source_file)
    for i in range(1, 3):
        wit = ref('witness', i)
        subject = deceased or child or groom
        if wit and subject:
            builder.add_relation(cert, 'witness', wit, subject, 'certain', f'witn{i}', source_file)
    declarant = ref('declarant')
    if declarant and child:
        builder.add_relation(cert, 'declarant', declarant, child, 'certain', 'declarant', source_file)


def load_folder13(builder):
    def load_collection(folder, collection, register, master_specs, side_tables):
        master_path = os.path.join(folder, 'nonrepeatable-fields-plat.csv')
        if not os.path.exists(master_path):
            return
        source_file = os.path.relpath(master_path, REPO_ROOT)
        _, master_rows = read_table(master_path)
        side = {}
        for name, specs in side_tables:
            sp = os.path.join(folder, name)
            if os.path.exists(sp):
                _, srows = read_table(sp)
                by_item = defaultdict(list)
                for srow in srows:
                    by_item[clean(srow.get('itemID'))].append(srow)
                side[name] = (os.path.relpath(sp, REPO_ROOT), specs, by_item)
        seen = set()
        dropped = 0
        for row in master_rows:
            key = tuple(sorted(row.items()))
            if key in seen:
                dropped += 1
                continue
            seen.add(key)
            item_id = clean(row.get('itemID'))
            cert = builder.add_certificate(
                source_dataset='13-civil', record_type=collection, collection=collection,
                register=register, item_id=item_id,
                folio=clean(row.get('folio')) or clean(row.get('folio1')),
                cert_date=clean(row.get('cert_date')), cert_place=clean(row.get('cert_place')),
                cert_location=clean(row.get('cert_location')), source_file=source_file)
            ids = {}
            for person in extract_role_persons(row, master_specs):
                pid = builder.add_person(cert, '13-civil', person['role'], source_file,
                                         **{k: v for k, v in person.items() if k != 'role'})
                ids[(person['role'], person.get('role_index'))] = pid
            for name, (sfile, specs, by_item) in side.items():
                for srow in by_item.get(item_id, ()):
                    for person in extract_role_persons(srow, specs):
                        builder.add_person(cert, '13-civil', person['role'], sfile,
                                           **{k: v for k, v in person.items() if k != 'role'})
            link_within_certificate(builder, cert, ids, source_file, '13-civil')
            for column in ('cert_place', 'cert_location', 'birth_place', 'inf_place',
                           'moth_place', 'groom_place', 'bride_place'):
                builder.add_location(cert, row.get(column), column, '13-civil')
        builder.stats['exact_duplicate_rows_dropped'] += dropped
        builder.log(f'  13-{collection}/{register or "-"}: {len(master_rows)} master rows ({dropped} dupes)')

    load_collection(os.path.join(C13, 'erkenningen'), 'erkenningen', None, [],
                    [('children-plat.csv', ERK_CHILD_SPECS), ('comparanten-plat.csv', COMPARANT_SPECS),
                     ('witnesses-plat.csv', WITNESS_SPECS)])
    load_collection(os.path.join(C13, 'Geboorten districten 1861-1880'), 'geboorten-districten',
                    '1861-1880', GEBOORTE13_SPECS, [('witnesses-plat.csv', WITNESS_SPECS)])
    for folder_name, register in [('huwelijken X (1801-1846)', 'X (1801-1846)'),
                                  ('huwelijken I (1846-1880)', 'I (1846-1880)'),
                                  ('huwelijken II (1881-1900)', 'II (1881-1900)')]:
        load_collection(os.path.join(C13, 'Huwelijken', folder_name), 'huwelijken', register,
                        MARRIAGE_SPECS,
                        [('parents_groom-plat.csv', GPARENT_SPECS), ('parents_bride-plat.csv', BPARENT_SPECS),
                         ('witnesses-plat.csv', WITNESS_SPECS), ('child-plat.csv', [{'role': 'child', 'prefix': 'child'}]),
                         ('custodian-plat.csv', CUSTODIAN_SPECS)])
    # curator comments (only the dedicated comment exports)
    for folder in (os.path.join(C13, 'Huwelijken', 'comments huwelijken'),
                   os.path.join(C13, 'Geboorten districten 1861-1880')):
        if not os.path.isdir(folder):
            continue
        for name in sorted(os.listdir(folder)):
            if not name.endswith('.csv') or ('comment' not in name and 'commentaar' not in name):
                continue
            path = os.path.join(folder, name)
            _, rows = read_table(path)
            for row in rows:
                lowered = {k.lower(): v for k, v in row.items()}
                builder.add_annotation(clean(lowered.get('identifier')) or clean(lowered.get('scanid')),
                                       clean(lowered.get('commentaar')) or clean(lowered.get('text')),
                                       os.path.relpath(path, REPO_ROOT),
                                       clean(lowered.get('user_id')) or clean(lowered.get('userid')),
                                       clean(lowered.get('timestamp')),
                                       clean(lowered.get('status')) or clean(lowered.get('projecttype')))
            builder.log(f'  annotations {name}: {len(rows)}')


def parse_owner_text(raw, role='owner'):
    """Parse owner prose into (name, role, confidence) candidates."""
    if not raw:
        return []
    text = ' '.join(str(raw).split())
    lowered = text.lower()
    if any(phrase in lowered for phrase in ('behoort aan het huis', 'wordt door slaven', 'geen eigenaar')):
        return []
    out = []
    heirs = re.match(r'^(?:de\s+)?erven\s+(?:van\s+)?(.+)$', text, re.I)
    boedel = re.match(r'^boedel\s+(?:van\s+)?(.+)$', text, re.I)
    if heirs:
        return [(heirs.group(1).strip(' .'), 'heirs', 'probable')]
    if boedel:
        return [(boedel.group(1).strip(' .'), 'heirs', 'probable')]
    m = re.match(r'^(?:eigenaar|eigenaresse|eigenaren)\s*:\s*(.+)$', text, re.I)
    name = m.group(1) if m else None
    if not name and re.match(r'^(?:aankomende|toekomstige)\s+', text, re.I):
        name = re.sub(r'^(?:aankomende|toekomstige)\s+', '', text, flags=re.I)
    if not name:
        return []
    for part in split_names(name):
        out.append((part, role, 'probable'))
    return out


def split_names(text):
    """Split multi-name owner/administrator strings on ' en ', ',', '/', '&'."""
    if not text:
        return []
    cleaned = re.sub(r'\s+(?:en|EN)\s+', '|', str(text))
    parts = re.split(r'[|,;&/]+', cleaned)
    result = []
    for part in parts:
        part = part.strip(' .;')
        part = re.sub(r'^(?:de\s+)?(?:erven|weduwe|wed\.?)\s+(?:van\s+)?', '', part, flags=re.I)
        if part and len(part) > 1 and not part.lower() in NULL_MARKERS:
            result.append(part)
    return result


def split_simple_name(full):
    """Split 'F.F. Franke' -> ("F.F.", None, "Franke")."""
    parts = [p for p in re.split(r'\s+', full or '') if p]
    if not parts:
        return None, None, None
    if len(parts) == 1:
        return parts[0], None, None
    return ' '.join(parts[:-1]), None, parts[-1]


def load_ward_registers(builder):
    _, rows = read_table(WARD_CSV)
    source_file = os.path.relpath(WARD_CSV, REPO_ROOT)
    for row in rows:
        item = clean(row.get('Kaart Id')) or clean(row.get('Id'))
        cert = builder.add_certificate(
            source_dataset='04-ward-registers', record_type='ward_register_entry',
            collection='ward-registers', register=clean(row.get('Register')), item_id=item,
            folio=clean(row.get('Id')), event_year=to_int(row.get('Jaar')),
            cert_place='Paramaribo',
            district=clean(row.get('Buurt')),
            ward_code=clean(row.get('Wijkletter')) or clean(row.get('Wijk')),
            address_text=clean(row.get('Address_Full')), source_file=source_file)
        person = builder.add_person(
            cert, '04-ward-registers', 'resident', source_file,
            given_name=row.get('Voornaam'), name_prefix=row.get('Tussenvoegsel'),
            surname=row.get('Achternaam'), alias=row.get('name_alt') or row.get('Prefix'),
            sex=row.get('Sex'), age=row.get('Leeftijd'), religion=row.get('Religie'),
            ethnicity=row.get('Etniciteit'), occupation=row.get('Beroep'), origin=row.get('Herkomst'),
            location=row.get('Straatnaam'), address_text=row.get('Address_Full'),
            ward_code=clean(row.get('Wijkletter')) or clean(row.get('Wijk')),
            district=clean(row.get('Buurt')), literacy=row.get('Rel_Stand2'),
            registration_number=item,
            status='free' if clean(row.get('Enslaved')) != '1' else 'enslaved')
        for kind, column in (('maiden_name', 'Meisjesnaam'), ('widow_name', 'Weduwe'),
                             ('orig_spelling', 'Firstnames_Orig'), ('orig_spelling', 'Surname_Orig'),
                             ('spouse_name', 'Fn_Dec_Spouse'), ('suffix', 'Suffix')):
            builder.add_name(person, kind, row.get(column), source_file)
        # enslaved head-count matrix -> GroupObservation (no invented persons)
        for column in ('Xma', 'Xfa', 'Xmc', 'Xfc', 'Bma', 'Bfa', 'Bmc', 'Bfc'):
            count = to_int(row.get(column))
            if count:
                builder.add_group(cert, f'enslaved_matrix_{column}', count,
                                  'household enslaved head-count', '04-ward-registers', source_file)
        if to_int(row.get('Aantal_Slaafgemaakten')):
            builder.add_group(cert, 'enslaved_total', to_int(row.get('Aantal_Slaafgemaakten')),
                              'declared enslaved total', '04-ward-registers', source_file)
        # owner prose -> probable owner persons + raw annotation
        for name, role, confidence in parse_owner_text(row.get('Eigenaar')):
            given, prefix, surname = split_simple_name(name)
            owner_id = builder.add_person(cert, '04-ward-registers', role, source_file,
                                          given_name=given, name_prefix=prefix, surname=surname,
                                          confidence=confidence, location=row.get('Straatnaam'),
                                          district=clean(row.get('Buurt')))
            builder.add_relation(cert, 'owner-property', owner_id, person, confidence,
                                 'Eigenaar field', source_file)
        builder.add_annotation(item, row.get('Eigenaar'), source_file, status='owner_prose')
        for column in ('Enslaved_Remarks', 'Freeperson_Remarks', 'Annotaties', 'Diversen',
                       'Adress_Remarks', 'Remarks_Orig', 'Invoer_Remarks'):
            builder.add_annotation(item, row.get(column), source_file, status=column)
        for column in ('Straatnaam', 'Address_Full'):
            builder.add_location(cert, row.get(column), column, '04-ward-registers')
    builder.log(f'  04-ward-registers: {len(rows)} entries')


def load_slave_emancipation(builder):
    _, rows = read_table(SLAVE_CSV)
    source_file = os.path.relpath(SLAVE_CSV, REPO_ROOT)
    for row in rows:
        register_type = clean(row.get('Typeregister')) or ''
        is_emancipation = 'emancipation' in register_type.lower()
        item = clean(row.get('Id_person'))
        cert = builder.add_certificate(
            source_dataset='05-slave-emancipation',
            record_type='emancipation_record' if is_emancipation else 'slave_register_entry',
            collection='slave-emancipation', register=register_type, item_id=item,
            inventory_number=clean(row.get('Inventory_number')), folio=clean(row.get('Folio_number')),
            slavenregister_id=clean(row.get('Id_source')), series=clean(row.get('Serieregister')),
            event_year=to_int(row.get('StartEntryYear')),
            plantation_name=clean(row.get('Plantation')), source_file=source_file)
        person_id = builder.add_person(
            cert, '05-slave-emancipation',
            'emancipated' if is_emancipation else 'enslaved', source_file,
            given_name=row.get('Name_enslaved'), surname=row.get('Family_name'),
            sex=row.get('Sex'), age=row.get('Age'), birth_year=to_int(row.get('Year_birth')),
            birth_date='-'.join(filter(None, [row.get('Year_birth'), row.get('Month_birth'), row.get('Day_birth')])) or None,
            death_date='-'.join(filter(None, [row.get('Year_death'), row.get('Month_death'), row.get('Day_death')])) or None,
            occupation=row.get('Occupation'), plantation_name=clean(row.get('Plantation')),
            status='free' if is_emancipation else 'enslaved',
            registration_number=clean(row.get('Id_source')), slavenregister_id=clean(row.get('Id_source')))
        if is_emancipation:
            builder.add_name(person_id, 'emancipation_name',
                             ' '.join(filter(None, [row.get('First_name'), row.get('Family_name')])), source_file)
            builder.add_name(person_id, 'baptized_name', row.get('Baptized_name'), source_file)
            builder.add_name(person_id, 'former_name', row.get('Name_enslaved'), source_file)
        # owner person + enslaver relation
        owner_raw = clean(row.get('Name_owner'))
        if owner_raw:
            given, prefix, surname = split_simple_name(owner_raw)
            owner_id = builder.add_person(cert, '05-slave-emancipation', 'owner', source_file,
                                          given_name=given, name_prefix=prefix, surname=surname,
                                          plantation_name=clean(row.get('Plantation')))
            builder.add_relation(cert, 'enslaver-enslaved', owner_id, person_id, 'certain',
                                 'Name_owner field', source_file)
        # mother
        mother_raw = clean(row.get('Name_mother'))
        if mother_raw:
            mother_id = builder.add_person(cert, '05-slave-emancipation', 'mother', source_file,
                                           given_name=mother_raw)
            builder.add_relation(cert, 'parent-child', mother_id, person_id, 'certain',
                                 'Name_mother field', source_file)
        builder.add_annotation(item, row.get('Family_relations'), source_file, status='family_relations')
        builder.add_annotation(item, row.get('Remarks_ER'), source_file, status='remarks_ER')
        builder.add_location(cert, row.get('Plantation'), 'Plantation', '05-slave-emancipation',
                             precision='plantation')
    builder.log(f'  05-slave-emancipation: {len(rows)} entries')


def load_almanakken(builder):
    _, rows = read_table(ALMANAK_CSV)
    source_file = os.path.relpath(ALMANAK_CSV, REPO_ROOT)
    role_columns = {
        'eigenaren': 'owner', 'administrateurs': 'administrator', 'directeuren': 'director',
        'administrateurs_in_Europa': 'administrator_europe',
        'administrateurs_in_Suriname': 'administrator_suriname', 'blank-officier': 'blank_officier',
    }
    for row in rows:
        cert = builder.add_certificate(
            source_dataset='06-almanakken', record_type='almanak_entry', collection='almanakken',
            register=clean(row.get('year')), item_id=clean(row.get('recordid')),
            folio=clean(row.get('page')), event_year=to_int(row.get('year')),
            plantation_name=clean(row.get('plantation_std')),
            district=clean(row.get('district_of_divisie')), source_file=source_file)
        for column, role in role_columns.items():
            raw = clean(row.get(column))
            if not raw:
                continue
            for name in split_names(raw):
                given, prefix, surname = split_simple_name(name)
                pid = builder.add_person(cert, '06-almanakken', role, source_file,
                                         given_name=given, name_prefix=prefix, surname=surname,
                                         plantation_name=clean(row.get('plantation_std')),
                                         district=clean(row.get('district_of_divisie')))
                builder.add_relation(cert, 'employer-plantation', pid, None, 'probable',
                                     f'{role} on {row.get("plantation_std")}', source_file)
                builder.add_annotation(clean(row.get('recordid')), raw, source_file, status=column)
        for column in ('slaven', 'generaal_totaal_slaven', 'plantage_mannelijke_niet_vrije_bewoners',
                       'plantage_vrouwelijke_niet_vrije_bewoners', 'totaal_generaal_bewoners',
                       'vrije_bewoners'):
            count = to_int(row.get(column))
            if count:
                builder.add_group(cert, column, count, 'almanak head-count', '06-almanakken', source_file)
        builder.add_annotation(clean(row.get('recordid')), row.get('additional_info'), source_file,
                               status='additional_info')
        builder.add_location(cert, row.get('plantation_std'), 'plantation_std', '06-almanakken')
    builder.log(f'  06-almanakken (csv): {len(rows)} entries')

    if os.path.exists(ALMANAK_XLSX):
        xrows = read_xlsx(ALMANAK_XLSX)
        xfile = os.path.relpath(ALMANAK_XLSX, REPO_ROOT)
        for row in xrows:
            cert = builder.add_certificate(
                source_dataset='06-almanakken', record_type='almanak_disambiguated',
                collection='almanakken', register=clean(row.get('year')),
                item_id=clean(row.get('recordid')), folio=clean(row.get('page')),
                event_year=to_int(row.get('year')), plantation_name=clean(row.get('plantation_std')),
                district=clean(row.get('district_of_divisie')), source_file=xfile)
            for prefix, role in (('adm', 'administrator'), ('dir', 'director'), ('eig', 'owner'),
                                 ('ade', 'administrator_europe'), ('ads', 'administrator_suriname'),
                                 ('bl', 'blank_officier')):
                for index in range(1, 10):
                    raw = clean(row.get(f'{prefix}{index}'))
                    if not raw:
                        continue
                    given, nprefix, surname = split_simple_name(raw)
                    builder.add_person(cert, '06-almanakken', role, xfile,
                                       given_name=given, name_prefix=nprefix, surname=surname,
                                       role_index=index, plantation_name=clean(row.get('plantation_std')))
            builder.add_annotation(clean(row.get('recordid')), row.get('OVERIG'), xfile, status='overig')
        builder.log(f'  06-almanakken (xlsx): {len(xrows)} entries')


def load_census_1921(builder):
    rows = read_double_encoded_csv(CENSUS21_CSV)
    source_file = os.path.relpath(CENSUS21_CSV, REPO_ROOT)
    for row in rows:
        uuid = clean(row.get('__uuid__'))
        item = uuid or clean(row.get('id'))
        initials = clean(row.get('initialen_of_contractnr'))
        contract = initials if initials and '/' in initials else None
        builder_cert = builder.add_certificate(
            source_dataset='09-volkstelling-1921', record_type='census_entry',
            collection='volkstelling-1921', item_id=item, registration_number=clean(row.get('id')),
            event_year=1921, district=clean(row.get('naam district')),
            ward_code=clean(row.get('kringnummer')), address_text=clean(row.get('adres')),
            source_file=source_file)
        builder.add_person(
            builder_cert, '09-volkstelling-1921', 'resident', source_file,
            given_name=initials if not contract else None,
            surname=row.get('achternaam'), birth_year=to_int(row.get('geboortejaar')),
            district=clean(row.get('naam district')), ward_code=clean(row.get('kringnummer')),
            location=clean(row.get('adres')), address_text=clean(row.get('adres')),
            contract_number=contract, registration_number=clean(row.get('lijstnummer')),
            status='free')
        builder.add_annotation(item, row.get('opmerking_registratielijst'), source_file,
                               status='opmerking')
        builder.add_location(builder_cert, row.get('adres'), 'adres', '09-volkstelling-1921')
    builder.log(f'  09-volkstelling-1921: {len(rows)} entries')


def load_census_1950(builder):
    all_rows = []
    for path in (CENSUS50_TSV, CENSUS50_TSV2):
        if os.path.exists(path):
            rows = read_tsv(path)
            all_rows.append((os.path.relpath(path, REPO_ROOT), rows))
    seen = set()
    for source_file, rows in all_rows:
        index = {i: row for i, row in enumerate(rows)}
        i = 0
        while i < len(rows):
            front = rows[i]
            key = (front.get('Inventarisnummer'), front.get('Volgnummer'))
            if key in seen:
                i += 1
                continue
            seen.add(key)
            context = front
            back = rows[i + 1] if i + 1 < len(rows) and rows[i + 1].get('Inventarisnummer') == front.get('Inventarisnummer') else None
            has_name = clean(front.get('Voornamen')) or clean(front.get('Achternaam_1950'))
            if has_name:
                item = f"{front.get('Toegang')}_{front.get('Inventarisnummer')}_{front.get('Volgnummer')}"
                cert = builder.add_certificate(
                    source_dataset='10-volkstelling-1950', record_type='census_entry',
                    collection='volkstelling-1950', item_id=item,
                    inventory_number=clean(front.get('Inventarisnummer')),
                    folio=clean(front.get('Volgnummer')), event_date=clean(front.get('Geboortedatum')),
                    registration_number=clean(front.get('Toegang')),
                    district=clean(front.get('Woondistrict')),
                    address_text=clean(front.get('Woonplaats')), source_file=source_file)
                subject = builder.add_person(
                    cert, '10-volkstelling-1950', 'resident', source_file,
                    given_name=front.get('Voornamen'),
                    surname=front.get('Achternaam_1950') or front.get('Achternaam_1921'),
                    birth_date=clean(front.get('Geboortedatum')),
                    location=clean(front.get('Woonplaats')), district=clean(front.get('Woondistrict')),
                    status='free')
                builder.add_name(subject, 'former_name', front.get('Achternaam_1921'), source_file)
                if back:
                    for role, fname_col, sname_col in (
                            ('father', 'Voornamen_Vader', 'Achternaam_Vader'),
                            ('mother', 'Voornamen_Moeder', 'Achternaam_Moeder'),
                            ('spouse', 'Voornamen_Partner', 'Achternaam_Partner')):
                        if clean(back.get(sname_col)) or clean(back.get(fname_col)):
                            rel_id = builder.add_person(
                                cert, '10-volkstelling-1950', role, source_file,
                                given_name=back.get(fname_col), surname=back.get(sname_col),
                                district=clean(back.get('Woondistrict_Partner')))
                            rtype = 'spouse' if role == 'spouse' else 'parent-child'
                            builder.add_relation(cert, rtype, rel_id, subject, 'certain',
                                                 f'card back {role}', source_file)
                    builder.add_annotation(item, back.get('Huwelijksdatum'), source_file,
                                           status='huwelijksdatum')
                builder.add_location(cert, front.get('Woonplaats'), 'Woonplaats', '10-volkstelling-1950')
            i += 1
    builder.log(f'  10-volkstelling-1950: {sum(len(r) for _, r in all_rows)} rows -> paired')


def load_madeisu(builder):
    source_file = os.path.relpath(MADEISU_XLSX, REPO_ROOT)
    rows = read_xlsx(MADEISU_XLSX)
    for row in rows:
        sex = (row.get('Sex') or '').strip().upper()
        sex = 'female' if sex in ('V', 'F') else ('male' if sex == 'M' else None)
        cert = builder.add_certificate(
            source_dataset='11-madeisu', record_type='contract_record', collection='madeisu',
            item_id=clean(row.get('ID')), folio=clean(row.get('Index')),
            cert_date=clean(row.get('Month-Year')), event_year=to_int(re.sub(r'.*-', '', str(row.get('Month-Year') or ''))),
            plantation_name=clean(row.get('Plantage')), district=clean(row.get('District')),
            address_text=clean(row.get('Boot')), source_file=source_file)
        pid = builder.add_person(
            cert, '11-madeisu', 'contract_worker', source_file,
            given_name=row.get('Voornaam'), surname=row.get('Achternaam'), sex=sex,
            age=row.get('Leeftijd'), occupation='contract labourer',
            plantation_name=clean(row.get('Plantage')), district=clean(row.get('District')),
            registration_number=clean(row.get('ID')), contract_number=clean(row.get('Index')),
            nationality='Madeira/Portugal')
        builder.add_name(pid, 'display_name', row.get('Naam'), source_file)
        remarks = clean(row.get('Bijzonderheden'))
        if remarks:
            builder.add_annotation(clean(row.get('ID')), remarks, source_file, status='bijzonderheden')
            kind_map = {'kind van': 'parent-child', 'zuster van': 'sibling', 'dochter van': 'parent-child',
                        'zoon van': 'parent-child', 'broer van': 'sibling'}
            for phrase, rtype in kind_map.items():
                if phrase in remarks.lower():
                    other = re.sub(rf'^.*?{phrase}\s+', '', remarks, flags=re.I).strip(' .')
                    if other:
                        builder.add_relation(cert, rtype, None, pid, 'probable', f'{phrase} {other}', source_file)
                    break
        builder.add_location(cert, row.get('Plantage'), 'Plantage', '11-madeisu')
    builder.log(f'  11-madeisu (persons): {len(rows)} entries')

    if os.path.exists(MADEISU_PLANT_XLSX):
        prows = read_xlsx(MADEISU_PLANT_XLSX)
        pfile = os.path.relpath(MADEISU_PLANT_XLSX, REPO_ROOT)
        for row in prows:
            cert = builder.add_certificate(
                source_dataset='11-madeisu', record_type='plantation_placement',
                collection='madeisu', item_id=clean(row.get('Locatie')),
                plantation_name=clean(row.get('Locatie')), address_text=clean(row.get('Geo')),
                source_file=pfile)
            for name_col, role in (('Eigenaar', 'owner'),):
                for name in split_names(row.get(name_col)):
                    given, prefix, surname = split_simple_name(name)
                    builder.add_person(cert, '11-madeisu', role, pfile, given_name=given,
                                       name_prefix=prefix, surname=surname,
                                       plantation_name=clean(row.get('Locatie')))
            for column, category in (('Vrouw', 'women'), ('Man', 'men')):
                count = to_int(row.get(column))
                if count:
                    builder.add_group(cert, category, count, 'madeisu placement count',
                                      '11-madeisu', pfile)
        builder.log(f'  11-madeisu (plantations): {len(prows)} entries')


MIG_HIND_MAP = {1: 'contract_number', 2: 'surname', 3: 'given_name', 4: 'ship', 5: 'age',
                6: 'nationality', 7: 'height', 8: 'ethnicity', 9: 'sex', 11: 'occupation',
                12: 'literacy', 13: 'religion', 20: 'recruiter', 23: 'arrival_place',
                24: 'planter', 25: 'plantation', 40: 'memo', 42: 'kinship_refs', 44: 'uuid'}
MIG_CHIN_MAP = {1: 'contract_number', 3: 'given_name', 4: 'surname', 7: 'family_ref',
                 10: 'height', 13: 'sex', 14: 'age', 16: 'religion', 25: 'ship',
                 40: 'register_code', 41: 'district', 42: 'memo', 43: 'uuid'}
MIG_HIND_ORIGIN = {14: 'district', 15: 'police_post', 16: 'village'}
MIG_CHIN_ORIGIN = {17: 'origin_1', 18: 'origin_2'}


def _read_headerless(path):
    delimiter = sniff_delimiter(path)
    with open(path, encoding='utf-8-sig', newline='') as handle:
        return list(csv.reader(handle.read().splitlines(), delimiter=delimiter))


def load_migration(builder):
    for path, mapping, origin_map, label in (
            (MIG_HIND, MIG_HIND_MAP, MIG_HIND_ORIGIN, 'hindostani'),
            (MIG_CHIN, MIG_CHIN_MAP, MIG_CHIN_ORIGIN, 'chinese')):
        if not os.path.exists(path):
            continue
        table = _read_headerless(path)
        source_file = os.path.relpath(path, REPO_ROOT)
        records = table[1:] if table else []
        for raw in records:
            def cell(i):
                return raw[i].strip() if i < len(raw) else ''
            values = {field: clean(cell(i)) for i, field in mapping.items()}
            uuid = values.get('uuid')
            cert = builder.add_certificate(
                source_dataset='12-migratie-datasets', record_type='contract_record',
                collection=f'migration-{label}', item_id=uuid,
                contract_number=values.get('contract_number'),
                registration_number=values.get('contract_number'),
                plantation_name=values.get('plantation'),
                district=values.get('district'),
                address_text=values.get('ship'), source_file=source_file)
            pid = builder.add_person(
                cert, '12-migratie-datasets', 'migrant', source_file,
                given_name=values.get('given_name'), surname=values.get('surname'),
                sex=values.get('sex'), age=values.get('age'),
                occupation=values.get('occupation'), religion=values.get('religion'),
                ethnicity=values.get('ethnicity'), nationality=values.get('nationality'),
                literacy=values.get('literacy'),
                contract_number=values.get('contract_number'),
                plantation_name=values.get('plantation'))
            for index, kind in origin_map.items():
                builder.add_name(pid, kind, cell(index), source_file)
            if values.get('kinship_refs'):
                builder.add_annotation(uuid, values['kinship_refs'], source_file, status='kinship_refs')
            if values.get('family_ref'):
                builder.add_annotation(uuid, values['family_ref'], source_file, status='family_ref')
            builder.add_annotation(uuid, values.get('memo'), source_file, status='memo')
            for index, field in origin_map.items():
                builder.add_location(cert, cell(index), field, '12-migratie-datasets')
            builder.add_location(cert, values.get('plantation'), 'plantation', '12-migratie-datasets')
        builder.log(f'  12-migratie/{label}: {len(records)} records')


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def build(out_path, quiet=False, vacuum=False):
    started = time.time()
    if os.path.exists(out_path):
        os.remove(out_path)
    conn = sqlite3.connect(out_path)
    conn.executescript(SCHEMA)
    conn.executemany('INSERT INTO sources VALUES (?,?,?,?,?,?)', SOURCES)
    builder = Builder(conn, quiet=quiet)

    builder.log('Ingesting datasets…')
    load_civil_flat(builder, DEATH_CSV, '02-death', 'death_certificate')
    load_civil_flat(builder, BIRTH_CSV, '03-birth', 'birth_certificate')
    load_ward_registers(builder)
    load_slave_emancipation(builder)
    load_almanakken(builder)
    load_census_1921(builder)
    load_census_1950(builder)
    load_madeisu(builder)
    load_migration(builder)
    load_folder13(builder)

    builder.log('Finalizing…')
    step = time.time()
    # dup_count via GROUP BY + batch update (a correlated subquery over ~700k
    # certificates is pathologically slow in SQLite).
    conn.executemany(
        'UPDATE certificates SET dup_count = ? WHERE source_dataset = ? AND item_id = ?',
        [(count - 1, dataset, item) for dataset, item, count in conn.execute(
            """SELECT source_dataset, item_id, COUNT(*) c FROM certificates
               WHERE item_id IS NOT NULL AND item_id <> ''
               GROUP BY 1, 2 HAVING c > 1""").fetchall()])
    conn.commit()
    builder.log(f'  dup_count done ({time.time() - step:.1f}s)')

    step = time.time()
    conn.executescript(FTS)
    builder.log(f'  FTS table created ({time.time() - step:.1f}s)')
    step = time.time()
    conn.execute("INSERT INTO persons_fts(persons_fts) VALUES('rebuild')")
    conn.commit()
    builder.log(f'  FTS rebuilt ({time.time() - step:.1f}s)')

    step = time.time()
    conn.executescript(CROSS_DATASET)
    conn.commit()
    builder.log(f'  cross-dataset summary table built ({time.time() - step:.1f}s)')

    counts = {t: conn.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]
              for t in ('sources', 'certificates', 'persons', 'person_names', 'relations',
                        'locations', 'group_observations', 'annotations')}
    per_dataset = conn.execute(
        'SELECT source_dataset, COUNT(*) FROM persons GROUP BY 1 ORDER BY 2 DESC').fetchall()
    per_role = conn.execute(
        'SELECT role, COUNT(*) FROM persons GROUP BY 1 ORDER BY 2 DESC LIMIT 20').fetchall()
    if vacuum:
        step = time.time()
        builder.log('  vacuuming…')
        conn.execute('VACUUM')
        builder.log(f'  vacuum done ({time.time() - step:.1f}s)')
    conn.close()

    size = os.path.getsize(out_path)
    if not quiet:
        print('\n' + '=' * 64)
        print('suriname_person_search.db built')
        print('=' * 64)
        for table, count in counts.items():
            print(f'  {table:<20} {count:>10,}')
        print(f'  exact duplicate rows dropped: {builder.stats.get("exact_duplicate_rows_dropped", 0):,}')
        print(f'  database size: {size / 1024 / 1024:.1f} MB  ({size / 1024 / 1024 / 1024:.2f} GB)')
        print(f'  build time: {time.time() - started:.1f}s')
        print('\n  persons per dataset:')
        for name, count in per_dataset:
            print(f'    {name:<26} {count:>9,}')
        print('\n  persons per role:')
        for name, count in per_role:
            print(f'    {name:<26} {count:>9,}')
    return counts, size


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--out', default=DEFAULT_OUT)
    parser.add_argument('--quiet', action='store_true')
    parser.add_argument('--vacuum', action='store_true', help='VACUUM the database after building (slow)')
    args = parser.parse_args()
    build(args.out, args.quiet, args.vacuum)
