#!/usr/bin/env python3
"""Link place mentions in the person search database to coordinates.

Adds to suriname_person_search.db:

  gazetteer   one row per live place of data/places-gazetteer.jsonld (plantations,
              1885 address points, settlements, rivers, districts, ...) plus derived
              street records for Paramaribo (type 'street', id 'stm-street-...').
  place_geo   one row per distinct locations.location_norm: the best guess of where
              that string is, with match_type, confidence (0-1) and a note.

and fills locations.place_id / locations.precision with that best guess.

Runs inside build_db.py, or on its own against an existing database (this keeps
tables that were added later, such as the mh1921_* tables):

    python3 scripts/person_search/link_places.py [path/to/suriname_person_search.db]

Stop Datasette first: the database is served read-only (--immutable).

The matching rules are ported from the app pipeline instead of being rewritten:
  - app/scripts/link-ward-registers-to-addresses.ts: regime ladder for ward-letter
    addresses (pre-1837 old regime, 1837 new regime, exact -> without suffix),
    street-name cross-check that demotes but never promotes, per-place certainty
    taken from the concordance links;
  - app/scripts/link-concordans-1885-places.ts / import-paramaribo-address-points-1885.ts:
    concordance rows -> 1885 address points (stm-1885-address-NNNN);
  - the street standardisation table of the ward registers for street variants.
It reads only committed derived artifacts:
  data/concordans-paramaribo/concordans-paramaribo-derived.csv
  data/concordans-paramaribo/locatiepunten1885-derived.csv
  data/paramaribo-address-concordance.json
  data/places-gazetteer.jsonld
  data/04-ward-registers .../street standardization 20240328.csv
  data/07-gis-plantation-map-1930/streetsParamaribo1916map.geojson
  data/08-place-points-qgis/export20260619/streetsParamaribo{1804,1772,1758}map.geojson
  data/01-plantages-dataset (PSUR ids), data/06-almanakken (Wikidata QIDs)

Every string gets ONE best guess (no manual review in this version). Where several
places are possible the confidence is divided by their number and the note says so.
"""

import csv
import io
import json
import os
import re
import sqlite3
import statistics
import sys
import time
import unicodedata
from collections import Counter, defaultdict

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DATA = os.path.join(REPO, 'data')


def P(*parts):
    return os.path.join(DATA, *parts)


GAZETTEER_JSON = P('places-gazetteer.jsonld')
CONCORDANCE_JSON = P('paramaribo-address-concordance.json')
CONCORDANS_CSV = P('concordans-paramaribo', 'concordans-paramaribo-derived.csv')
LP_CSV = P('concordans-paramaribo', 'locatiepunten1885-derived.csv')
STREET_STD_CSV = P('04-ward-registers - Paramaribo Ward Registers 1828-1847',
                   'Standardization of street names', 'street standardization 20240328.csv')
STREET_LAYERS = [  # newest first: the first layer that has a street gives its centroid
    (1916, P('07-gis-plantation-map-1930', 'streetsParamaribo1916map.geojson')),
    (1804, P('08-place-points-qgis', 'export20260619', 'streetsParamaribo1804map.geojson')),
    (1772, P('08-place-points-qgis', 'export20260619', 'streetsParamaribo1772map.geojson')),
    (1758, P('08-place-points-qgis', 'export20260619', 'streetsParamaribo1758map.geojson')),
]
PLANTATION_DATASET_CSV = P('01-plantages-dataset - Suriname Plantation Dataset Version 1.0',
                           'Suriname Plantation Dataset Version 1.0.csv')
ALMANAKKEN_CSV = P('06-almanakken - Plantations Surinaamse Almanakken',
                   'Plantations Surinaamse Almanakken v2.0 (1).csv')

STM_PLACE = 'https://data.surinametijdmachine.org/place/'

MUNTJEWERFF_ATTRIBUTION = (
    'For historical addresses in Paramaribo we are grateful for the Concordans by Dr. '
    'Muntjewerff, see https://www.concordansparamaribo.info/. This is a pilot version and can '
    'contain mistakes that are not attributable to Dr. Muntjewerff.')

# The Militair Hospitaal / 's Lands Hospitaal: 1885 point Gravenstraat B2
# ("1854: Militair hospitaal; 1885: Hospitaal; 1916: Militair hospitaal").
HOSPITAL_ID = 'stm-1885-address-0327'
PARAMARIBO_ID = 'stm-06330'

# --- Confidence scores (0-1). One place per string; n candidates -> score / n. ---
SCORE_ID = 1.0                 # Wikidata QID (almanakken) or PSUR id (slave registers)
SCORE_ID_SHARED_PSUR = 0.9     # PSUR id that the gazetteer holds on several records
SCORE_NAMED_BUILDING = 0.95    # e.g. militair hospitaal
SCORE_ADDRESS_EXACT = 0.9      # ward letter + number + suffix
SCORE_ADDRESS_NO_SUFFIX = 0.7  # suffix dropped
SCORE_ADDRESS_OW_NO_BUURT = 0.75
SCORE_ADDRESS_1921 = 0.8       # street + house number of the 1921 numbering
SCORE_ADDRESS_1950 = 0.6       # 1950 numbering read as 1921 numbering
PENALTY_STREET_MISMATCH = 0.2  # street named in the string differs from the concordance
FACTOR_PROBABLE_LINK = 0.85    # concordance link itself only 'probable'
FACTOR_MIXED_PERIODS = 0.9     # mentions of the string spread over numbering regimes
SCORE_STREET_EXACT = 0.9
SCORE_STREET_FROM_ADDRESS = 0.7  # address with a number we could not place; street only
SCORE_STREET_FUZZY = 0.6
SCORE_NAME_UNIQUE = 0.8
SCORE_NAME_WITH_DISTRICT = 0.85
SCORE_CONTEXT_WORD = 0.5       # 'alhier' -> Paramaribo

