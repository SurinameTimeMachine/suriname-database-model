# ADR 0007: Model dated functions as classifications of physical places

## Status

Accepted and implemented.

## Context

The Gazetteer uses a structural place type such as `plantation`, `river`, or
`road` to select the physical feature class and map behaviour. The Almanakken
also record what a plantation produced or how an establishment functioned in a
given year. Calling both of these values a place “type” hides an important
difference: structural type is comparatively stable, while a function can
change and must retain its source and temporal scope.

An Almanakken row targets the E74 plantation organization because its QID is an
organization authority identifier. Researchers nevertheless need to browse the
attested functions of the corresponding physical plantation. Copying the raw
row to E25 would turn a source transcription into a second source claim.

## Decision

- Keep structural geographical-feature types as implementation classifications
  for E25/E26/E53 records. They continue to drive the map, geometry rules, and
  editing form, but are not the public function vocabulary.
- Publish functions in the SKOS concept scheme
  `https://data.surinametijdmachine.org/vocabulary/place-function`.
- Mint each function as both `skos:Concept` and `crm:E55_Type`, using a stable
  URI below that scheme.
- Model an attested place function as `crm:E17_Type_Assignment`:
  `crm:P41_classified` points only to the physical E25 plantation,
  `crm:P42_assigned` points to the function concept, and
  `crm:P4_has_time-span` records the attested interval when known.
- Retain `prov:hadPrimarySource` on every assignment. A date range summarizes
  source attestations and does not claim the function began or ended at those
  boundaries. Source absence is not evidence that a function ceased.
- Derive assignments from the curated `productAssertions` and from the v2
  Almanakken `function` field. Composite production values are split into
  atomic functions so they can be browsed and linked independently.
- Keep every raw Almanakken row as an E13 observation on its E74 organization.
  The place-function assignment is a traceable application projection; it does
  not change the target or wording of the immutable source observation.
- Retain `productAssertions` as the editorial storage key for compatibility.
  Public application JSON additionally exposes the semantically named
  `functionAssertions` projection.

## Consequences

- `/vocabulary` retains the geographical-feature thesaurus, including its
  hierarchy, definitions, mappings, editorial notes, and editor. An adjacent
  Place Functions view lists each function and the physical plantations to
  which it is assigned, with source terms and attested spans.
- Plantation pages and the Explore panel link their function assignments back
  to the canonical vocabulary term.
- Organizations do not receive E17 place-function assignments. Their raw E13
  observations remain available as provenance for the derived place view.
- The publication validator checks the scheme, term identifiers, E17 targets,
  time spans, application counts, and links between terms and place records.
