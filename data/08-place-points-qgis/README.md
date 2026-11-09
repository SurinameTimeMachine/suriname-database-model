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

## Publicatieversie (v1)

`publicatie-v1/` bevat de dataset *Locatiepunten Paramaribo 1885* zoals die in DataverseNL (HDSC)
wordt gepubliceerd: CSV + GeoJSON, README, CITATION.cff. Het pakket wordt gebouwd met
`scripts/locatiepunten1885/build_publicatie.py` uit de ongewijzigde export in `export20260619/`;
de correcties (weggelaten punten, a/b-toevoegingen) staan in dat script en in de README.