STREET_WORDS = ('straat', 'gracht', 'weg', 'plein', 'pad', 'laan', 'kade', 'dam', 'brug',
                'wijk', 'steeg', 'markt', 'waterkant', 'hoogestraat')
UNPLACED_CONTEXT = {
    'aldaar', 'voormeld huis', 'in voormeld huis', 'in het voormeld huis', 'voormeld district',
    'gemelde plantage', 'voormelde plantage', 'als voren', 'idem', 'id', 'dezelfde',
    'in deze kolonie', 'deze kolonie', 'kolonie suriname', 'suriname', 'in suriname',
    'in deze colonie', 'onbekend', 'niet vermeld', 'op zee', 'in garnizoen',
}
CONTEXT_PARAMARIBO = {'alhier', 'te paramaribo', 'in paramaribo', 'paramaribo alhier', 'hier'}
NAME_PREFIXES = re.compile(
    r'^(?:(?:te|in|op|aan|van|de|het|op de|aan de)\s+)*'
    r'(?:(?:suiker|koffie|katoen|cacao|hout)?plantage|plant\.?|pl\.?|houtgrond|kostgrond|grond|'
    r'erve|district|divisie|dorp|kamp|post|fort|station)\s+', re.I)
DISTRICT_WORDS = ['commewijne', 'cottica', 'suriname', 'para', 'saramacca', 'nickerie', 'coronie',
                  'marowijne', 'perica', 'matappica', 'warappa', 'thorarica', 'motkreek', 'tempatie']


# ---------------------------------------------------------------------------
# Normalisation (location_norm is build_db.normalize: lower case, no accents,
# single spaces)
# ---------------------------------------------------------------------------

def strip_diacritics(text):
    return ''.join(ch for ch in unicodedata.normalize('NFKD', text) if not unicodedata.combining(ch))


def normalize(text):
    if not text:
        return None
    return ' '.join(strip_diacritics(str(text)).lower().split()) or None


def key(text):
    """Comparison key: letters and digits only."""
    return re.sub(r'[^a-z0-9]', '', strip_diacritics(text or '').lower().replace('&', 'en'))


def clean(value):
    return (value or '').replace('﻿', '').strip()


def name_core(text):
    """Core name of a place string, plus bracketed / trailing context words."""
    s = normalize(text) or ''
    context = ' '.join(re.findall(r'\(([^)]*)\)', s))
    s = re.sub(r'\([^)]*\)', ' ', s)
    s = s.replace('&', ' en ')
    s = NAME_PREFIXES.sub('', s.strip())
    s = re.sub(r'^(?:pl|plant)\.\s*', '', s)
    return key(s), context


def district_tokens(text):
    s = normalize(text) or ''
    s = s.replace('ben.', 'beneden ').replace('bov.', 'boven ').replace('comm.', 'commewijne ')
    toks = set()
    for w in DISTRICT_WORDS:
        if w in s or (len(w) > 5 and w[:5] in s):
            toks.add(w)
    for w in ('beneden', 'boven'):
        if w in s:
            toks.add(w)
    return toks


def levenshtein(a, b, limit):
    if abs(len(a) - len(b)) > limit:
        return limit + 1
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        best = i
        for j, cb in enumerate(b, 1):
            v = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb))
            cur.append(v)
            best = min(best, v)
        if best > limit:
            return limit + 1
        prev = cur
    return prev[-1]


def read_csv(path, delimiter=',', encoding='utf-8-sig'):
    with open(path, encoding=encoding, errors='replace', newline='') as fh:
        return list(csv.DictReader(fh, delimiter=delimiter))


# ---------------------------------------------------------------------------
# Reference data
# ---------------------------------------------------------------------------

