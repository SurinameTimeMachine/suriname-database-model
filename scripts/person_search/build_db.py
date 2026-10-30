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
MIG_JAVA = P('data/12-migratie-datasets', 'NT00346_javanen.csv')
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


# Spelling key for fuzzy name search. Unlike Soundex it keeps the vowels (Soundex
# makes Meijer = Maria = Meer), but folds common Dutch/Surinamese spelling
# variants together: ij/ei/ey/y/ie -> i, oe/ou -> u, dj -> j, tj -> ch, ph -> f,
# sch -> s, c -> k/s, ck -> k, th -> t, final dt/d -> t, final vowel+h -> vowel,
# double letters -> single. E.g. Meijer/Meyer/Meier -> mier, Ponidjah/Ponidja ->
# ponija, Djosodikromo/Josodikromo, Karel/Carel, Schmidt/Smit, Tjon/Chon.
# The search page (ui/app.js, phoneticKey) implements the same steps; keep both in sync.
PHONETIC_STOPWORDS = {'van', 'de', 'der', 'den', 'het', 'ten', 'ter', 'te', 'la', 'le', 'du', 'des'}
_PHONETIC_RULES = (
    ('sch', 's'), ('ck', 'k'), ('ph', 'f'), ('th', 't'), ('dj', 'j'), ('tj', 'ch'),
    ('ij', 'i'), ('ei', 'i'), ('ey', 'i'), ('ie', 'i'), ('y', 'i'),
    ('oe', 'u'), ('ou', 'u'), ('ae', 'a'),
)


def phonetic_key(token: str) -> str:
    t = re.sub(r'[^a-z]', '', strip_diacritics(token or '').lower())
    if not t or t in PHONETIC_STOPWORDS:
        return ''
    t = re.sub(r'c(?=[eiy])', 's', t)
    t = re.sub(r'c(?!h)', 'k', t)
    for a, b in _PHONETIC_RULES:
        t = t.replace(a, b)
    t = re.sub(r'dt$|d$', 't', t)
    t = re.sub(r'([aeiou])h$', r'\1', t)
    t = re.sub(r'(.)\1+', r'\1', t)
    return t


def phonetic_keys(*texts) -> str | None:
    keys = []
    for text in texts:
        for token in re.split(r'[^\w]+', text or ''):
            key = phonetic_key(token)
            if key and key not in keys:
                keys.append(key)
    return ' '.join(keys) or None


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
    if not (1 <= mo <= 12 and 1 <= d <= 31):
        # e.g. '1866-00-00': only the year is known
        return None, y, 'partial'
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


def unwrap_quoted_line(line: str) -> str:
    """Strip one pair of outer quotes from a line, un-doubling escaped inner quotes."""
    s = line.strip()
    if len(s) >= 2 and s[0] == '"' and s[-1] == '"':
        return s[1:-1].replace('""', '"')
    return line


def read_table(path: str):
    delimiter = sniff_delimiter(path)
    with open(path, encoding='utf-8-sig', newline='') as handle:
        lines = [line for line in handle.read().splitlines() if line.strip()]
    if not lines:
        return [], []
    table = list(csv.reader(lines, delimiter=delimiter))
    if table and len(table[0]) == 1 and delimiter in table[0][0]:
        # Quirk: every row is wrapped in one pair of quotes ("a;b;c"). Re-parsing
        # with the same quoting returns the same single field, so strip the outer
        # quotes (and un-double inner ones) before splitting.
        table = list(csv.reader([unwrap_quoted_line(ln) for ln in lines], delimiter=delimiter))
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
  source_file TEXT, dup_count INTEGER DEFAULT 0,
  record_id TEXT
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
  confidence TEXT, raw_prefix TEXT, source_file TEXT,
  name_phonetic TEXT, obs_key TEXT
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
  item_id TEXT, user_id TEXT, timestamp TEXT, text TEXT, status TEXT, source_file TEXT,
  source_dataset TEXT, certificate_id INTEGER
);

CREATE INDEX idx_cert_item ON certificates(item_id);
CREATE INDEX idx_cert_ds_item ON certificates(source_dataset, item_id);
CREATE INDEX idx_cert_ds ON certificates(source_dataset, record_type, event_year);
CREATE INDEX idx_pers_cert ON persons(certificate_id);
CREATE INDEX idx_pers_norm ON persons(name_norm);
CREATE INDEX idx_pers_sdx ON persons(name_soundex);
CREATE INDEX idx_pers_role ON persons(role, source_dataset);
CREATE INDEX idx_pers_item ON persons(certificate_id, role);
CREATE INDEX idx_pers_contract ON persons(contract_number);
CREATE INDEX idx_names_person ON person_names(person_id);
CREATE INDEX idx_names_norm ON person_names(value_norm);
CREATE INDEX idx_rel_cert ON relations(certificate_id);
CREATE INDEX idx_ann_item ON annotations(item_id);
CREATE INDEX idx_loc_norm ON locations(location_norm);
"""

FTS = """
CREATE VIRTUAL TABLE persons_fts USING fts5(
  full_name, given_name, surname, alias, former_name, location, occupation,
  plantation_name, district, address_text,
  content='persons', content_rowid='person_id',
  tokenize="unicode61 remove_diacritics 2");
CREATE VIRTUAL TABLE persons_phonetic_fts USING fts5(
  name_phonetic, content='persons', content_rowid='person_id');
"""

# Year backfill and lookup indexes used by the search page.
# Several datasets store the record date only as text (e.g. '17-09-1858'), and
# persons other than the main subject (parents, witnesses) carry no date at all;
# give them the year of their record so period filters include them.
YEARS_AND_INDEXES = """
UPDATE certificates SET event_year = CAST(substr(COALESCE(event_date, cert_date), -4) AS INTEGER)
 WHERE event_year IS NULL AND COALESCE(event_date, cert_date) GLOB '*[12][0-9][0-9][0-9]';
UPDATE certificates SET event_year = CAST(substr(COALESCE(event_date, cert_date), 1, 4) AS INTEGER)
 WHERE event_year IS NULL AND COALESCE(event_date, cert_date) GLOB '[12][0-9][0-9][0-9]-*';
UPDATE persons SET event_year = (SELECT c.event_year FROM certificates c
                                  WHERE c.certificate_id = persons.certificate_id)
 WHERE event_year IS NULL;
