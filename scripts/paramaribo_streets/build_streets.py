"""Add the streets of Paramaribo to data/places-gazetteer.jsonld, one record per street.

A street is one record over time: renamed streets keep a single record with all their names.

Inputs
- data/paramaribo-streets/source/straten_paramaribo20260713HDSC.xlsx: HDSC street list
  (label, aliases, begin/end years, Wikidata id, source URL). Leading for names, aliases and
  periods: one HDSC row = one street. Rows describing bridges ("Brug ...") are skipped.
- data/08-place-points-qgis/publicatie-v1/data/straten_paramaribo_1885.geojson and
  straten_paramaribo_1916.geojson: digitised street segments from the 1885 and 1916 maps.
  A named segment joins the HDSC street whose label (first) or alias (if unambiguous) has the
  same normalised name. Named segments that match no HDSC row become a record of their own,
  named after the map. Unnamed segments are skipped.
- data/paramaribo-streets/wikidata-check-2026-11-28.json: the HDSC Wikidata ids were looked up
  on wikidata.org on 28 Nov 2026; only ids that resolved to an item with a matching street
  label are written (all 50 did; differences were spelling only).
- EDITORIAL_MAP_NAMES / EDITORIAL_MERGES below: renames stated by Thunnis van Oort (project lead,
  27 Nov 2026) that the HDSC list does not connect. Otherwise HDSC rows are not merged: a later
  name that HDSC lists as a separate row stays a separate record.
- Map labels are matched on: exact label, unambiguous alias, then a spelling match
  (difflib ratio >= 0.9 and a clear best candidate). Variants tried: without parentheses, without
  'Straat langs de' and canal side, ordinals spelled out (1e -> Eerste), each part of 'A of B'.
  Every non-exact match is listed in report.csv for review.

Ids
- data/paramaribo-streets/street-ids.csv keeps the key -> stm id mapping. Existing rows are never
  changed; new streets get the next free stm-NNNNN number. Re-running the script therefore keeps
  every id stable. Keys: hdsc-<TempID> or map-<normalised name>.

Output
- Street records in data/places-gazetteer.jsonld (type "road", which the place-type thesaurus
  uses for urban streets too), recognisable by sourceRecord.dataset == "paramaribo-streets".
  Earlier street records written by this script are replaced; nothing else is touched.
- data/paramaribo-streets/report.csv: skipped bridges, ambiguous aliases, map-only streets.

Usage: python3 scripts/paramaribo_streets/build_streets.py
"""
import collections, csv, json, os, re, unicodedata
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[2]
DIR = ROOT / 'data/paramaribo-streets'
HDSC = DIR / 'source/straten_paramaribo20260713HDSC.xlsx'
WIKIDATA_CHECK = DIR / 'wikidata-check-2026-11-28.json'
IDS = DIR / 'street-ids.csv'
REPORT = DIR / 'report.csv'
LAYERS = ROOT / 'data/08-place-points-qgis/publicatie-v1/data'
GAZETTEER = ROOT / 'data/places-gazetteer.jsonld'
STM = 'https://data.surinametijdmachine.org/'
DATASET = 'paramaribo-streets'
PARAMARIBO = 'stm-06330'
SOURCE_HDSC = 'hdsc-streets-paramaribo'
SOURCE_BY_YEAR = {1885: 'historic-map-27', 1916: 'paramaribo-street-map-1916'}

# Renames stated by Thunnis van Oort on 27 Nov 2026 that the HDSC list does not connect.
# Map names that belong to an HDSC street under another name:
EDITORIAL_MAP_NAMES = {'Pontenwerfstraat': 'hdsc-7'}  # Anton de Komstraat
# HDSC rows that are the same street under a later name (merged into the older row):
EDITORIAL_MERGES = {'hdsc-24': 'hdsc-149'}  # Dr. Sophie Redmondstraat -> Steenbakkersgracht

ORDINALS = {'1e': 'eerste', '2e': 'tweede', '3e': 'derde', '4e': 'vierde', '5e': 'vijfde'}
FUZZY_MIN = 0.9