class Gazetteer:
    def __init__(self):
        graph = json.load(open(GAZETTEER_JSON, encoding='utf-8'))['@graph']
        self.records = {}
        for x in graph:
            if x.get('deprecated'):
                continue
            names = [n.get('text') for n in x.get('names') or [] if n.get('text')]
            pref = x.get('prefLabel') or next(
                (n['text'] for n in x.get('names') or [] if n.get('isPreferred')), None) or (
                names[0] if names else None)
            alts = [a for a in (x.get('altLabels') or []) + names if a and a != pref]
            loc = x.get('location') or {}
            self.records[x['id']] = {
                'id': x['id'], 'uri': x.get('@id') or STM_PLACE + x['id'], 'prefLabel': pref,
                'altLabels': list(dict.fromkeys(alts)), 'type': x.get('type'),
                'lat': loc.get('lat'), 'lng': loc.get('lng'),
                'description': x.get('description') or None,
                'district': x.get('district'), 'broader': x.get('broader'),
                'has_polygon': str(loc.get('wkt') or '').lower().startswith(('polygon', 'multipolygon')),
                'qids': [e.get('identifier') for e in x.get('externalLinks') or []
                         if e.get('authority') == 'wikidata' and e.get('identifier')],
                'psur': list(x.get('psurIds') or []),
                'n_sources': len(x.get('sources') or []),
                'source': 'places-gazetteer.jsonld',
                '_alm_labels': [v for o in x.get('almanakkenObservations') or []
                                for v in (o.get('plantationStandardized'), o.get('plantationOriginal')) if v],
                '_alm_qids': [o.get('qid') for o in x.get('almanakkenObservations') or [] if o.get('qid')],
            }
        self.by_qid = defaultdict(set)
        self.by_psur = defaultdict(set)
        self.by_name = defaultdict(set)
        for r in self.records.values():
            for q in r['qids'] + r['_alm_qids']:
                self.by_qid[q].add(r['id'])
            for p in r['psur']:
                self.by_psur[p].add(r['id'])
            if r['type'] in ('historical-address', 'road'):
                continue
            for label in [r['prefLabel']] + r['altLabels'] + r['_alm_labels']:
                k, _ = name_core(label)
                if len(k) >= 3:
                    self.by_name[k].add(r['id'])

    def district_of(self, rid):
        r = self.records[rid]
        parts = [r.get('district') or '']
        b = self.records.get(r.get('broader') or '')
        if b:
            parts.append(b['prefLabel'] or '')
        return district_tokens(' '.join(parts))

    def canonical(self, ids):
        """Main record among several: polygon, then Wikidata, coordinates, most sources."""
        return sorted(ids, key=lambda i: (
            not self.records[i]['has_polygon'], not self.records[i]['qids'],
            self.records[i]['lat'] is None, -self.records[i]['n_sources'], i))[0]


class Streets:
    """Paramaribo streets: canonical names, spelling variants and a centroid."""

    def __init__(self, conc_rows, lp_rows):
        std = {}
        raw = open(STREET_STD_CSV, encoding='latin-1').read().replace('﻿', '')
        for line in raw.splitlines()[1:]:
            f = line.split(';')
            if len(f) >= 3 and f[1].strip() and f[2].strip():
                std[key(f[1])] = f[2].strip()
        self.std = std
        names = Counter()
        for r in conc_rows:
            for c in ('street1830', 'street1837', 'street1885'):
                if clean(r.get(c)):
                    names[clean(r[c])] += 1
            for c in ('address1921', 'address2022'):
                st = street_part(r.get(c))
                if st:
                    names[st] += 1
        for r in lp_rows:
            if clean(r.get('straatnaam1885')):
                names[clean(r['straatnaam1885'])] += 1
        self.layers = {}
        for year, path in STREET_LAYERS:
            if not os.path.exists(path):
                continue
            for f in json.load(open(path, encoding='utf-8'))['features']:
                nm = clean((f.get('properties') or {}).get('Name'))
                if not nm or nm.startswith('['):
                    continue
                names[nm] += 1
                pts = list(coords_of(f.get('geometry')))
                if pts:
                    self.layers.setdefault((key(self.canon(nm)), year), []).extend(pts)
        for v in std.values():
            names[v] += 1
        names.pop('onbekend', None)
        # Fallback geometry: the 1885 address points on that street, directly (1885 street
        # name) or through the concordance (1830/1837/1885/1921/2022 street names).
        lp_xy = {}
        self.lp_points = defaultdict(list)
        for r in lp_rows:
            if clean(r.get('lat')):
                xy = (float(r['lng']), float(r['lat']))
                lp_xy['stm-1885-address-' + str(int(r['lpId'])).zfill(4)] = xy
                if clean(r.get('straatnaam1885')):
                    self.lp_points[key(self.canon(r['straatnaam1885']))].append(xy)
        links = json.load(open(CONCORDANCE_JSON, encoding='utf-8'))['links']
        places_of_row = {l['sourceRow']: l.get('placeIds') or [] for l in links if l.get('sourceRow')}
        for r in conc_rows:
            pts = [lp_xy[p] for p in places_of_row.get(clean(r['sourceRow']), []) if p in lp_xy]
            if not pts:
                continue
            for c in ('street1830', 'street1837', 'street1885', 'address1921', 'address2022'):
                st = street_part(r.get(c)) if c.startswith('address') else clean(r.get(c))
                if st:
                    self.lp_points[key(self.canon(st))].extend(pts)
        # Spelling variants that only occur in the data ('Zwartenhovenbrugstaat') join the
        # nearest established name: names with a geometry or many attestations come first.
        has_geo = {ck for (ck, _y) in self.layers} | set(self.lp_points)
        weight = Counter()
        label_of = {}
        for nm, n in names.items():
            ck = key(self.canon(nm))
            if len(ck) >= 4:
                weight[ck] += n
                label_of.setdefault(ck, self.canon(nm))
        accepted, merged = [], {}
        for ck in sorted(weight, key=lambda c: (c not in has_geo, -weight[c], c)):
            limit = 1 if len(ck) <= 12 else 2
            near = [a for a in accepted if a[:3] == ck[:3] and levenshtein(ck, a, limit) <= limit]
            if near:
                merged[ck] = near[0]
            else:
                accepted.append(ck)
        self.merged = merged
        # canonical key -> record
        self.by_key = {}
        self.variant = {}
        for nm in list(names) + list(std.values()):
            ck = key(self.canon(nm))
            if len(ck) < 4 or ck in ('onbekend', 'geen', 'nvt', 'nietvermeld'):
                continue
            ck = merged.get(ck, ck)
            rec = self.by_key.setdefault(ck, {'label': label_of.get(ck, self.canon(nm)), 'variants': set()})
            rec['variants'].add(nm)
            self.variant[key(nm)] = ck
        for v, c in std.items():
            self.variant[v] = merged.get(key(c), key(c))
        for ck, rec in self.by_key.items():
            lat = lng = None
            src = None
            aliases = [ck] + [m for m, target in merged.items() if target == ck]
            for year, _ in STREET_LAYERS:
                pts = [p for a in aliases for p in self.layers.get((a, year), [])]
                if pts:
                    lng, lat = centroid(pts)
                    src = f'street layer {year}'
                    break
            lp_pts = [p for a in aliases for p in self.lp_points.get(a, [])]
            if lat is None and lp_pts:
                lng, lat = centroid(lp_pts)
                src = '1885 address points of this street'
            rec.update({'id': 'stm-street-' + slug(rec['label']), 'lat': lat, 'lng': lng, 'geo_source': src})
        self.keys = list(self.by_key)

    def canon(self, name):
        return self.std.get(key(name), clean(name))

    def layer_year(self, ck):
        m = re.search(r'layer (\d{4})', self.by_key[ck].get('geo_source') or '')
        return int(m.group(1)) if m else 0

    def lookup(self, name, fuzzy=False):
        k = key(name)
        if not k:
            return None, None
        ck = self.variant.get(k) or (k if k in self.by_key else None)
        if ck and ck in self.by_key:
            return self.by_key[ck], 'exact'
        if fuzzy and len(k) >= 7:
            limit = 1 if len(k) < 10 else 2
            hits = [(levenshtein(k, c, limit), c) for c in self.keys]
            hits = [h for h in hits if h[0] <= limit]
            if hits:
                best = min(h[0] for h in hits)
                tied = [c for d, c in hits if d == best]
                # Old-layer spellings (Graave Straat 1758) are their own records; on a tie
                # prefer the most recent street layer, then the most attested name.
                tied.sort(key=lambda c: (-self.layer_year(c), -len(self.by_key[c].get('variants', ())), c))
                return self.by_key[tied[0]], 'fuzzy'
        return None, None