CREATE INDEX IF NOT EXISTS idx_rel_from ON relations(from_person);
CREATE INDEX IF NOT EXISTS idx_rel_to ON relations(to_person);
CREATE INDEX IF NOT EXISTS idx_pers_year ON persons(event_year);
CREATE INDEX IF NOT EXISTS idx_loc_cert ON locations(certificate_id);
-- Annotations from row-based loaders carry their certificate already; the rest
-- (e.g. curator comment exports) get one only where the item id is unambiguous.
DROP TABLE IF EXISTS temp.unique_items;
CREATE TEMP TABLE unique_items AS
  SELECT source_dataset, item_id, MIN(certificate_id) AS certificate_id FROM certificates
   WHERE item_id IS NOT NULL GROUP BY source_dataset, item_id HAVING COUNT(*) = 1;
CREATE INDEX temp.idx_unique_items ON unique_items(source_dataset, item_id);
UPDATE annotations SET certificate_id = (
    SELECT u.certificate_id FROM temp.unique_items u
     WHERE u.source_dataset = annotations.source_dataset AND u.item_id = annotations.item_id)
 WHERE certificate_id IS NULL AND item_id IS NOT NULL;
DROP TABLE temp.unique_items;
CREATE INDEX IF NOT EXISTS idx_ann_ds_item ON annotations(source_dataset, item_id);
CREATE INDEX IF NOT EXISTS idx_ann_cert ON annotations(certificate_id);

-- Stable key per person observation, derived from the source rather than from
-- insertion order: dataset / the record's own id (or scan id) / role, with a
-- counter only where that is not unique (several records per scan, or several
-- persons with the same role). Used for bookmarkable links on the search page.
DROP TABLE IF EXISTS temp.obs;
CREATE TEMP TABLE obs AS
  SELECT p.person_id,
         p.source_dataset || '/' || COALESCE(c.record_id, c.item_id, 'c' || c.certificate_id) || '/' || p.role AS base,
         ROW_NUMBER() OVER (PARTITION BY p.source_dataset, COALESCE(c.record_id, c.item_id, 'c' || c.certificate_id), p.role
                            ORDER BY p.person_id) AS n
    FROM persons p JOIN certificates c ON c.certificate_id = p.certificate_id;
CREATE UNIQUE INDEX temp.idx_obs ON obs(person_id);
UPDATE persons SET obs_key = (SELECT base || CASE WHEN n > 1 THEN '-' || n ELSE '' END
                                FROM temp.obs WHERE obs.person_id = persons.person_id);
DROP TABLE temp.obs;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pers_obs ON persons(obs_key);
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

-- Distinct contract numbers (with counts) so substring contract search scans
-- a few thousand rows instead of the 1.9M-row persons table.
DROP TABLE IF EXISTS contract_numbers;
CREATE TABLE contract_numbers AS
  SELECT contract_number, COUNT(*) AS person_count,
         GROUP_CONCAT(DISTINCT source_dataset) AS datasets
    FROM persons
   WHERE contract_number IS NOT NULL AND contract_number <> ''
   GROUP BY contract_number;
CREATE INDEX idx_contract_numbers ON contract_numbers(contract_number);

-- One row per normalised place string, for the place search on the search page.
DROP TABLE IF EXISTS places;
CREATE TABLE places AS
  SELECT location_norm AS place_norm, MIN(raw_text) AS label,
         COUNT(DISTINCT certificate_id) AS records,
         GROUP_CONCAT(DISTINCT source_dataset) AS datasets
    FROM locations
   WHERE location_norm IS NOT NULL AND location_norm <> ''
   GROUP BY location_norm;
CREATE INDEX idx_places_norm ON places(place_norm);
CREATE INDEX idx_places_records ON places(records DESC);
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
    ('12-migratie-datasets', 'Migration registers (Hindostani/Chinese/Javanese)', 'Restricted - no reuse pending', 1, 'data/12-migratie-datasets', 'No public reuse until written terms'),
    ('13-civil', 'Civil records (births/deaths/recognitions/marriages)', 'Embargoed raw data', 1, 'data/13-Civil_records_under_embargo_raw_data', 'Local use only'),
]

# 'data/02-' -> '02-death', taken from the raw_path of each source.
DATASET_BY_FOLDER = {raw_path[:8]: dataset for dataset, _, _, _, raw_path, _ in SOURCES}

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
                'plantation_name', 'ward_code', 'address_text', 'source_file', 'record_id')
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
                slavenregister_id, role, role_index, status, confidence, raw_prefix, source_file,
                name_phonetic)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
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
             clean(kw.get('status')), kw.get('confidence') or 'certain', clean(kw.get('raw_prefix')), source_file,
             phonetic_keys(full, alias, former)))
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

    def add_annotation(self, item_id, text, source_file, user_id=None, timestamp=None, status=None,
                       source_dataset=None, certificate_id=None):
        text = clean(text)
        if not text:
            return
        # Every data folder belongs to one dataset ('data/12-…' -> '12-migratie-datasets');
        # certificate_id is filled in after loading where the caller does not know it.
        source_dataset = source_dataset or DATASET_BY_FOLDER.get((source_file or '')[:8])
        self.conn.execute(
            """INSERT INTO annotations (item_id, user_id, timestamp, text, status, source_file,
                                        source_dataset, certificate_id)
               VALUES (?,?,?,?,?,?,?,?)""",
            (item_id, user_id, timestamp, text, status, source_file, source_dataset, certificate_id))
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
            record_id=clean(row.get('id')),
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
                               row.get('notes_all'), source_file, certificate_id=cert)
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
    # informant (aangever) reported the birth or death; recorded exactly as on the certificate
    informant = ref('informant')
    if informant and (deceased or child):
        builder.add_relation(cert, 'informant', informant, deceased or child, 'certain', 'informant',
                             source_file)


