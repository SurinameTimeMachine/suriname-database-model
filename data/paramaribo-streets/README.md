# Paramaribo streets

Street records for Paramaribo in `data/places-gazetteer.jsonld`, built by
`scripts/paramaribo_streets/build_streets.py`. One record per street; a street that was
renamed keeps one record with all its names.

## Files

| File | Content |
| --- | --- |
| `source/straten_paramaribo20260713HDSC.xlsx` | HDSC street list (13 July 2026), leading source for names, aliases and periods |
| `street-ids.csv` | Key → STM id. Existing rows are never changed, so re-running the script keeps ids stable |
| `wikidata-check-2026-11-28.json` | The 50 Wikidata ids from the HDSC list, looked up on wikidata.org on 28 Nov 2026 (label, id, Wikidata label). All 50 resolved |
| `report.csv` | Review list: skipped bridges, map labels matched via alias or spelling, map-only streets, editorial merges |

## Method

- Each HDSC row is a street (bridges are skipped). HDSC rows are not merged with each other,
  except where the project lead stated a rename the list does not connect
  (Dr. Sophie Redmondstraat = Steenbakkersgracht; Pontenwerfstraat on the 1885/1916 maps =
  Anton de Komstraat). These carry source `stm-editorial`.
- Named street segments from the 1885 and 1916 maps
  (`data/08-place-points-qgis/publicatie-v1/data/straten_paramaribo_*.geojson`) are attached to
  the HDSC street with the same label, an unambiguous alias, or a clear spelling match
  (ratio ≥ 0.9). Segments that match nothing become a street record of their own.
  Unnamed segments are skipped.
- Geometry: all attached segments of both maps as one MULTILINESTRING; streets that are not on
  either map have no geometry.
- Periods from the HDSC list are kept per name in `attestedPeriods`.
- Records use place type `road` (the place-type thesaurus files urban streets under road),
  `placeType: "street"`, `broader: stm-06330` (Paramaribo) and
  `sourceRecord.dataset: "paramaribo-streets"`.
- Street-level RCE Beeldbank images (`depictedStreetSegments` in `data/rce-images.jsonld`) are
  shown on the street record via these segment ids.