def coords_of(geom):
    if not geom:
        return
    def walk(c):
        if c and isinstance(c[0], (int, float)):
            yield c[0], c[1]
        else:
            for x in c:
                yield from walk(x)
    yield from walk(geom.get('coordinates') or [])


def centroid(points):
    return (sum(p[0] for p in points) / len(points), sum(p[1] for p in points) / len(points))


def slug(text):
    return re.sub(r'[^a-z0-9]+', '-', strip_diacritics(text).lower()).strip('-')


def street_part(address):
    s = clean(address)
    m = re.match(r'^(.*?[a-z])\s*\d', s, re.I)
    return clean(m.group(1)) if m else (s if s and not re.search(r'\d', s) else None)


def parse_core_suffix(letter, number):
    """Port of parseCoreAndSuffix(): 'B', '12a' -> ('b12', 'a')."""
    compact = key(f'{letter}{number}')
    m = re.match(r'^(.+?)(\d+)([a-z]*)$', compact)
    if not m:
        return compact, ''
    return m.group(1) + str(int(m.group(2))), m.group(3)


class AddressIndex:
    """Ward-letter and 1921-number indexes over the Concordans Paramaribo."""

    def __init__(self, conc_rows, lp_rows, streets):
        links = json.load(open(CONCORDANCE_JSON, encoding='utf-8'))['links']
        self.link = {l['sourceRow']: l for l in links if l.get('sourceRow')}
        self.rows = {clean(r['sourceRow']): r for r in conc_rows}
        self.ow = defaultdict(list)        # letter|core|suffix (old regime, without buurt)
        self.nw = defaultdict(list)        # letter|core|suffix (1837 regime)
        self.nw_ns = defaultdict(list)     # letter|core
        self.n1921 = defaultdict(list)     # streetkey|number|suffix
        for r in conc_rows:
            sr = clean(r['sourceRow'])
            if clean(r.get('ow1817ParcelLetter')) and clean(r.get('ow1817ParcelNumber')):
                core, suf = parse_core_suffix(r['ow1817ParcelLetter'], r['ow1817ParcelNumber'] + clean(r.get('ow1817ParcelSuffix')))
                self.ow[f'{core}|{suf}'].append(sr)
            if clean(r.get('nw1837ParcelLetter')) and clean(r.get('nw1837ParcelNumber')):
                core, suf = parse_core_suffix(r['nw1837ParcelLetter'], r['nw1837ParcelNumber'] + clean(r.get('nw1837ParcelSuffix')))
                self.nw[f'{core}|{suf}'].append(sr)
                self.nw_ns[core].append(sr)
            for st, nums, suf in numbers_1921(r.get('address1921')):
                ck = streets.variant.get(key(st), key(st))
                for n in nums:
                    self.n1921[f'{ck}|{n}|{suf}'].append(sr)
                    if suf:
                        self.n1921[f'{ck}|{n}|'].append(sr)
        # 1885 address points by their own 1885 address (the numbering on the 1885 map)
        self.lp = defaultdict(list)
        self.lp_street = {}
        for r in lp_rows:
            if clean(r.get('isLinkableAddress')) != 'yes':
                continue
            pid = 'stm-1885-address-' + str(int(r['lpId'])).zfill(4)
            core, suf = parse_core_suffix(r['wijk1885'], clean(r['huisnummer1885']) + clean(r.get('toevoeging1885')))
            self.lp[f'{core}|{suf}'].append(pid)
            self.lp[core].append(pid)
            self.lp_street[pid] = key(streets.canon(r.get('straatnaam1885') or ''))

    def places_for_rows(self, srs, base):
        """Concordance rows -> {place_id: score}, with the per-place certainty of the link."""
        out = {}
        for sr in srs:
            link = self.link.get(sr)
            if not link:
                continue
            for pid in link.get('placeIds') or []:
                cert = (link.get('certaintyByPlace') or {}).get(pid, 'probable')
                score = base * (1.0 if cert == 'certain' else FACTOR_PROBABLE_LINK)
                out[pid] = max(out.get(pid, 0), score)
        return out

    def row_streets(self, srs, regime):
        cols = {'ow': ('street1830',), 'nw': ('street1837', 'street1885'), 'lp': ('street1885',)}[regime]
        return {key(self.rows[s].get(c)) for s in srs if s in self.rows for c in cols if self.rows[s].get(c)}