def link_side_persons(builder, cert, ids, side_people):
    """Create relations for persons loaded from folder-13 side tables.

    Master-row persons are linked by link_within_certificate. Side-table persons
    (witnesses-plat, parents_groom/bride-plat, children-plat, comparanten-plat)
    used to be inserted without any relation. Rules:
      * mother -> child within the same side row (erkenningen children-plat)
      * declarant -> every child of the certificate (erkenningen comparanten)
      * parent_groom -> groom, parent_bride -> bride (marriages)
      * witness -> the certificate subject (master deceased/child/groom,
        otherwise the first side-table child)
    Custodians and children listed on marriage certificates are left unlinked:
    their relation to groom/bride is not explicit in the source.
    """
    def master(role):
        return ids.get((role, None))

    side_children = [(pid, f, n) for role, pid, f, n in side_people if role == 'child']
    all_children = ([master('child')] if master('child') else []) + [pid for pid, _, _ in side_children]
    subject = master('deceased') or master('child') or master('groom') or \
        (side_children[0][0] if side_children else None)
    groom, bride = master('groom'), master('bride')

    for role, pid, sfile, row_no in side_people:
        if role == 'mother':
            for child, cfile, cno in side_children:
                if cfile == sfile and cno == row_no:
                    builder.add_relation(cert, 'parent-child', pid, child, 'certain', 'mother', sfile)
        elif role == 'declarant':
            for child in all_children:
                builder.add_relation(cert, 'declarant', pid, child, 'certain', 'declarant', sfile)
        elif role == 'parent_groom' and groom:
            builder.add_relation(cert, 'parent-child', pid, groom, 'certain', 'parent_groom', sfile)
        elif role == 'parent_bride' and bride:
            builder.add_relation(cert, 'parent-child', pid, bride, 'certain', 'parent_bride', sfile)
        elif role == 'witness' and subject:
            builder.add_relation(cert, 'witness', pid, subject, 'certain', f'witness_row{row_no}', sfile)


PLACE_REFERENCE = re.compile(
    r'^(op |in |ter |te )?(den |de |het )?(gemelde|opgemelde|genoemde?n?|voornoemde?n?|die|deze|dezelfde|zelfde)'
    r'( plantage| houtgrond| grond| plaats)?\s*$|^aldaar$|^idem$|^als boven$', re.I)


def is_place_reference(value):
    """True for a place field that only points back ('gemelde plantage', 'aldaar')."""
    return bool(PLACE_REFERENCE.match(clean(value) or ''))


def scan_inventory(item_id):
    """'NL-HaNA_2.10.61_2068H_0001' -> '2068H' (inventory number inside a scan id)."""
    m = re.match(r'^[A-Z]{2}-[A-Za-z]+_\d+(?:\.\d+)+_([^_]+)_', item_id or '')
    return m.group(1) if m else None


def load_folder13(builder):
    def load_collection(folder, collection, register, master_specs, side_tables):
        master_path = os.path.join(folder, 'nonrepeatable-fields-plat.csv')
        if not os.path.exists(master_path):
            return
        source_file = os.path.relpath(master_path, REPO_ROOT)
        _, master_rows = read_table(master_path)
        # marginal notes (kantmeldingen), one or more per certificate
        notes, notes_file = defaultdict(list), None
        notes_path = os.path.join(folder, 'notes-plat.csv')
        if os.path.exists(notes_path):
            notes_file = os.path.relpath(notes_path, REPO_ROOT)
            for nrow in read_table(notes_path)[1]:
                notes[clean(nrow.get('itemID'))].append(nrow)
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
            folio = clean(row.get('folio')) or clean(row.get('folio1'))
            folio2 = clean(row.get('folio2'))
            if folio and folio2 and folio2 != folio:
                folio = f'{folio}-{folio2}'
            # marriage registers also hold divorce certificates (cert_type)
            record_type = collection
            if 'echtscheiding' in (row.get('cert_type') or '').lower():
                record_type = 'echtscheidingen'
            cert = builder.add_certificate(
                source_dataset='13-civil', record_type=record_type, collection=collection,
                register=register, item_id=item_id, inventory_number=scan_inventory(item_id),
                folio=folio, cert_date=clean(row.get('cert_date')),
                cert_place=clean(row.get('cert_place')),
                cert_location=clean(row.get('cert_location')), source_file=source_file)
            for note in notes.get(item_id, ()):
                note_type = clean(note.get('note_type_other')) or clean(note.get('note_type'))
                text = clean(note.get('note_txt'))
                if text or (note_type and not note_type.lower().startswith('geen kantmelding')):
                    builder.add_annotation(item_id, text or note_type, notes_file,
                                           status=f'kantmelding: {note_type}' if note_type else 'kantmelding',
                                           source_dataset='13-civil', certificate_id=cert)
            ids = {}
            for person in extract_role_persons(row, master_specs):
                pid = builder.add_person(cert, '13-civil', person['role'], source_file,
                                         **{k: v for k, v in person.items() if k != 'role'})
                ids[(person['role'], person.get('role_index'))] = pid
            side_people = []   # (role, person_id, side_file, row_number)
            for _name, (sfile, specs, by_item) in side.items():
                for row_no, srow in enumerate(by_item.get(item_id, ()), start=1):
                    for person in extract_role_persons(srow, specs):
                        pid = builder.add_person(cert, '13-civil', person['role'], sfile,
                                                 **{k: v for k, v in person.items() if k != 'role'})
                        side_people.append((person['role'], pid, sfile, row_no))
            link_within_certificate(builder, cert, ids, source_file, '13-civil')
            link_side_persons(builder, cert, ids, side_people)
            for column in ('cert_place', 'cert_location', 'birth_place', 'inf_place',
                           'moth_place', 'groom_place', 'bride_place'):
                builder.add_location(cert, row.get(column), column, '13-civil')
            # "gemelde plantage", "aldaar", "genoemde houtgrond": the birth (or mother's)
            # place refers back to the place named earlier in the certificate, normally
            # the informant's residence. Add that place as a resolved location.
            earlier = clean(row.get('inf_place'))
            if earlier and not is_place_reference(earlier):
                for column in ('birth_place', 'moth_place'):
                    if is_place_reference(row.get(column)):
                        builder.add_location(cert, earlier, f'{column} (resolved)', '13-civil',
                                             precision='resolved reference')
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
            record_id=clean(row.get('Id')),
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
        builder.add_annotation(item, row.get('Eigenaar'), source_file, status='owner_prose',
                               certificate_id=cert)
        for column in ('Enslaved_Remarks', 'Freeperson_Remarks', 'Annotaties', 'Diversen',
                       'Adress_Remarks', 'Remarks_Orig', 'Invoer_Remarks'):
            builder.add_annotation(item, row.get(column), source_file, status=column, certificate_id=cert)
        for column in ('Straatnaam', 'Address_Full'):
            builder.add_location(cert, row.get(column), column, '04-ward-registers')
        builder.add_location(cert, 'Paramaribo', 'cert_place', '04-ward-registers')
        builder.add_location(cert, row.get('Buurt'), 'Buurt', '04-ward-registers')
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
        builder.add_annotation(item, row.get('Family_relations'), source_file, status='family_relations',
                               certificate_id=cert)
        builder.add_annotation(item, row.get('Remarks_ER'), source_file, status='remarks_ER',
                               certificate_id=cert)
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
                builder.add_annotation(clean(row.get('recordid')), raw, source_file, status=column,
                                       certificate_id=cert)
        for column in ('slaven', 'generaal_totaal_slaven', 'plantage_mannelijke_niet_vrije_bewoners',
                       'plantage_vrouwelijke_niet_vrije_bewoners', 'totaal_generaal_bewoners',
                       'vrije_bewoners'):
            count = to_int(row.get(column))
            if count:
                builder.add_group(cert, column, count, 'almanak head-count', '06-almanakken', source_file)
        builder.add_annotation(clean(row.get('recordid')), row.get('additional_info'), source_file,
                               status='additional_info', certificate_id=cert)
        builder.add_location(cert, row.get('plantation_std'), 'plantation_std', '06-almanakken')
        builder.add_location(cert, row.get('district_of_divisie'), 'district_of_divisie', '06-almanakken')
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
            builder.add_location(cert, row.get('plantation_std'), 'plantation_std', '06-almanakken')
            builder.add_location(cert, row.get('district_of_divisie'), 'district_of_divisie', '06-almanakken')
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
            builder.add_annotation(clean(row.get('recordid')), row.get('OVERIG'), xfile, status='overig',
                                   certificate_id=cert)
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
                               status='opmerking', certificate_id=builder_cert)
        for column in ('scan_registratielijst', 'scan_klapper'):
            url = clean(row.get(column))
            if url and url.startswith('http'):
                builder.add_annotation(item, url, source_file, status=column, certificate_id=builder_cert)
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
                    # the card's date is the person's birth date; the record itself is the 1950 census
                    folio=clean(front.get('Volgnummer')), event_year=1950,
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
                                           status='huwelijksdatum', certificate_id=cert)
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
            builder.add_annotation(clean(row.get('ID')), remarks, source_file, status='bijzonderheden',
                                   certificate_id=cert)
            kind_map = {'kind van': 'parent-child', 'zuster van': 'sibling', 'dochter van': 'parent-child',
                        'zoon van': 'parent-child', 'broer van': 'sibling'}
            for phrase, rtype in kind_map.items():
                if phrase in remarks.lower():
                    other = re.sub(rf'^.*?{re.escape(phrase)}\s+', '', remarks, flags=re.I).strip(' .')
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
            builder.add_location(cert, row.get('Locatie'), 'Locatie', '11-madeisu')
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


