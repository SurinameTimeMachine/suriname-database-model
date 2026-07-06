# Locatiepunten 1885 First Link Report

- Total LP rows: 3143
- LP rows treated as linkable addresses: 3005
- LP rows ignored as non-address annotations (wijk only): 102
- LP rows ignored due to insufficient address components: 36
- LP rows with 1885 address: 3067
- LP rows without geometry: 2
- LP rows in explicit 1885 renumbered zones: 1341
- LP rows outside explicit 1885 renumbered zones: 1766
- Linkable LP rows with at least one concordans candidate: 3002
- Candidate rows in exact layer (wijk + huisnummer + toevoeging): 5377
- Candidate rows in fallback layer (wijk + huisnummer only): 4322
- LP rows with at least one exact-layer candidate: 2570
- LP rows with fallback-only candidates: 432
- LP rows with exactly one candidate: 817
- LP rows with multiple candidates: 2185
- Linkable LP rows unresolved (no wijk + huisnummer match): 3

Layered logic: exact layer matches wijk + huisnummer + toevoeging; fallback layer matches only wijk + huisnummer and is flagged as second-best. Wijk-only LP rows are labeled non-address annotations and excluded from linking.