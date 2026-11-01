#!/usr/bin/env python3
"""Checks for link_places.py on known cases. Run: python3 scripts/person_search/test_places.py"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import link_places as lp  # noqa: E402

linker = lp.Linker(None, log=lambda *_: None)
linker.streets.by_key_by_id = {r['id']: r for r in linker.streets.by_key.values()}

CASES = [
    # string, years, expected gazetteer_id (or prefix), expected match_type
    ('gravenstraat b 2 (militair hospitaal)', [1905], lp.HOSPITAL_ID, 'address1885'),
    ('militair hospitaal', [1910], lp.HOSPITAL_ID, 'address1885'),
    ('gravenstraat militair hospitaal', [1921], lp.HOSPITAL_ID, 'address1885'),
    ('gtavenstraat b 2 (militair hospotaal)', [1900], lp.HOSPITAL_ID, 'address1885'),
    ('gravenstraat b 2', [1900], lp.HOSPITAL_ID, 'address1885'),
    ('gravenstraat 64', [1921], lp.HOSPITAL_ID, 'address1885'),
    ('gravenstraat a 44', [1890], 'stm-1885-address-', 'address1885'),
    ('keizerstraat', [1921], 'stm-street-', 'street-centroid'),
    ('zwartenhovenbrugstraat', [1880], 'stm-street-', 'street-centroid'),
    ('zwartehovenbrugstraat', [1880], 'stm-street-', 'street-centroid'),
    ('paramaribo', [1900], lp.PARAMARIBO_ID, 'gazetteer'),
    ('alhier', [1900], lp.PARAMARIBO_ID, 'gazetteer'),
    ('aldaar', [1900], None, 'unplaced'),
    ('wagewegstraat', [1910], 'stm-street-wagenwegstraat', 'street-centroid'),
    ('gravestraat', [1910], 'stm-street-gravenstraat', 'street-centroid'),
    ('tweede buitenwijk', [1900], lp.PARAMARIBO_ID, 'gazetteer'),
    ('paramaribo ii', [1900], lp.PARAMARIBO_ID, 'gazetteer'),
    ('alhier in garnizoen', [1900], lp.PARAMARIBO_ID, 'gazetteer'),
    ('accaribo', [1850], 'stm-', 'gazetteer'),
]

failed = 0
for s, years, want_id, want_type in CASES:
    r = linker.link(s, years)
    ok = r['match_type'] == want_type and (
        want_id is None and r['gazetteer_id'] is None or
        want_id is not None and (r['gazetteer_id'] or '').startswith(want_id))
    failed += not ok
    print(f"{'ok  ' if ok else 'FAIL'} {s!r:45} -> {r['gazetteer_id']} {r['match_type']} {r['confidence']} | {r['note']}")
print(f'{len(CASES) - failed}/{len(CASES)} ok')
sys.exit(1 if failed else 0)