# Column layouts of the headerless HDS exports (NT00345 / NT00347 / NT00346).
# Field names follow the labels on the Nationaal Archief index pages
# (https://www.nationaalarchief.nl/onderzoeken/index/<nt>/<uuid>), checked
# record by record against the CSV columns.
MIGRATION_LAYOUTS = {
    'hindostani': {
        'path': MIG_HIND,
        'fields': {1: 'contract_number', 2: 'surname', 3: 'given_name', 4: 'ship',
                   5: 'muster_number', 6: 'birth_country', 7: 'height', 8: 'skin_colour',
                   9: 'sex', 10: 'age', 11: 'occupation', 12: 'identifying_mark',
                   13: 'religion', 17: 'departure_place', 19: 'departure_date',
                   20: 'recruiter', 22: 'arrival_date', 23: 'arrival_place', 24: 'planter',
                   25: 'plantation', 30: 'exit_status', 39: 'court_ruling', 40: 'memo',
                   41: 'children', 42: 'kinship_refs', 44: 'uuid'},
        'origin': {14: 'district', 15: 'police_post', 16: 'village'},
    },
    'chinese': {
        'path': MIG_CHIN,
        'fields': {1: 'contract_number', 2: 'muster_number', 3: 'surname', 4: 'father_name',
                   6: 'arrival_year', 9: 'birth_country', 11: 'skin_colour', 13: 'sex',
                   14: 'age', 16: 'religion', 18: 'departure_place', 19: 'departure_date',
                   21: 'recruiter', 22: 'arrival_date', 24: 'arrival_place', 25: 'ship',
                   26: 'planter', 31: 'recontracts', 32: 'plantation', 38: 'death_date',
                   40: 'free_labourer_code', 41: 'district', 42: 'memo', 43: 'uuid'},
        'origin': {17: 'place_of_origin'},
    },
    'javanese': {
        'path': MIG_JAVA,
        'fields': {1: 'given_name', 2: 'father_name', 3: 'birth_country', 4: 'height',
                   5: 'identifying_mark', 6: 'sex', 7: 'age', 9: 'religion',
                   10: 'departure_place', 11: 'departure_date', 13: 'ship',
                   15: 'muster_number', 16: 'arrival_place', 19: 'planter', 20: 'recruiter',
                   21: 'contract_number', 22: 'contract_start', 36: 'death_date',
                   38: 'return_date', 40: 'return_ship', 41: 'civil_status_notes',
                   42: 'kinship_refs', 43: 'family_notes', 44: 'recontracts',
                   45: 'land_situation', 35: 'plantation', 46: 'memo', 47: 'photo_url',
                   48: 'uuid'},
        'origin': {31: 'residency', 32: 'division', 33: 'district', 34: 'village'},
    },
}

# Free-text columns kept as annotations on the record (status = field name).
MIGRATION_NOTE_FIELDS = ('memo', 'kinship_refs', 'court_ruling', 'recontracts',
                         'civil_status_notes', 'family_notes', 'land_situation')

# HDS exports escape with backslashes: \" is a quote, \\ a backslash, \n a line break.
_HDS_ESCAPES = {'\\': '\x00B', '"': '""', 'n': '\x00N'}


