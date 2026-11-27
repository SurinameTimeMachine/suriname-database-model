"""Build data/rce-images.jsonld: RCE Beeldbank images linked to STM places.

Same pattern as data/rijksmuseum-images.jsonld (E36 Visual Item --P138 represents--> place),
but for the image bank of the Rijksdienst voor het Cultureel Erfgoed (RCE).

Input
- data/rce-beeldbank/rce-koppelvoorstel.csv: link proposal (27 Nov 2026), one or more candidate
  links per RCE place, with level (pand / straat / plaats), method and certainty.
  Problem cases (rce-probleemgevallen.csv) are deliberately NOT used.
- RCE linked data, dataset "afbeeldingen" (Beeldbank RCE), via the TriplyDB statements API:
  https://api.linkeddata.cultureelerfgoed.nl/datasets/rce/afbeeldingen/statements
- data/places-gazetteer.jsonld: only non-deprecated gazetteer ids are used as P138 targets.

Rule (Thunnis van Oort, 27 Nov 2026): every image is linked exactly once, choosing the most
specific level available: 1885 address point > street 1885 > street 1916 > place (gazetteer).
Links to the HDSC street list or OpenStreetMap are not STM entities and are not used.
Street-level links have no gazetteer URI (street segments are not in the gazetteer yet); they are
stored as street name + segment ids (stm-1885-street-NNN / stm-1916-street-NNN) without P138.

Usage: python3 scripts/rce_beeldbank/build_rce_images.py   (needs network; ~1-3 min)
"""
import csv, json, os, re, urllib.parse, urllib.request, datetime, collections
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROPOSAL = ROOT / 'data/rce-beeldbank/rce-koppelvoorstel.csv'
GAZETTEER = ROOT / 'data/places-gazetteer.jsonld'
OUT = ROOT / 'data/rce-images.jsonld'
API = 'https://api.linkeddata.cultureelerfgoed.nl/datasets/rce/afbeeldingen/statements'
STM = 'https://data.surinametijdmachine.org/'
SOURCE_URI = f'{STM}source/rce-beeldbank'
SDO = 'https://schema.org/'


def statements(**kw):
    out, off = [], 0
    while True:
        q = urllib.parse.urlencode(dict(kw, limit=10000, offset=off))
        d = json.load(urllib.request.urlopen(f'{API}?{q}', timeout=120))
        out += d
        if len(d) < 10000:
            return out
        off += 10000


def props(subject):
    p = collections.defaultdict(list)
    for s in statements(subject=subject):
        p[s[1]['value'].replace(SDO, '')].append(s[2]['value'])
    return p


def license_label(url):
    if not url:
        return None
    if 'by-sa/4.0' in url:
        return 'CC BY-SA 4.0'
    if 'by-sa/3.0' in url:
        return 'CC BY-SA 3.0'
    if 'publicdomain/zero' in url:
        return 'CC0'
    if 'publicdomain/mark' in url:
        return 'Public Domain'
    return url