def numbers_1921(address):
    """'Grote Combeweg   5 t/m 11' -> ('Grote Combeweg', [5, 7, 9, 11], '')."""
    s = clean(address)
    m = re.match(r'^(.*?[a-z.])\s+(\d+)\s*([a-z]?)\s*(?:t/?m|-)?\s*(\d+)?\s*([a-z]?)\s*$', s, re.I)
    if not m:
        return []
    st, a, suf, b = m.group(1).strip(), int(m.group(2)), (m.group(3) or '').lower(), m.group(4)
    if b:
        b = int(b)
        step = 2 if (b - a) % 2 == 0 else 1
        nums = list(range(a, b + 1, step)) if 0 < b - a < 80 else [a]
        return [(st, nums, '')]
    return [(st, [a], suf)]


ADDR_LETTER = re.compile(
    r'^(?:paramaribo\s*,?\s*)?(?:in de |aan de |te )?(?P<street>[a-z][a-z .\'-]*?)\s*,?\s*'
    r'(?:letter\s*|wijk\s*)?(?P<letter>[a-f])\s*\.?\s*(?P<num>\d{1,4})\s*(?P<suf>[a-z])?\b(?P<rest>.*)$')
ADDR_NUMBER = re.compile(
    r'^(?:paramaribo\s*,?\s*)?(?P<street>[a-z][a-z .\'-]*?(?:' + '|'.join(STREET_WORDS) + r'))'
    r'\s*,?\s*(?:no\.?\s*|nr\.?\s*)?(?P<num>\d{1,4})\s*(?P<suf>[a-z])?\b(?P<rest>.*)$')
LETTER_ONLY = re.compile(r'^(?P<letter>[a-f])\s*\.?\s*(?P<num>\d{1,4})\s*(?P<suf>[a-z])?$')


# ---------------------------------------------------------------------------
# Matching one string
# ---------------------------------------------------------------------------