def _read_headerless(path):
    """Read an HDS export: no header row, backslash escapes inside quoted fields."""
    with open(path, encoding='utf-8-sig', newline='') as handle:
        text = handle.read()
    text = re.sub(r'\\(.)', lambda m: _HDS_ESCAPES.get(m.group(1), m.group(0)), text)
    return [[v.replace('\x00B', '\\').replace('\x00N', '\n') for v in row]
            for row in csv.reader(text.splitlines(), delimiter=sniff_delimiter(path))]


def contract_key(code):
    """Normalise 'AA/117', '117/AA' and 'AA117' (also '382a/KG') to 'AA/117'."""
    if not code:
        return None
    s = re.sub(r'\s+', '', str(code)).upper()
    m = (re.fullmatch(r'([A-Z]+)/?(\d+[A-Z]?)', s) or
         re.fullmatch(r'(\d+[A-Z]?)/([A-Z]+)', s))
    if not m:
        return None
    letters, number = m.groups() if m.group(1).isalpha() else m.groups()[::-1]
    return f'{letters}/{number}'


# Kinship phrase -> (relation_type, direction, detail); direction 'out' means
# "this person is <kind> of the referenced person".
KINSHIP_KINDS = {
    'moeder': ('parent-child', 'out', 'mother'), 'm/v': ('parent-child', 'out', 'mother'),
    'vader': ('parent-child', 'out', 'father'), 'v/v': ('parent-child', 'out', 'father'),
    'zoon': ('parent-child', 'in', 'son'), 'z/v': ('parent-child', 'in', 'son'),
    'dochter': ('parent-child', 'in', 'daughter'), 'd/v': ('parent-child', 'in', 'daughter'),
    'kind': ('parent-child', 'in', 'child'),
    'vrouw': ('spouse', 'out', 'wife'), 'vr': ('spouse', 'out', 'wife'), 'vr/v': ('spouse', 'out', 'wife'),
    'echtgenote': ('spouse', 'out', 'wife'), 'man': ('spouse', 'out', 'husband'),
    'echtgenoot': ('spouse', 'out', 'husband'), 'gehuwd': ('spouse', 'out', 'married'),
    'leeft': ('partner', 'out', 'lives with'),
    'broer': ('sibling', 'out', 'brother'), 'broeder': ('sibling', 'out', 'brother'),
    'zuster': ('sibling', 'out', 'sister'), 'zus': ('sibling', 'out', 'sister'),
    'tweelingbroer': ('sibling', 'out', 'twin brother'), 'tweelingzus': ('sibling', 'out', 'twin sister'),
    'pleegmoeder': ('foster', 'out', 'foster mother'), 'pleegvader': ('foster', 'out', 'foster father'),
    'pleegzoon': ('foster', 'in', 'foster son'), 'pleegdochter': ('foster', 'in', 'foster daughter'),
}
# Short misspellings that edit distance cannot catch safely ('zon van 227/KG', 'mn van 781 AB').
KINSHIP_TYPOS = {'zon': 'zoon', 'mn': 'man', 'br': 'broer'}
# Series written in the Javanese register that has no records of its own there: the
# Marienburg estate numbering, which also turns up in the 1921 census.
OTHER_SERIES = {'MR'}
# Words that start a remark rather than a kinship phrase ('Correctie 513/UU'): the
# numbers after them are not relatives.
REMARK_WORDS = {'correctie', 'zie', 'opm', 'geen'}
# A clause that says it was written wrongly ('foutief geboekt Moet zijn van 962/VV') or
# crossed out is not linked; such phrases go to the list for checking by hand.
_STRUCK = re.compile(r'\b(?:foutief|doorgestre?ept|moet zijn)\b', re.I)
# Short words that look like a series before a number ('en 1484', 'of 642').
_NOT_A_SERIES = {'EN', 'OF', 'NO', 'NR'}

_KIN_WORD = re.compile(r'\s*([A-Za-z]+(?:/[A-Za-z]+)?)\.?\s*')
_WORD = re.compile(r'(?<![A-Za-z/])([A-Za-z]+(?:/[A-Za-z]+)?)(?![A-Za-z])')
_PREPOSITION = re.compile(r'^[?.:\s]*(?:[Vv](?:an?|na)(?![a-z])|[Vv](?![A-Za-z])|[Mm]et(?![a-z]))\.?\s*')
_DATE = re.compile(r'\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b')
# 'monsterrol nummer 306': the muster-roll number on the same ship. A plain 'no. N' is left
# out: it is the muster number in 'no. 9 (MM366)' (all 14 such phrases), but elsewhere a
# contract number ('no 58 FF') or a deed number ('ag no 1017'), so it is not linked.
_MUSTER_REF = re.compile(r'\bmonsterrol\s*(?:nummer|no|nr)\b\.?\s*(\d+)(?![\dA-Za-z])', re.I)
_NO_BEFORE_CODE = re.compile(r'\bno(?![a-z])\.?\s*(?=\d+[a-z]?\s*/?\s*[A-Z]{1,2}\b)', re.I)   # 'no 58 FF'
_NUMBER_REF = re.compile(r'\b(?:no|nr)(?![a-z])\.?\s*\d+[a-z]?|\b\d+[a-z]?\s*/?\s*(?:no|nr)\b\.?', re.I)
_RANGE = re.compile(r'(\d+)\s*t/m\s*(?:[A-Za-z]{1,2}\s*/?\s*)?(\d+)(?![\d])', re.I)              # 792 t/m VI 794
_RANGE_SUFFIX = re.compile(r'(\d+)([a-h])\s*t/m\s*(?:[A-Za-z]{1,2}\s*/?\s*)?\1([a-h])\b', re.I)  # 219b t/m 219e
_CODE = re.compile(r'''
    (?<![A-Za-z])(?P<l1>[A-Za-z]{1,2})\s*/?\s*(?P<n1>\d+)(?P<s1>[a-hA-H](?![A-Za-z]))?   # AA/117, VI 792, KG219e
        (?!\d|[a-hA-H]?\s*/\s*[A-Za-z])                                                # not 'EN 1721/YY'
  | (?P<n2>\d+)(?P<s2>[a-hA-H](?=[\s/]))?\s*                                            # 117/AA, 1802 WW,
        (?:/\s*(?P<l2a>[A-Za-z]{1,2})|(?P<l2b>[A-Za-z]{2}|[A-Z]))(?![A-Za-z])           # 41a MR, 181/a
  | (?P<n3>\d+)(?P<s3>[a-h])?(?![\dA-Za-z])                                             # 180, 34a
''', re.X)
_NOT_A_NAME = {'van', 'met', 'resp', 'alias'}


