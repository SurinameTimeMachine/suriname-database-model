# Plantations Surinaamse Almanakken v2.0

> **Canonical dataset version:** 2.0
> **License:** CC BY-SA 4.0  
> **DOI:** [10.17026/SS/MVOJY5](https://hdl.handle.net/10622/SS/MVOJY5)

The v2 CSV is the sole Almanakken input to the application and publication
pipeline. It contains 22,482 annual observations in 68 semicolon-delimited
UTF-8 columns. `recordid` is unique for every row. Fourteen rows do not have a
`plantation_id`; they remain source evidence but cannot yet target a local E74
organization.

The authors' complete column documentation is retained unchanged in
[`Documentation Dataset Plantations Surinaamse Almanakken v2.0 (1).md`](../../data/06-almanakken%20-%20Plantations%20Surinaamse%20Almanakken/Documentation%20Dataset%20Plantations%20Surinaamse%20Almanakken%20v2.0%20(1).md).

## Canonical schema

| Group | v2 columns |
| --- | --- |
| Record provenance | `recordid`, `id`, `year`, `page`, `litt_std` |
| Location | `district_of_divisie`, `loc_org`, `loc_std`, `river_or_road`, `direction` |
| Organization identity | `plantation_std`, `plantation_org`, `plantation_id`, `psur_id`, `psur_id2` |
| Structure | `has_parts1_lab/id` through `has_parts4_lab/id`, `part_of_lab`, `part_of_id` |
| Reference and ownership | `reference_org`, `owned_by_lab`, `owned_by_id`, `owned_by_id2` |
| Activity and condition | `size_std`, `product_std`, `function`, `additional_info`, `deserted`, `lot` |
| Management transcriptions | `administrateurs`, `directeuren`, `eigenaren`, the two regional administrator columns, and `blank-officier` |
| Population | `enslaved_norm`, `enslaved_shared_with`, `slaven`, `sranantongo_naam`, and the detailed free/unfree resident columns |
| Machinery | `soort_van_molen`, `werktuig_stoom`, `werktuig_water` |

The runtime importer declares all 68 names in
[`app/scripts/almanakken.ts`](../../app/scripts/almanakken.ts). Missing or
unexpected columns stop the build. There are no aliases for superseded column
names and no fallback source file.

## Model mapping

Each source row becomes a source-bound `crm:E13_Attribute_Assignment` at
`https://data.surinametijdmachine.org/obs/{recordid}`. The observation records
the year, page, names, products, management strings, population values, and v2
structural references.

`plantation_id` is a Wikidata matching key for the plantation organization. The
publication mints a local `crm:E74_Group` URI and relates it to the Wikidata
entity with `skos:exactMatch`. It does not use the Wikidata URI as the local
identifier.

The physical plantation is a separate local `crm:E25_Human-Made_Feature`.
Sharing a QID establishes a researched E25-E74 association, not a direct
`crm:P52_has_current_owner` claim. Several physical places may validly be
associated with one organization; those cases remain visible for review.

## Regeneration contract

The v2 migration may replace only:

- `almanakkenObservations`;
- product and status assertions whose `source` is `almanakken`;
- membership of `almanakken` in a Gazetteer record's `sources` array.

It preserves geometry, names, descriptions, authority-link decisions, merge
history, researcher metadata, and assertions from every other source. Run
`pnpm --dir app validate-almanakken-v2` for a dry audit or
`pnpm --dir app migrate-almanakken-v2` to rebuild all v2 projections.