class Linker:
    def __init__(self, conn, log=print):
        self.log = log
        conc_rows = read_csv(CONCORDANS_CSV)
        lp_rows = read_csv(LP_CSV)
        self.gaz = Gazetteer()
        self.streets = Streets(conc_rows, lp_rows)
        self.addr = AddressIndex(conc_rows, lp_rows, self.streets)
        self.qid_by_string, self.psur_by_string = self.source_ids()
        self.log(f'  gazetteer {len(self.gaz.records):,} places, {len(self.streets.by_key)} streets, '
                 f'{len(self.addr.link):,} concordance links, {len(self.qid_by_string):,} almanak strings with a QID, '
                 f'{len(self.psur_by_string):,} plantation strings with a PSUR id')

    def source_ids(self):
        qid = defaultdict(Counter)
        if os.path.exists(ALMANAKKEN_CSV):
            for r in read_csv(ALMANAKKEN_CSV, delimiter=';'):
                s = normalize(r.get('plantation_std'))
                if s and clean(r.get('plantation_id')).startswith('Q'):
                    qid[s][clean(r['plantation_id'])] += 1
        psur = {}
        if os.path.exists(PLANTATION_DATASET_CSV):
            by_name = defaultdict(set)
            for r in read_csv(PLANTATION_DATASET_CSV):
                by_name[normalize(r.get('Name_plantation'))].add(clean(r.get('ID_plantation')))
            psur = {n: next(iter(ids)) for n, ids in by_name.items() if n and len(ids) == 1}
        return qid, psur

    def result(self, pid, match_type, confidence, note, label=None):
        if pid and pid.startswith('stm-street-'):
            rec = self.streets.by_key_by_id[pid]
            return {'gazetteer_id': pid, 'gazetteer_uri': None, 'lat': rec['lat'], 'lng': rec['lng'],
                    'match_type': match_type, 'confidence': round(confidence, 3), 'note': note}
        r = self.gaz.records.get(pid) if pid else None
        return {'gazetteer_id': pid, 'gazetteer_uri': r['uri'] if r else None,
                'lat': r['lat'] if r else None, 'lng': r['lng'] if r else None,
                'match_type': match_type, 'confidence': round(confidence, 3), 'note': note}

    def unplaced(self, note):
        return {'gazetteer_id': None, 'gazetteer_uri': None, 'lat': None, 'lng': None,
                'match_type': 'unplaced', 'confidence': 0.0, 'note': note}

    def link(self, s, years):
        """s: location_norm; years: list of record years for this string."""
        bare = re.sub(r'[.,;:]+$', '', s).strip()
        if not key(bare) or bare in UNPLACED_CONTEXT:
            return self.unplaced('context word or no place' if key(bare) else 'empty')
        if bare in CONTEXT_PARAMARIBO or re.match(r'alhier\b', bare):
            return self.result(PARAMARIBO_ID, 'gazetteer', SCORE_CONTEXT_WORD,
                               'context word read as Paramaribo (place of registration)')
        if re.fullmatch(r'paramaribo,? (?:[ivx]+|\d+e? wijk|wijk \w+)', bare):
            return self.result(PARAMARIBO_ID, 'gazetteer', SCORE_NAME_UNIQUE,
                               'Paramaribo with a ward number (ward not placed)')
        if re.fullmatch(r'(?:de )?(?:eerste|tweede|derde|1e|2e|3e) buitenwijk', bare):
            return self.result(PARAMARIBO_ID, 'gazetteer', SCORE_CONTEXT_WORD,
                               'outer ward of Paramaribo (buitenwijk); town centre used')
        k = key(bare)
        if 'hospitaal' in k and ('militair' in k or 'lands' in k or 'gravenstr' in k or k in ('hospitaal', 'hethospitaal', 'inhethospitaal')):
            return self.result(HOSPITAL_ID, 'address1885', SCORE_NAMED_BUILDING,
                               'named building: Militair Hospitaal / \'s Lands Hospitaal (Gravenstraat B2)')

        regime, share = regime_of(years)
        factor = 1.0 if share >= 0.8 else FACTOR_MIXED_PERIODS
        hit = self.link_address(bare, regime, factor)
        if hit:
            return hit
        hit = self.link_ids(bare)
        if hit:
            return hit
        hit = self.link_street(bare)
        if hit:
            return hit
        hit = self.link_name(bare)
        if hit:
            return hit
        hit = self.link_street(bare, fuzzy=True)
        if hit:
            return hit
        return self.unplaced('no match')

    def link_address(self, s, regime, factor):
        m = ADDR_LETTER.match(s) or LETTER_ONLY.match(s)
        if m:
            street = (m.groupdict().get('street') or '').strip()
            st_rec, _ = self.streets.lookup(street) if street else (None, None)
            if street and not st_rec and not street.endswith(STREET_WORDS):
                m = None  # 'Pl. Rust en Werk A 2'? not an address
        if m:
            core, suf = parse_core_suffix(m['letter'], m['num'] + (m['suf'] or ''))
            street_key = key(st_rec['label']) if st_rec else None
            scores, how = {}, ''
            if regime == '1885':
                pids = self.addr.lp.get(f'{core}|{suf}') or []
                base = SCORE_ADDRESS_EXACT
                if not pids and suf:
                    pids, base = self.addr.lp.get(core) or [], SCORE_ADDRESS_NO_SUFFIX
                for pid in pids:
                    sc = base
                    if street_key and self.addr.lp_street.get(pid) and self.addr.lp_street[pid] != street_key:
                        sc -= PENALTY_STREET_MISMATCH
                    scores[pid] = max(scores.get(pid, 0), sc)
                how = '1885 address point by its 1885 address'
            if not scores:
                if regime == 'ow':
                    srs, base, how = self.addr.ow.get(f'{core}|{suf}') or [], SCORE_ADDRESS_OW_NO_BUURT, 'concordance, old regime (pre-1837) without buurt'
                else:
                    srs, base, how = self.addr.nw.get(f'{core}|{suf}') or [], SCORE_ADDRESS_EXACT, 'concordance, 1837 regime exact'
                    if not srs:
                        srs, base, how = self.addr.nw_ns.get(core) or [], SCORE_ADDRESS_NO_SUFFIX, 'concordance, 1837 regime without suffix'
                scores = self.addr.places_for_rows(srs, base)
                if scores and street_key and street_key not in self.addr.row_streets(srs, 'ow' if regime == 'ow' else 'nw'):
                    scores = {p: v - PENALTY_STREET_MISMATCH for p, v in scores.items()}
                    how += '; street differs'
            if scores:
                return self.best(scores, 'address1885', factor, how)
            if st_rec:
                return self.street_result(st_rec, SCORE_STREET_FROM_ADDRESS, 'address not in concordance; street only')
        m = ADDR_NUMBER.match(s)
        if m:
            st_rec, how_st = self.streets.lookup(m['street'], fuzzy=True)
            if st_rec:
                ck = key(st_rec['label'])
                suf = (m['suf'] or '').lower()
                srs = self.addr.n1921.get(f'{ck}|{int(m["num"])}|{suf}') or self.addr.n1921.get(f'{ck}|{int(m["num"])}|') or []
                base = SCORE_ADDRESS_1950 if regime == '1950' else SCORE_ADDRESS_1921
                scores = self.addr.places_for_rows(srs, base)
                if scores:
                    how = 'concordance, 1921 house number' + (' (1950 numbering assumed equal)' if regime == '1950' else '')
                    if how_st == 'fuzzy':
                        scores = {p: v - PENALTY_STREET_MISMATCH for p, v in scores.items()}
                        how += '; street spelling fuzzy'
                    return self.best(scores, 'address1885', factor, how)
                return self.street_result(st_rec, SCORE_STREET_FROM_ADDRESS if how_st == 'exact' else SCORE_STREET_FUZZY,
                                          'house number not in concordance; street only')
        return None

    def best(self, scores, match_type, factor, how):
        pid = max(sorted(scores), key=lambda p: scores[p])
        n = len(scores)
        conf = scores[pid] * factor / n
        note = how + (f'; {n} candidate places' if n > 1 else '')
        return self.result(pid, match_type, conf, note)

    def street_result(self, rec, score, note):
        return {'gazetteer_id': rec['id'], 'gazetteer_uri': None, 'lat': rec['lat'], 'lng': rec['lng'],
                'match_type': 'street-centroid', 'confidence': round(score, 3),
                'note': note + (f' (centroid from {rec["geo_source"]})' if rec['geo_source'] else ' (no geometry)')}

    def link_ids(self, s):
        qids = self.qid_by_string.get(s)
        if qids:
            q, n = qids.most_common(1)[0]
            ids = self.gaz.by_qid.get(q)
            if ids:
                pid = self.gaz.canonical(ids)
                return self.result(pid, 'gazetteer', SCORE_ID * n / sum(qids.values()),
                                   f'Wikidata {q} via almanakken')
        psur = self.psur_by_string.get(s)
        if psur and self.gaz.by_psur.get(psur):
            ids = self.gaz.by_psur[psur]
            pid = self.gaz.canonical(ids)
            if len(ids) == 1:
                return self.result(pid, 'gazetteer', SCORE_ID, f'{psur} via plantation dataset')
            return self.result(pid, 'gazetteer', SCORE_ID_SHARED_PSUR,
                               f'{psur} via plantation dataset; gazetteer has {len(ids)} records, main record chosen')
        return None

    def link_street(self, s, fuzzy=False):
        looks_street = s.endswith(STREET_WORDS) or bool(re.search(r'\b(' + '|'.join(STREET_WORDS) + r')\b', s))
        if fuzzy and not looks_street:
            return None
        rec, how = self.streets.lookup(re.sub(r'^(?:in de|aan de|te|op de|paramaribo,?)\s+', '', s), fuzzy=fuzzy)
        if not rec:
            return None
        return self.street_result(rec, SCORE_STREET_EXACT if how == 'exact' else SCORE_STREET_FUZZY,
                                  'street name' + (' (fuzzy spelling)' if how == 'fuzzy' else ''))

    def link_name(self, s):
        core, context = name_core(s)
        ids = self.gaz.by_name.get(core)
        if not ids and ',' in s:  # 'Zorg en Hoop, Beneden Commewijne'
            head, tail = s.split(',', 1)
            core, ctx2 = name_core(head)
            context = f'{context} {tail} {ctx2}'
            ids = self.gaz.by_name.get(core)
        if not ids:
            return None
        ids = sorted(ids)
        if len(ids) == 1:
            return self.result(ids[0], 'gazetteer', SCORE_NAME_UNIQUE, 'name')
        ctx = district_tokens(context)
        if ctx:
            fit = [i for i in ids if ctx & self.gaz.district_of(i) and (ctx - {'beneden', 'boven'}) <= self.gaz.district_of(i) | {'beneden', 'boven'}]
            if len(fit) == 1:
                return self.result(fit[0], 'gazetteer', SCORE_NAME_WITH_DISTRICT, 'name + district in the text')
            if fit:
                ids = fit
        pid = self.gaz.canonical(ids)
        return self.result(pid, 'gazetteer', SCORE_NAME_UNIQUE / len(ids),
                           f'name shared by {len(ids)} places; main record chosen')