def _edit_distance(a, b):
    """Letters to add, drop or change, or neighbours to swap ('vadre' -> 'vader' is 1)."""
    d = [[i + j if not i * j else 0 for j in range(len(b) + 1)] for i in range(len(a) + 1)]
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] != b[j - 1]))
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                d[i][j] = min(d[i][j], d[i - 2][j - 2] + 1)
    return d[-1][-1]


def kinship_word(word):
    """Map a written kinship word to a KINSHIP_KINDS key, or None.

    Accepts the word glued to its preposition ('Vrouwvan', 'dochter/v', 'manv') and
    clerical misspellings ('Dochetr', 'Vropuw'): one wrong letter in a word of four
    or five letters, two in longer words, as long as only one kinship word is that close.
    """
    word = word.lower()
    for candidate in (word, re.sub(r'/(?:van|v)$', '', word), re.sub(r'(?:van|v)$', '', word)):
        if candidate in KINSHIP_KINDS:
            return candidate
        if candidate in KINSHIP_TYPOS:
            return KINSHIP_TYPOS[candidate]
    if len(word) < 4 or '/' in word:
        return None
    limit = 1 if len(word) <= 5 else 2
    close = {k for k in KINSHIP_KINDS if len(k) >= 4 and _edit_distance(word, k) <= limit}
    return close.pop() if len(close) == 1 else None


def _kinship_clauses(phrase):
    """Split a phrase at every kinship word: 'man van 791 vader van 792' -> two clauses.

    A misspelled or glued word ('vadre van') only counts when a preposition follows, so
    a name that happens to look like a kinship word does not split the phrase. Remark
    words ('Correctie 513/UU') also start a clause, which the caller then ignores.
    """
    starts = []
    for m in _WORD.finditer(phrase):
        word = m.group(1).lower()
        if m.start() == 0 or not (word in KINSHIP_KINDS or word in REMARK_WORDS or (
                kinship_word(word) and (re.search(r'(?:van|v)$', word)
                                        or _PREPOSITION.match(phrase[m.end():].lstrip('.'))))):
            continue
        starts.append(m.start())
    bounds = [0] + starts + [len(phrase)]
    return [phrase[a:b] for a, b in zip(bounds, bounds[1:]) if phrase[a:b].strip()]


def parse_kinship(refs, own_contract=None, series=None):
    """Yield (relation_type, direction, detail, confidence, contract_key, phrase).

    Handles the ways the registers write references: 'dochter van AA/130;AA/131',
    'Vrouw van 255/AA', 'dochter van 382+382a/KG', 'Man van 237VI', 'Z/v667 en 668',
    'vrouw vanAB668', 'Gehuwd met 2133/WW', 'man van 791 vader van VI 792 t/m 794',
    'Vrouw van 167Mr. (PP3)'. See docs/person-search-kinship-linking.md for the rules.

    A reference without series letters ('Vrouw van 180', 'dochter van 34 en 34a')
    takes the letters of another code in the same clause, or else of the person's own
    contract; in the latter case the link is only 'probable'. `series` is the set of
    series letters that occur in the register; letters outside it (and outside
    OTHER_SERIES) are not read as a series ('en 1484' is the number 1484).
    """
    own = contract_key(own_contract)
    own_letters = own.split('/')[0] if own else None
    known = None if series is None else set(series) | OTHER_SERIES
    for phrase in re.split(r'[|\n]', refs or ''):
        phrase = phrase.strip()
        if not phrase:
            continue
        text = re.sub(r'(?<![A-Za-z])([A-Z])(?:\.\s?|\s)([A-Z])(?:\.(?=\s|$))?(?![A-Za-z])',
                      r'\1\2', phrase)                                                 # 'V V', 'K.G.'
        text = re.sub(r'\b([Vv]an|v)(?=[A-Z]{1,2}\s*\d)', r'\1 ', text)              # 'vanAB 734', 'vAB 1091'
        text = re.sub(r'\b((?:[Mm]an|[Vv]r|[Vv]rouw))v\b', r'\1 v', text)            # 'manv AB1100'
        text = re.sub(r'(\d) ([a-d])\b', r'\1\2', text)                                # 'man van 207 a'
        text = re.sub(r'([a-z])([dzmv]/v)\b', r'\1 \2', text, flags=re.I)               # 'Roekijahd/v'
        dangling, previous, previous_key = False, '', None   # previous clause had no contract number
        found, phrase_letters = [], set()   # yielded at the end: bare numbers may need other clauses
        for clause in _kinship_clauses(text):
            m = _KIN_WORD.match(clause)
            written = m.group(1) if m else ''
            key = kinship_word(written)
            rtype, direction, detail = KINSHIP_KINDS[key] if key else ('related', 'out', written.lower())
            remark = written.lower() in REMARK_WORDS
            rest = clause[m.end():] if m else clause
            rest = _PREPOSITION.sub('', rest, count=1)
            rest = _DATE.sub(' ', rest)
            muster = _MUSTER_REF.findall(rest)
            rest = _NUMBER_REF.sub(' ', _NO_BEFORE_CODE.sub('', _MUSTER_REF.sub(' ', rest)))
            rest = _RANGE_SUFFIX.sub(lambda r: ', '.join(r[1] + chr(c) for c in range(
                ord(r[2].lower()), ord(r[3].lower()) + 1)), rest)
            rest = _RANGE.sub(lambda r: ', '.join(map(str, range(int(r[1]), int(r[2]) + 1)))
                              if 0 < int(r[2]) - int(r[1]) <= 20 else r[0], rest)
            confidence = 'probable' if '?' in clause or re.search(r'\bof\b', rest) else 'certain'
            parsed, leftover = [], rest
            for cm in _CODE.finditer(rest):
                letters = (cm['l1'] or cm['l2a'] or cm['l2b'] or '').upper()
                number = cm['n1'] or cm['n2'] or cm['n3']
                suffix = (cm['s1'] or cm['s2'] or cm['s3'] or '').upper()
                written_letters = cm['l1'] or cm['l2a'] or cm['l2b'] or ''
                if letters and known is not None and letters not in known and letters * 2 not in known \
                        and (letters in _NOT_A_SERIES or not written_letters.isupper()):
                    letters = ''   # 'en 1484': the letters were a word, the number stands alone
                if not letters and re.match(r'\s*(?:mr\.?)?\s*[(\[]', rest[cm.end():], re.I):
                    continue   # '324 (AC249)': the number in brackets is the contract, 324 another count
                parsed.append([letters or None, number + suffix, cm.start()])
                leftover = leftover.replace(cm[0], ' ', 1)
            named = any(w.lower() not in _NOT_A_NAME for w in re.findall(r'[A-Za-z]{3,}', leftover))
            # 'man van Pinmiten d/v 897/UU', 'leeft met d/v 2228/WW', 'Roegijem z/v 1184 JJ':
            # a filiation ('d/v', 'z/v') after a clause without a number describes the person
            # named or meant there, not the person of this record - unless a separator ends a
            # kinship clause before it ('geen vrouw. d/v 12'). ('Bok Siti is moeder van CC72'
            # is about the person of the record.)
            skip = '/' in written and dangling and (
                previous_key is None or not re.search(r'[.;,)]\s*$', previous))
            # 'D/v Anta AC828 en Bok Sari AG364' in the record of AG364: about her child
            # (without names, 'zoon van VI33 en VI34' in VI34 is a slip of the pen)
            if direction == 'in' and own and named and any(f'{p_letters}/{p_number}' == own
                                                 for p_letters, p_number, _ in parsed):
                skip = True
            dangling, previous, previous_key = not parsed and not muster, clause, key
            # an unknown word with free text around it ('Sakijo 1499VV op 6 dec 1948') is no kinship phrase
            if skip or remark or (key is None and named) or _STRUCK.search(clause):
                continue
            if not parsed:   # 'vrouw van monsterrol nummer 306': only the muster number to go on
                found += [(rtype, direction, detail, 'probable', '#', number) for number in muster]
            lettered = [(pos, p_letters) for p_letters, _, pos in parsed if p_letters]
            phrase_letters |= {p_letters for _, p_letters in lettered}
            for code_letters, number, pos in parsed:
                if not code_letters:
                    if named:   # bare numbers next to names or remarks are not contract numbers
                        continue
                    # '1 en 2/MR 734 en 733/AD': a bare number takes the letters of the next code,
                    # else of the one before
                    after = [l for p, l in lettered if p > pos]
                    before = [l for p, l in lettered if p < pos]
                    code_letters = (after[:1] or before[-1:] or [None])[0]
                found.append((rtype, direction, detail, confidence, code_letters, number))
        for rtype, direction, detail, confidence, code_letters, number in found:
            if code_letters == '#':
                yield rtype, direction, detail, confidence, f'#{number}', phrase
                continue
            if not code_letters:
                # the person's own series: a guess, unless the rest of the phrase writes that
                # same series ('Man van 530 en vader van 531/VI' in the record of VI529)
                code_letters = own_letters
                if phrase_letters != {own_letters}:
                    confidence = 'probable'
            if code_letters:
                yield rtype, direction, detail, confidence, f'{code_letters}/{number}', phrase


