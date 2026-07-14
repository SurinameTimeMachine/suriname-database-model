# Almanakken v2 migration model

## Decision

`Plantations Surinaamse Almanakken v2.0 (1).csv` is the only Almanakken ground
truth consumed by the codebase. Its 22,482 rows and 68-column schema are
validated before transformation. Earlier dataset rows and column aliases are
not inputs to review, matching, or publication.

The v2 authors' documentation remains immutable source evidence. References in
that document to earlier research work are therefore not rewritten.

## Identity boundary

| Identifier | Identifies | Treatment |
| --- | --- | --- |
| `recordid` | One source row | Stable suffix of the E13 observation URI |
| `plantation_id` | Plantation organization matching key | Local E74 plus `skos:exactMatch` to Wikidata |
| Gazetteer `id` | Curated physical place record | Local E25/E26/E53 identifier |
| `psur_id`, `psur_id2` | Cross-dataset research identifiers | Retained with provenance; not identity replacement |

A v2 QID does not automatically replace a Gazetteer authority decision. It can
associate an E74 organization with an E25 physical plantation, but it does not
prove that the organization owned the land or that two similarly named physical
plantations are identical.

## Preservation boundary

| Preserved researcher data | Rebuilt from v2 |
| --- | --- |
| Geometry and spatial source records | Almanakken annual observations |
| Preferred, alternative, and source names | Almanakken product assertions |
| Descriptions and editorial notes | Almanakken lifecycle/status assertions |
| Authority links and match types | Almanakken source membership |
| Merge/tombstone history | Generated E13, E41, E74, and provenance projections |
| Non-Almanakken assertions | Review summary counts from current v2 rows |

[`migrate-almanakken-v2.ts`](../../app/scripts/migrate-almanakken-v2.ts)
compares an editorial projection of every Gazetteer record before and after the
migration. It stops if anything outside the right-hand column changes.

## Pipeline

1. Validate UTF-8, delimiter, exact v2 header, unique `recordid`, and QID shape.
2. Reconcile only the `almanakken` source tag against current v2 QIDs.
3. Replace only Almanakken-derived product and lifecycle assertions.
4. Replace materialized annual observations, withholding ambiguous E25
   projections when several active physical places share an E74 QID.
5. Generate aggregate JSON-LD and per-place linked-data records.
6. Validate the JSON-LD context, provenance, entity targets, and row coverage.

The runnable transition diagram is
[`almanakken-v2-migration.mmd`](almanakken-v2-migration.mmd).