def regime_of(years):
    """Numbering regime of a string from the years of its records, and its share."""
    ys = [y for y in years if y]
    if not ys:
        return '1885', 0.5
    buckets = Counter('ow' if y < 1837 else 'nw' if y < 1885 else '1885' if y < 1940 else '1950' for y in ys)
    regime, n = buckets.most_common(1)[0]
    return regime, n / len(ys)


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

SCHEMA = """
DROP TABLE IF EXISTS gazetteer;
CREATE TABLE gazetteer (
  id TEXT PRIMARY KEY, uri TEXT, prefLabel TEXT, altLabels TEXT, type TEXT,
  lat REAL, lng REAL, description TEXT, source TEXT
);
DROP TABLE IF EXISTS place_geo;
CREATE TABLE place_geo (
  location_norm TEXT PRIMARY KEY, gazetteer_id TEXT, gazetteer_uri TEXT,
  lat REAL, lng REAL, match_type TEXT, confidence REAL, note TEXT,
  label TEXT, mentions INTEGER
);
"""

INDEXES = """
CREATE INDEX IF NOT EXISTS idx_gazetteer_type ON gazetteer(type);
CREATE INDEX IF NOT EXISTS idx_place_geo_gaz ON place_geo(gazetteer_id);
CREATE INDEX IF NOT EXISTS idx_place_geo_type ON place_geo(match_type);
CREATE INDEX IF NOT EXISTS idx_loc_place ON locations(place_id);
"""

SOURCE_ROWS = [
    ('concordans-paramaribo', 'Concordans Paramaribo (Dr. Muntjewerff), derived pilot version',
     'Attribution required', 0, 'data/concordans-paramaribo', MUNTJEWERFF_ATTRIBUTION),
    ('places-gazetteer', 'Suriname Time Machine gazetteer (places-gazetteer.jsonld)',
     'Open data', 0, 'data/places-gazetteer.jsonld',
     'Plantations, 1885 address points, settlements, rivers, districts; streets derived from the '
     'Paramaribo street layers (1758-1916) and the concordance.'),
]