def resolve_kinship_ref(key, ship, by_contract, by_muster):
    """Return ((person_id, certificate_id) or None, confidence override or None) for a
    reference from parse_kinship: a contract key, or '#N' for muster number N on `ship`."""
    if key.startswith('#'):
        return by_muster.get((ship, key[1:])), None
    other = by_contract.get(key)
    if not other:
        # 'A/286' written for contract 'AA/286' (single for double letters)
        letters, number = key.split('/')
        if len(letters) == 1:
            return by_contract.get(f'{letters * 2}/{number}'), 'probable'
    return other, None


def load_migration(builder):
    for label, layout in MIGRATION_LAYOUTS.items():
        path = layout['path']
        if not os.path.exists(path):
            builder.log(f'  12-migratie/{label}: file not found, skipped')
            continue
        source_file = os.path.relpath(path, REPO_ROOT)
        records = _read_headerless(path)
        by_contract, by_muster, kinship = {}, {}, []
        for raw in records:
            values = {field: clean(raw[i]) if i < len(raw) else None
                      for i, field in layout['fields'].items()}
            # clean() joins lines; kinship references are split on line breaks, so keep them
            if 'kinship_refs' in values:
                index = next(i for i, f in layout['fields'].items() if f == 'kinship_refs')
                values['kinship_refs'] = (raw[index].strip() or None) if index < len(raw) else None
            uuid = values.get('uuid')
            event_raw = (values.get('arrival_date') or values.get('contract_start')
                         or values.get('arrival_year'))
            event_date, event_year, precision = parse_date(event_raw)
            cert = builder.add_certificate(
                source_dataset='12-migratie-datasets', record_type='contract_record',
                collection=f'migration-{label}', item_id=uuid,
                contract_number=values.get('contract_number'),
                registration_number=values.get('muster_number'),
                event_date=event_date if precision == 'day' else None, event_year=event_year,
                date_precision=precision,
                plantation_name=values.get('plantation'), district=values.get('district'),
                address_text=values.get('ship'), source_file=source_file)
            pid = builder.add_person(
                cert, '12-migratie-datasets', 'migrant', source_file,
                given_name=values.get('given_name'), surname=values.get('surname'),
                sex=values.get('sex'), age=values.get('age'),
                occupation=values.get('occupation'), religion=values.get('religion'),
                origin=values.get('birth_country'), death_date=values.get('death_date'),
                event_date=event_raw, contract_number=values.get('contract_number'),
                registration_number=values.get('muster_number'),
                plantation_name=values.get('plantation'), district=values.get('district'))
            builder.add_name(pid, 'father_name', values.get('father_name'), source_file)
            key = contract_key(values.get('contract_number'))
            if key:
                by_contract[key] = (pid, cert)
            if values.get('ship') and values.get('muster_number'):
                # a muster number shared by two records on one ship identifies neither
                muster = (values['ship'], values['muster_number'])
                by_muster[muster] = None if muster in by_muster else (pid, cert)
            if values.get('kinship_refs'):
                kinship.append((pid, cert, values['kinship_refs'], values.get('contract_number'),
                                values.get('ship')))
            for field in MIGRATION_NOTE_FIELDS:
                builder.add_annotation(uuid, values.get(field), source_file, status=field, certificate_id=cert)
            photo = values.get('photo_url') or ''
            if photo.startswith('http'):
                # the old gahetna.nl host is gone; the same path is served by nationaalarchief.nl
                photo = re.sub(r'^https?://www\.gahetna\.nl/', 'https://www.nationaalarchief.nl/', photo)
                builder.add_annotation(uuid, photo, source_file, status='photo_url', certificate_id=cert)
            for index, field in layout['origin'].items():
                value = raw[index] if index < len(raw) else None
                builder.add_name(pid, field, value, source_file)
                builder.add_location(cert, value, field, '12-migratie-datasets')
            builder.add_location(cert, values.get('plantation'), 'plantation', '12-migratie-datasets')

        # Kinship references point to other records of the same register by contract number
        # (or muster number on the same ship); see docs/person-search-kinship-linking.md.
        seen, linked, unresolved = set(), 0, 0
        series = {key.split('/')[0] for key in by_contract}
        for pid, cert, refs, own_contract, ship in kinship:
            for rtype, direction, detail, confidence, key, phrase in parse_kinship(refs, own_contract, series):
                other, override = resolve_kinship_ref(key, ship, by_contract, by_muster)
                confidence = override or confidence
                if not other or other[0] == pid:
                    unresolved += 1
                    continue
                a, b = (pid, other[0]) if direction == 'out' else (other[0], pid)
                if rtype in ('spouse', 'partner', 'sibling', 'related'):
                    pair = (rtype, min(a, b), max(a, b))
                else:
                    pair = (rtype, a, b)
                if pair in seen:
                    continue
                seen.add(pair)
                builder.add_relation(cert, rtype, a, b, confidence, phrase, source_file)
                linked += 1
        builder.log(f'  12-migratie/{label}: {len(records)} records, '
                    f'{linked} kinship links, {unresolved} references not resolved')


