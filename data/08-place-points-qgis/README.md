# Paramaribo georeferenced QGIS layers

This directory preserves the supplied `08-place-points-qgis.zip` contents
unchanged under `export20260619/`.

The first import is `locatiepunten1885.geojson`: 3,141 valid point geometries
become editable `historical-address` Gazetteer records through
`app/scripts/import-paramaribo-address-points-1885.ts`. Each record retains
its stable source feature index and cites `historic-map-27`, *Figuratieve
plattegrond der stad Paramaribo* (1885).

The district-boundary and historic-street layers remain raw source layers for
now. They require separate temporal-geometry imports so they do not overwrite
or duplicate the existing district and road records.

## Publicatieversie (v1) / Publication version (v1)

`publicatie-v1/` contains the dataset *Locatiepunten Paramaribo 1885* as published in DataverseNL (HDSC):
CSV + GeoJSON points, street lines 1885/1916, district boundaries 1885, README (English) and CITATION.cff.
The package is built with `scripts/locatiepunten1885/build_publicatie.py` from the unchanged exports in
`export20260619/` and `export20261109/`; the corrections (omitted points, a/b suffixes, omitted street
lines) are in that script and in the README.
