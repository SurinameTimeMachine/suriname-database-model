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

- Keep structural geographical-feature types as classifications for E25/E26/E53
  records. Every generated feature or place carries `crm:P2_has_type` to its
  canonical concept below
  `https://data.surinametijdmachine.org/vocabulary/place-type/`. These types
  continue to drive the map, geometry rules, and editing form, but are not the
  public function vocabulary.
- Publish functions in the SKOS concept scheme
  `https://data.surinametijdmachine.org/vocabulary/place-function`.
- Mint each function as both `skos:Concept` and `crm:E55_Type`, using a stable
  URI below that scheme.
- Model an attested place function as `crm:E17_Type_Assignment`:
  `crm:P41_classified` points only to the physical E25 plantation,
  `crm:P42_assigned` points to the function concept, and
  `crm:P4_has_time-span` records the attested interval when known.
- Retain `prov:hadPrimarySource` on every assignment. Almanakken projections
  additionally use `prov:wasDerivedFrom` to identify every supporting E13 source
  row and an explicit inference-rule URI. They are marked `probable`, because a
  row about an E74 organization is being projected onto its reviewed E25
  plantation counterpart.
- Use `crm:P4_has_time-span` for the classification activity's attestation
  range, not as a claim about the complete lifetime of the function. A single
  observed year has equal `P82a` and `P82b` `xsd:gYear` boundaries. A multi-year
  range summarizes source attestations; source absence is not evidence that a
  function ceased.
- Link functions with an unambiguous structural counterpart using
  `skos:related` (for example military post, church, quarantine station,
  ironworks, quarry, central factory, and brickworks). This relationship aids
  vocabulary navigation; it does not reclassify a place or erase earlier
  functions. A future source-attested settlement function can use the same
  pattern, but no settlement function is inferred from the Almanakken v2 data.
- Publish the structural place-type scheme and its concepts in the aggregate
  JSON-LD graph as well as the dedicated thesaurus document, so these related
  concept links always resolve to defined canonical resources.
- Derive assignments from the curated `productAssertions` and from the v2
  Almanakken `function` field. Composite production values are split into
  atomic functions so they can be browsed and linked independently. Matching
  product and function evidence for the same term, source, and interval becomes
  one assignment that retains both evidence paths and all source-row IDs.
- Publish only reviewed function terms with explicit labels. An unknown future
  source value fails the publication pipeline until it receives a controlled
  vocabulary mapping; source strings do not silently mint public concepts.
- Keep every raw Almanakken row as an E13 observation on its E74 organization.
  The place-function assignment is a traceable application projection; it does
  not change the target or wording of the immutable source observation.
- Retain `productAssertions` as the editorial storage key for compatibility.
  Public application JSON additionally exposes the semantically named
  `functionAssertions` projection.

## Consequences

- `/vocabulary` is one geographical-feature vocabulary interface containing
  the hierarchy, definitions, mappings, editorial notes, and editor. Selecting
  a structural type lists its public place records and any dated functions
  attested for those places. A function identifier opens the same interface,
  highlights that function, and filters the connected places.
- Plantation pages and the Explore panel link their function assignments back
  to the canonical vocabulary term.
- Organizations do not receive E17 place-function assignments. Their raw E13
  observations remain available as provenance for the derived place view.
- The publication validator checks canonical structural P2 links, scheme and
  term identifiers, E17 targets, both time-span boundaries, certainty,
  row-level provenance, application counts, and links between terms and place
  records. Focused derivation checks cover gaps, duplicate evidence,
  non-functions, and unmapped source terms.