def name_keys(name):
    return {k for k in (phonetic_key(w) for w in re.split(r'[^\w]+', name or '')) if k}


# 'd/v 375/OO' = dochter van (daughter of), 'z/v' = zoon van (son of) the migrant
# with that contract; other prefixes are kept as a generic relation.
CENSUS_KIN = {'d': ('parent-child', 'daughter of'), 'z': ('parent-child', 'son of')}


def link_census_to_migration(builder):
    """Link 1921 census residents to migration register records by contract number.

    The 1921 census notes a contract number ('904/UU') for former contract labourers,
    or 'd/v'/'z/v' + contract number for their children. These are candidate links,
    stored as relations with a confidence, never merged:
      * same contract and a shared name key  -> same-person, probable
      * same contract, exactly one record, no shared name key -> same-person, possible
      * 'd/v' / 'z/v' + contract             -> parent-child, probable
    Hindostani and Javanese contract series overlap (AA/1 exists in both), so a
    contract alone that matches records in two registers is not linked.
    """
    conn = builder.conn
    migrants = defaultdict(list)
    for pid, cert, contract, name in conn.execute(
            """SELECT person_id, certificate_id, contract_number, full_name FROM persons
               WHERE source_dataset = '12-migratie-datasets' AND contract_number IS NOT NULL"""):
        key = contract_key(contract)
        if key:
            migrants[key].append((pid, name_keys(name)))
    counts = Counter()
    rows = conn.execute(
        """SELECT person_id, certificate_id, contract_number, full_name, source_file FROM persons
           WHERE source_dataset = '09-volkstelling-1921' AND contract_number IS NOT NULL""").fetchall()
    for pid, cert, contract, name, source_file in rows:
        kin = re.match(r'^\s*(\w)/v\s*', contract, re.I)
        hits = migrants.get(contract_key(contract[kin.end():] if kin else contract), [])
        if not hits:
            counts['no migration record'] += 1
            continue
        if kin:
            if len(hits) > 1:
                # a child usually does not share the parent's name; only accept one register
                counts['kin ambiguous'] += 1
                continue
            rtype, detail = CENSUS_KIN.get(kin.group(1).lower(), ('related', f'{kin.group(1)}/v'))
            builder.add_relation(cert, rtype, hits[0][0], pid, 'probable',
                                 f'1921 census: {contract} ({detail})', source_file)
            counts[f'kin {rtype}'] += 1
            continue
        mine = name_keys(name)
        named = [h for h in hits if mine & h[1]]
        if len(named) == 1:
            builder.add_relation(cert, 'same-person', named[0][0], pid, 'probable',
                                 f'contract {contract} + name', source_file)
            counts['same-person probable'] += 1
        elif not named and len(hits) == 1:
            builder.add_relation(cert, 'same-person', hits[0][0], pid, 'possible',
                                 f'contract {contract}', source_file)
            counts['same-person possible'] += 1
        else:
            counts['ambiguous'] += 1
    builder.log('  1921 census <-> migration registers: ' +
                ', '.join(f'{k} {v}' for k, v in sorted(counts.items())))


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
    link_census_to_migration(builder)

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
    conn.executescript(YEARS_AND_INDEXES)
    conn.commit()
    builder.log(f'  years backfilled, relation indexes built ({time.time() - step:.1f}s)')

    step = time.time()
    conn.executescript(FTS)
    builder.log(f'  FTS table created ({time.time() - step:.1f}s)')
    step = time.time()
    conn.execute("INSERT INTO persons_fts(persons_fts) VALUES('rebuild')")
    conn.execute("INSERT INTO persons_phonetic_fts(persons_phonetic_fts) VALUES('rebuild')")
    conn.commit()
    builder.log(f'  FTS rebuilt ({time.time() - step:.1f}s)')

    # Repair impossible years (typos) before anything summarises years (fix_dates.py).
    import fix_dates
    fix_dates.run(conn, log=builder.log)

    step = time.time()
    conn.executescript(CROSS_DATASET)
    conn.commit()
    builder.log(f'  cross-dataset summary table built ({time.time() - step:.1f}s)')

    # Place linking: gazetteer + place_geo + locations.place_id (link_places.py).
    step = time.time()
    import link_places
    link_places.run(conn, log=builder.log)
    builder.log(f'  places linked ({time.time() - step:.1f}s)')

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