def main():
    gaz = {x['@id']: x for x in json.load(open(GAZETTEER, encoding='utf-8'))['@graph'] if not x.get('deprecated')}
    rows = list(csv.DictReader(open(PROPOSAL, encoding='utf-8')))
    by_place = collections.defaultdict(list)
    for r in rows:
        by_place[r['rce_place_uri']].append(r)

    cert_rank = {'certain': 0, 'probable': 1}

    def choose(cands):
        pand = [c for c in cands if c['niveau'].startswith('pand') and f"{STM}place/{c['stm_id']}" in gaz]
        if pand:
            def rank(c):
                m = c['methode']
                return (0 if '(concordans: certain)' in m else 1 if '(concordans: probable)' in m else 2)
            pand.sort(key=rank)
            best = pand[0]
            # no concordance address values in the output, only the method
            method = re.sub(r'concordans-adres (\d{4}) "[^"]*"', r'Concordans Paramaribo address (\1)', best['methode'])
            return dict(level='address-1885', represents=f"{STM}place/{best['stm_id']}", label=best['stm_label'],
                        method=method, certainty=best['zekerheid'], alternatives=len(pand) - 1)
        for year in ('1885', '1916'):
            st = [c for c in cands if c['niveau'] == 'straat' and c['stm_id'].startswith(f'stm-{year}-street-')]
            if st:
                return dict(level=f'street-{year}', streetName=st[0]['stm_label'], streetSegments=sorted({c['stm_id'] for c in st}),
                            method=st[0]['methode'], certainty=st[0]['zekerheid'], alternatives=0)
        pl = [c for c in cands if c['niveau'] == 'plaats' and f"{STM}place/{c['stm_id']}" in gaz]
        if pl:
            c = pl[0]
            return dict(level='place', represents=f"{STM}place/{c['stm_id']}", label=c['stm_label'],
                        method=c['methode'], certainty=c['zekerheid'], alternatives=0)
        return None

    choices = {u: choose(c) for u, c in by_place.items()}
    choices = {u: c for u, c in choices.items() if c}
    print(f'{len(choices)} of {len(by_place)} RCE places get one link')

    # all photographs per chosen place
    def photos_of(place):
        return place, [s[0]['value'] for s in statements(predicate=f'{SDO}contentLocation', object=place)]
    with ThreadPoolExecutor(12) as ex:
        photos = dict(ex.map(photos_of, choices))

    person_cache = {}

    def describe(item):
        place, photo = item
        p = props(photo)
        img = props(p['image'][0]) if p.get('image') else {}
        ids = {}
        for i in p.get('identifier', []):
            ip = props(i)
            if ip.get('propertyID') and ip.get('value'):
                ids[ip['propertyID'][0]] = ip['value'][0]
        creators = []
        for c in p.get('creator', []):
            if c not in person_cache:
                person_cache[c] = (props(c).get('name') or [None])[0]
            if person_cache[c]:
                creators.append(person_cache[c])
        return place, photo, p, img, ids, creators

    # A photograph can depict several RCE addresses: keep only its most specific link.
    level_rank = {'address-1885': 0, 'street-1885': 1, 'street-1916': 2, 'place': 3}
    best_place = {}
    for pl, phs in photos.items():
        for ph in phs:
            cur = best_place.get(ph)
            if cur is None or level_rank[choices[pl]['level']] < level_rank[choices[cur]['level']]:
                best_place[ph] = pl
    items = sorted((pl, ph) for ph, pl in best_place.items())
    with ThreadPoolExecutor(16) as ex:
        described = list(ex.map(describe, items))

    graph = []
    for place, photo, p, img, ids, creators in sorted(described, key=lambda x: x[1]):
        ch = choices[place]
        uuid = photo.rsplit('/', 1)[-1]
        lic = (img.get('license') or p.get('license') or [None])[0]
        date = (p.get('dateCreated') or [None])[0]
        entity = {
            '@id': f'{STM}rce-image/{uuid}',
            '@type': ['E36_Visual_Item', 'sdo:ImageObject'],
            'P128i_is_carried_by': SOURCE_URI,
            'hadPrimarySource': SOURCE_URI,
            'prefLabel': (p.get('name') or [ids.get('inventarisnummer', uuid)])[0],
            'objectNumber': ids.get('inventarisnummer'),
            'dateCreated': date,
            'year': int(date[:4]) if date and date[:4].isdigit() else None,
            'creator': creators or None,
            'thumbnailUrl': (img.get('thumbnailUrl') or [None])[0],
            'contentUrl': (img.get('contentUrl') or [None])[0],
            'sameAs': photo,
            'url': (p.get('url') or [None])[0],
            'isPublicDomain': False,
            'license': lic,
            'licenseLabel': license_label(lic),
            'rceAddress': place,
            'linkLevel': ch['level'],
            'linkMethod': ch['method'],
            'linkCertainty': ch['certainty'],
        }
        if 'represents' in ch:
            entity['P138_represents'] = ch['represents']
        else:
            entity['depictedStreetName'] = ch['streetName']
            entity['depictedStreetSegments'] = ch['streetSegments']
        if ch['alternatives']:
            entity['linkAlternatives'] = ch['alternatives']
        graph.append({k: v for k, v in entity.items() if v is not None})

    doc = {
        '@context': {
            'crm': 'http://www.cidoc-crm.org/cidoc-crm/', 'sdo': 'https://schema.org/', 'stm': STM,
            'skos': 'http://www.w3.org/2004/02/skos/core#', 'dct': 'http://purl.org/dc/terms/',
            'prov': 'http://www.w3.org/ns/prov#', 'xsd': 'http://www.w3.org/2001/XMLSchema#',
            'prefLabel': 'skos:prefLabel',
            'E36_Visual_Item': 'crm:E36_Visual_Item',
            'P128i_is_carried_by': {'@id': 'crm:P128i_is_carried_by', '@type': '@id'},
            'P138_represents': {'@id': 'crm:P138_represents', '@type': '@id'},
            'hadPrimarySource': {'@id': 'prov:hadPrimarySource', '@type': '@id'},
            'objectNumber': 'stm:objectNumber',
            'dateCreated': 'sdo:dateCreated',
            'year': {'@id': 'dct:date', '@type': 'xsd:gYear'},
            'creator': 'sdo:creator',
            'thumbnailUrl': {'@id': 'sdo:thumbnailUrl', '@type': '@id'},
            'contentUrl': {'@id': 'sdo:contentUrl', '@type': '@id'},
            'sameAs': {'@id': 'sdo:sameAs', '@type': '@id'},
            'url': {'@id': 'sdo:url', '@type': '@id'},
            'isPublicDomain': 'stm:isPublicDomain',
            'license': {'@id': 'dct:license', '@type': '@id'},
            'licenseLabel': 'stm:licenseLabel',
            'rceAddress': {'@id': 'stm:rceAddress', '@type': '@id'},
            'linkLevel': 'stm:linkLevel', 'linkMethod': 'stm:linkMethod', 'linkCertainty': 'stm:linkCertainty',
            'linkAlternatives': 'stm:linkAlternatives',
            'depictedStreetName': 'stm:depictedStreetName', 'depictedStreetSegments': 'stm:depictedStreetSegments',
        },
        '@id': f'{STM}database/rce-images',
        '@type': 'sdo:Dataset',
        'sdo:name': 'RCE Beeldbank images linked to STM places',
        'sdo:description': ('Static snapshot of images from the Beeldbank of the Rijksdienst voor het Cultureel Erfgoed '
                            '(RCE linked data, dataset rce/afbeeldingen) with a Surinamese address, each linked once to '
                            'the most specific STM location (1885 address point > street 1885 > street 1916 > place). '
                            'Links are proposals; building-level links assume RCE house numbers follow the 1921/2022 '
                            'numbering (via Concordans Paramaribo) and must be checked. '
                            'Re-run scripts/rce_beeldbank/build_rce_images.py to refresh.'),
        'sdo:license': 'Images: CC BY-SA (per item, see license); metadata: RCE',
        'sdo:dateModified': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        '@graph': graph,
    }
    dupes = [k for k, n in collections.Counter(g['@id'] for g in graph).items() if n > 1]
    if dupes:
        raise SystemExit(f'Duplicate image ids: {dupes[:5]}')
    tmp = OUT.with_name(OUT.name + '.tmp')
    try:
        tmp.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        os.replace(tmp, OUT)
    finally:
        if tmp.exists():
            tmp.unlink()
    print(f'Wrote {OUT} ({len(graph)} images)')
    print(collections.Counter(g['linkLevel'] for g in graph))


if __name__ == '__main__':
    main()