def run(conn, log=print):
    started = time.time()
    linker = Linker(conn, log)
    conn.executescript(SCHEMA)
    gaz_rows = [(r['id'], r['uri'], r['prefLabel'], json.dumps(r['altLabels'], ensure_ascii=False),
                 r['type'], r['lat'], r['lng'], r['description'], r['source'])
                for r in linker.gaz.records.values()]
    linker.streets.by_key_by_id = {}
    for rec in linker.streets.by_key.values():
        linker.streets.by_key_by_id[rec['id']] = rec
        variants = sorted(v for v in rec['variants'] if v != rec['label'])
        gaz_rows.append((rec['id'], None, rec['label'], json.dumps(variants, ensure_ascii=False), 'street',
                         rec['lat'], rec['lng'], f'Paramaribo street; geometry: {rec["geo_source"] or "none"}',
                         'derived: concordance + street layers'))
    conn.executemany('INSERT OR REPLACE INTO gazetteer VALUES (?,?,?,?,?,?,?,?,?)', gaz_rows)

    log('  reading place strings and their years…')
    years = defaultdict(list)
    labels, mentions = {}, Counter()
    for norm, raw, year in conn.execute(
            """SELECT l.location_norm, l.raw_text, c.event_year FROM locations l
               LEFT JOIN certificates c ON c.certificate_id = l.certificate_id
               WHERE l.location_norm IS NOT NULL AND l.location_norm <> ''"""):
        if len(years[norm]) < 200:
            years[norm].append(year)
        mentions[norm] += 1
        labels.setdefault(norm, raw)
    log(f'  linking {len(years):,} distinct strings…')
    rows = []
    for i, (norm, ys) in enumerate(years.items(), 1):
        r = linker.link(norm, ys)
        rows.append((norm, r['gazetteer_id'], r['gazetteer_uri'], r['lat'], r['lng'], r['match_type'],
                     r['confidence'], r['note'], labels[norm], mentions[norm]))
        if i % 25000 == 0:
            log(f'    {i:,}')
    conn.executemany('INSERT INTO place_geo VALUES (?,?,?,?,?,?,?,?,?,?)', rows)
    log('  filling locations.place_id…')
    conn.execute('UPDATE locations SET place_id = NULL, precision = NULL')
    try:  # UPDATE ... FROM needs SQLite 3.33+
        conn.execute("""UPDATE locations SET place_id = g.gazetteer_id, precision = g.match_type
                        FROM place_geo g WHERE g.location_norm = locations.location_norm
                          AND g.gazetteer_id IS NOT NULL""")
    except sqlite3.OperationalError:
        conn.execute("""UPDATE locations SET
                          place_id = (SELECT g.gazetteer_id FROM place_geo g WHERE g.location_norm = locations.location_norm),
                          precision = (SELECT g.match_type FROM place_geo g WHERE g.location_norm = locations.location_norm)
                        WHERE location_norm IN (SELECT location_norm FROM place_geo WHERE gazetteer_id IS NOT NULL)""")
    conn.executescript(INDEXES)
    if conn.execute("SELECT 1 FROM sqlite_master WHERE name = 'sources'").fetchone():
        conn.executemany('INSERT OR REPLACE INTO sources VALUES (?,?,?,?,?,?)', SOURCE_ROWS)
    conn.commit()
    report = coverage(conn)
    log(f'  place linking done ({time.time() - started:.1f}s)')
    return report


def coverage(conn):
    total_rows = conn.execute("SELECT SUM(mentions) FROM place_geo").fetchone()[0] or 1
    total_str = conn.execute('SELECT COUNT(*) FROM place_geo').fetchone()[0] or 1
    rows = conn.execute("""SELECT match_type, COUNT(*), SUM(mentions), ROUND(AVG(confidence), 2),
                                  SUM(lat IS NOT NULL)
                           FROM place_geo GROUP BY match_type ORDER BY SUM(mentions) DESC""").fetchall()
    out = [('match_type', 'strings', 'share of strings', 'location rows', 'share of rows', 'avg confidence', 'strings with coordinates')]
    for mt, n, m, conf, geo in rows:
        out.append((mt, n, f'{n / total_str:.1%}', m, f'{m / total_rows:.1%}', conf, geo))
    return out


def print_report(report):
    widths = [max(len(str(r[i])) for r in report) for i in range(len(report[0]))]
    for r in report:
        print('  ' + '  '.join(str(v).rjust(w) if isinstance(v, (int, float)) else str(v).ljust(w)
                               for v, w in zip(r, widths)))


if __name__ == '__main__':
    db = sys.argv[1] if len(sys.argv) > 1 else os.path.join(REPO, 'suriname_person_search.db')
    if not os.path.exists(db):
        sys.exit(f'Database {db} not found')
    conn = sqlite3.connect(db)
    print(f'Linking places in {db}')
    report = run(conn)
    print('\nCoverage per match_type:')
    print_report(report)
    h = conn.execute('SELECT gazetteer_id, lat, lng, COUNT(*), SUM(mentions) FROM place_geo WHERE gazetteer_id = ?',
                     (HOSPITAL_ID,)).fetchone()
    print(f"\n's Lands Hospitaal = {HOSPITAL_ID} (Gravenstraat B2, lat {h[1]}, lng {h[2]}): "
          f'{h[3]:,} spellings, {h[4] or 0:,} mentions')
    conn.close()
