# Current JSON data dictionary

This directory is a reproducible inventory of the JSON data currently stored
under `data/`. It describes the data as it exists; it is not a claim that every
field already follows the target semantic model.

The inventory was introduced on 2026-07-27 and, after the temporal plantation
composition model was merged, currently contains:

- 17 current structures;
- 5 editor-managed JSON-LD authority tables;
- 11 immutable GeoJSON source snapshots;
- 1 generated plantation-composition projection;
- 392 distinct nested field paths; and
- a curated description and observed example for every current field path.

[`tables.csv`](tables.csv) is the index. Each indexed table has its own CSV file
in this directory.

## Scope

The exporter includes `.json`, `.jsonld`, and `.geojson` files below `data/`.
It deliberately excludes generated copies below `app/public`, because those are
publication projections rather than additional editable tables.

GeoJSON files are treated as source snapshots. Their original column names and
values remain visible, but the inventory does not imply that editors should
modify those files.

One generated structure is included separately:
[`generated-plantation-composition-periods.csv`](generated-plantation-composition-periods.csv).
It profiles the 202 `PlantationCompositionPeriod` records generated into
`app/lod/database.jsonld` from the Almanakken v2 CSV. The CSV source itself is
not yet exported as a table dictionary.

This exception is necessary: the raw Almanakken file has 22,482 rows, while the
Gazetteer's materialized JSON retains 19,483 of those observations. Only 198 of
the 202 generated composition periods can be reconstructed from the Gazetteer
JSON. A JSON-only inventory would therefore incorrectly omit four published
periods and hide the fact that the editor and aggregate publication use
different projections of the source.

## Dictionary columns

| Column | Meaning |
| --- | --- |
| `table_id` | Stable filename-safe identifier used by this inventory. |
| `source_file` | Repository-relative JSON source file. |
| `record_scope` | Record array inspected: `@graph[]`, `features[]`, or the complete `document`. |
| `field_path` | Nested JSON path; `[]` marks a repeated array value. |
| `column_title` | Human-readable title generated from the JSON key. |
| `description` | Curated current meaning or, for a newly discovered field, an explicitly flagged description awaiting review. |
| `description_status` | `curated` or `generated-needs-review`. |
| `json_types` | JSON types actually observed in the current records. |
| `required_in_scope` | Whether the path occurs in every observed record. This is an observation, not yet a schema rule. |
| `nullable` | Whether an explicit `null` was observed. |
| `repeatable` | Whether the path is inside an array. |
| `record_presence_count` | Number of records in which the path occurs. |
| `record_count` | Number of records inspected for this table. |
| `value_count` | Number of values observed, including repeated array values. |
| `example_json` | One real, JSON-encoded example from the current table. Long examples are truncated. |
| `linked_data_term` | Expanded JSON-LD term when the current local context defines one. |
| `information_dimensions` | Dimensions carried by the field: space, time, source, provenance, identity, vocabulary, or content. |
| `current_editability` | `editor-managed` or `immutable-source`. |
| `linked_art_candidate` | Possible publication mapping for review; this does not assert Linked Art conformance. |

The summary flags in `tables.csv` only count explicit, machine-readable fields.
For example, `1885` in a filename does not make a GeoJSON table time-aware.

## Current result

| Test | Tables passing | Interpretation |
| --- | ---: | --- |
| Explicit spatial fields | 13 / 17 | Geometry is comparatively well represented, but the generated temporal compositions have no spatial relation. |
| Explicit temporal fields | 6 / 17 | Time is uneven and absent from the GeoJSON source snapshots themselves. |
| Explicit source/evidence fields | 4 / 17 | Most files depend on provenance held elsewhere. |
| Latest-edit provenance | 2 / 17 | Only part of the editable data records even the latest editor/change time. |
| Exact dataset release/version | 0 / 17 | No current structure closes the chain to a deposited release and exact file checksum. |

This does not mean every table should contain every dimension. It means every
published assertion must be able to reach its spatial target, temporal scope,
source evidence, deposited dataset release, and editorial history where those
dimensions apply. The proposed architecture and migration sequence are in
[Editorial and publication data architecture](../models/editorial-and-publication-architecture.md).

## Regenerating

From the repository root:

```sh
pnpm --dir app export-data-dictionaries
```

The command replaces only generated CSV files in this directory. It does not
modify source data or this README. A newly encountered field receives a safe
placeholder description marked `generated-needs-review`, so undocumented
columns cannot silently enter the inventory.