def norm(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    s = re.sub(r'\b(mr|dr|mgr|prof)\.?\s*', ' ', s)
    s = re.sub(r'\b([a-z]\.\s*)+', ' ', s)
    s = re.sub(r'^\s*de\s+', '', s)
    s = s.replace('groote', 'grote').replace('heeren', 'heren')
    return re.sub(r'[^a-z0-9]', '', s)


def variants(name):
    """Name forms to try for a map label: as is, without parentheses, without 'Straat langs de'
    and canal side, with ordinals spelled out, and each part of 'A of B'."""
    base = re.sub(r'\s*\(.*?\)\s*', ' ', name).strip()
    parts = [name, base] + [p.strip() for p in re.split(r'\s+of\s+', base)]
    out = []
    for p in parts:
        p2 = re.sub(r'^(straat|weg)\s+(langs|aan)\s+de\s+', '', p, flags=re.I)
        p2 = re.sub(r'\s+(noordzijde|zuidzijde|noord|zuid|n zijde|z zijde)$', '', p2, flags=re.I)
        for q in (p, p2):
            words = q.split()
            if words and words[0].lower() in ORDINALS:
                q = ' '.join([ORDINALS[words[0].lower()]] + words[1:])
            if q and q not in out:
                out.append(q)
    return out


def year(v):
    if v in (None, ''):
        return None
    m = re.match(r'^\s*(\d{4})', str(v))
    return int(m.group(1)) if m else None


def read_hdsc():
    rows = list(openpyxl.load_workbook(HDSC, read_only=True).active.iter_rows(values_only=True))
    head = rows[0]
    out = []
    for r in rows[1:]:
        d = dict(zip(head, r))
        if d.get('Label'):
            d['aliases'] = [str(d[f'alias{i}']).strip() for i in range(1, 6) if d.get(f'alias{i}')]
            out.append(d)
    return out


def read_segments():
    segs = []
    for yr in (1885, 1916):
        for ft in json.load(open(LAYERS / f'straten_paramaribo_{yr}.geojson'))['features']:
            p = ft['properties']
            name = (p.get('naam') or '').strip()
            if not name or name == '[naamloos]' or not ft.get('geometry'):
                continue
            g = ft['geometry']
            lines = g['coordinates'] if g['type'] == 'MultiLineString' else [g['coordinates']]
            segs.append({'id': p['straat_id'], 'name': name, 'year': yr, 'lines': lines})
    return segs


def wkt_and_centroid(lines):
    if not lines:
        return None, None, None
    parts = ['(' + ', '.join(f'{x} {y}' for x, y, *_ in line) + ')' for line in lines]
    pts = [pt for line in lines for pt in line]
    lng = sum(p[0] for p in pts) / len(pts)
    lat = sum(p[1] for p in pts) / len(pts)
    return f"MULTILINESTRING ({', '.join(parts)})", lat, lng


def main():
    hdsc = read_hdsc()
    report = []
    verified = {qid: (label, wl) for label, qid, wl in json.load(open(WIKIDATA_CHECK)) if wl}

    import difflib
    streets = {}  # key -> dict
    by_label, by_alias = {}, collections.defaultdict(set)
    for r in hdsc:
        desc = (r.get('description@nl') or '').strip()
        if desc.startswith('Brug'):
            report.append(('skipped-bridge', r['Label'], f"HDSC TempID {r['TempID']}: {desc}"))
            continue
        key = f"hdsc-{r['TempID']}"
        target = EDITORIAL_MERGES.get(key)
        if target:
            report.append(('editorial-merge', r['Label'], f'{key} merged into {target} (Thunnis van Oort, 27 Nov 2026)'))
        streets.setdefault(target or key, {'hdsc': [], 'segments': [], 'mapNames': collections.defaultdict(set)})
        streets[target or key]['hdsc'].append(r)
        by_label.setdefault(norm(r['Label']), target or key)
        for a in r['aliases']:
            by_alias[norm(a)].add(target or key)
    for name, key in EDITORIAL_MAP_NAMES.items():
        by_label[norm(name)] = key
    # merged rows: the older row (the merge target) comes first
    for st in streets.values():
        st['hdsc'].sort(key=lambda r: f"hdsc-{r['TempID']}" in EDITORIAL_MERGES)

    def match(name):
        tried = variants(name)
        for v in tried:
            if norm(v) in by_label:
                return by_label[norm(v)], 'label'
        cands = set()
        for v in tried:
            if len(by_alias.get(norm(v), ())) == 1:
                cands |= by_alias[norm(v)]
        if len(cands) == 1:
            return next(iter(cands)), 'alias'
        ambiguous = cands
        scored = collections.defaultdict(float)
        for v in tried:
            n = norm(v)
            for pool in (by_label.items(), ((k, ks) for k, ks in by_alias.items() if len(ks) == 1)):
                for cand, key in pool:
                    key = key if isinstance(key, str) else next(iter(key))
                    r = difflib.SequenceMatcher(None, n, cand).ratio()
                    scored[key] = max(scored[key], r)
        best = sorted(scored.items(), key=lambda kv: -kv[1])
        if best and best[0][1] >= FUZZY_MIN and (len(best) == 1 or best[1][1] < best[0][1] - 0.03):
            return best[0][0], f'fuzzy {best[0][1]:.2f}'
        return None, ('ambiguous: ' + ', '.join(sorted(ambiguous))) if ambiguous else None

    for s in read_segments():
        key, how = match(s['name'])
        if key and how not in ('label',):
            lab = streets[key]['hdsc'][0]['Label']
            report.append((f"match-{how.split()[0]}", s['name'], f"{s['id']} -> {key} {lab} ({how})"))
        if not key:
            n = norm(s['name'])
            key = f'map-{n}'
            if key not in streets:
                streets[key] = {'hdsc': [], 'segments': [], 'mapNames': collections.defaultdict(set)}
            report.append(('map-only', s['name'], f"{s['id']}: no HDSC street found" + (f' ({how})' if how else '')))
        streets[key]['segments'].append(s)
        streets[key]['mapNames'][s['name']].add(s['year'])

    # --- stable ids
    ids = {}
    if IDS.exists():
        ids = {row['key']: row['id'] for row in csv.DictReader(open(IDS, encoding='utf-8'))}
    doc = json.loads(GAZETTEER.read_text(encoding='utf-8'))
    graph = doc['@graph']
    used = [int(m.group(1)) for e in graph for m in [re.match(r'^stm-(\d{5})$', e.get('id', ''))] if m]
    used += [int(v[4:]) for v in ids.values()]
    nxt = max(used) + 1
    labels = {}
    for key in sorted(streets, key=lambda k: (k.startswith('map-'), int(k[5:]) if k.startswith('hdsc-') else 0, k)):
        if key not in ids:
            ids[key] = f'stm-{nxt:05d}'
            nxt += 1

    # --- records
    records = []
    for key, st in streets.items():
        rows = st['hdsc']
        r = rows[0] if rows else None
        pid = ids[key]
        names, seen = [], set()

        def add_name(text, ntype, source, src_year=None, preferred=False):
            k = norm(text)
            if not k or k in seen:
                return
            seen.add(k)
            n = {'text': text, 'language': 'nl', 'type': ntype, 'isPreferred': preferred, 'source': source}
            if src_year:
                n['sourceYear'] = src_year
            names.append(n)

        for i, row in enumerate(rows):
            add_name(row['Label'], 'official', SOURCE_HDSC, preferred=(i == 0))
            for a in row['aliases']:
                add_name(a, 'variant', SOURCE_HDSC)
        for mname, yrs in sorted(st['mapNames'].items()):
            for yr in sorted(yrs):
                add_name(mname, 'historical', SOURCE_BY_YEAR[yr], yr, preferred=not names)
        label = names[0]['text']
        labels[key] = label

        lines = [ln for s in sorted(st['segments'], key=lambda s: (s['year'], s['id'])) for ln in s['lines']]
        wkt, lat, lng = wkt_and_centroid(lines)
        sources = ([SOURCE_HDSC] if r else []) + sorted({SOURCE_BY_YEAR[s['year']] for s in st['segments']})
        if len(rows) > 1 or any(EDITORIAL_MAP_NAMES.get(m) == key for m in st['mapNames']):
            sources.append('stm-editorial')

        periods, links = [], []
        for row in rows:
            period = {k: year(row.get(f)) for k, f in [
                ('earliestBegin', 'earliestBeginTimeStamp'), ('latestBegin', 'LatestBeginTimeStamp'),
                ('pointInTime', 'point_in_time'), ('earliestEnd', 'EarliestEndTimeStamp'),
                ('latestEnd', 'LatestEndTimeStamp')]}
            period = {k: v for k, v in period.items() if v is not None}
            if period:
                period = {'name': row['Label'], **period, 'source': SOURCE_HDSC}
                if row.get('mentioned_at_url'):
                    period['mentionedAt'] = str(row['mentioned_at_url']).strip()
                periods.append(period)
            qid = str(row['wikidataID']).strip() if row.get('wikidataID') else None
            if qid and qid in verified:
                links.append({'authority': 'wikidata', 'identifier': qid, 'matchType': 'closeMatch'})
            elif qid:
                report.append(('wikidata-not-verified', row['Label'], qid))

        desc = (r.get('description@nl') or '').strip() if r else ''
        if not desc:
            desc = 'Straat in Paramaribo (naam van de kaart van ' + '/'.join(
                str(y) for y in sorted({s['year'] for s in st['segments']})) + ')'
        records.append({
            '@id': f'{STM}place/{pid}',
            '@type': ['E25_Human-Made_Feature'],
            'id': pid,
            'type': 'road',
            'prefLabel': label,
            'altLabels': [n['text'] for n in names[1:]],
            'names': names,
            'broader': PARAMARIBO,
            'description': desc,
            'location': {'lat': lat, 'lng': lng, 'wkt': wkt, 'crs': 'OGC:CRS84'},
            'sources': sources,
            'externalLinks': links,
            'fid': None,
            'psurIds': [],
            'district': None,
            'locationDescription': 'Paramaribo',
            'locationDescriptionOriginal': None,
            'placeType': 'street',
            'modifiedBy': None,
            'modifiedAt': None,
            'streetSegments': [s['id'] for s in sorted(st['segments'], key=lambda s: (s['year'], s['id']))],
            'attestedPeriods': periods,
            'sourceRecord': {'dataset': DATASET, 'key': key,
                             **({'hdscTempIds': [row['TempID'] for row in rows]} if rows else {})},
        })

    records.sort(key=lambda e: e['id'])
    kept = [e for e in graph if (e.get('sourceRecord') or {}).get('dataset') != DATASET]
    clash = {e['id'] for e in kept} & {e['id'] for e in records}
    if clash:
        raise SystemExit(f'id clash with existing gazetteer entries: {sorted(clash)[:5]}')
    doc['@graph'] = kept + records
    tmp = GAZETTEER.with_suffix('.tmp')
    tmp.write_text(json.dumps(doc, indent=2, ensure_ascii=False), encoding='utf-8')
    os.replace(tmp, GAZETTEER)

    with open(IDS, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['key', 'id', 'label'])
        for key in sorted(ids, key=lambda k: ids[k]):
            w.writerow([key, ids[key], labels.get(key, '')])
    with open(REPORT, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['issue', 'name', 'detail'])
        w.writerows(sorted(report))

    with_geom = sum(1 for e in records if e['location']['wkt'])
    print(f'{len(records)} street records ({with_geom} with map geometry); '
          f'{sum(1 for k in streets if k.startswith("map-"))} map-only; report: {collections.Counter(x[0] for x in report)}')


if __name__ == '__main__':
    main()
