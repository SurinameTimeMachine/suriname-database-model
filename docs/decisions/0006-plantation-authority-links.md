# ADR 0006: Separate plantation feature, organization, and place

## Status

Accepted. The E25/E74 separation, Almanakken v2 targeting, initial
presence-inference rule, and organization-link review overrides are
implemented. Researcher acceptance or rejection of presence inferences remains
follow-up work.

## Context

Historical sources use one plantation name for several related things:

- the physically altered agricultural land, fields, drainage works, buildings,
  mills, factories, and other fixed infrastructure;
- the organization or operating group that administered production and held
  historically documented legal and coercive relations to people;
- the geographic area occupied by those features and, sometimes later, by a
  settlement.

The QGIS `qid` column and Almanakken v2 `plantation_id` column use the same
Wikidata QID to connect these source perspectives. In this project, that QID
is the authority identifier for the plantation organization. It is an exact
authority match for the E74 organization, but only a close match for a mapped
E25 physical plantation. The two local entities may have the same or similar
appellations without being identical.

## Decision

### Physical plantation

- Mint a local `crm:E25_Human-Made_Feature` for the physical plantation
  complex: cultivated land and its fixed agricultural and industrial works.
- Link the E25 conservatively to the plantation QID with `skos:closeMatch`.
- Map and other explicitly physical-source appellations identify the E25.
- Link the E25 to one or more `crm:E53_Place` extents with source and temporal
  provenance. A mapped polygon is evidence of an extent at a stated time, not
  an eternal boundary.

### Plantation organization

- Mint a separate local `crm:E74_Group` for the plantation organization.
- Link the E74 to the plantation QID with `skos:exactMatch`; do not use the
  external Wikidata URI as the local entity identifier.
- Almanakken organization appellations identify the E74. They may also
  identify the matched E25 when the source usage does not distinguish the
  organization from the physical plantation complex.
- Almanakken E13 observations target the E74 when `plantation_id` resolves
  to a QID. Rows without a QID remain in the researcher review queue. More than
  one E25 close match for the same QID does not make the E74 target ambiguous.
- Owner, administrator, and director values remain source transcriptions until
  reconciled to E21/E39/E74 authority records and qualified roles.

The shared QID establishes the researched correspondence between the E25 and
E74, but it does not by itself prove a CIDOC CRM `P52 has current owner`
statement. Publish P51/P52 only when a source supports ownership of the
physical feature for a stated time. Operational, labor, residence, and
coercive relations require their own source-qualified assertions.

### Shared names and projections

CIDOC CRM P1 is many-to-many. Do not duplicate an E41 merely because the same
source name identifies both the E25 plantation and E74 organization. One
source-carried E41 may have both entities as `P1i identifies` targets when the
historical usage supports that reading. When a source clearly names only the
land, organization, settlement, building, or factory, target only that entity.

Other shared display data should be projected through the E25-E74
correspondence rather than copied as a second historical assertion. For
example, a UI may show an Almanakken product observation beside the physical
plantation, but the underlying source assertion remains on the E74 operational
observation. Every projection must remain traceable to that assertion.

### Derived presence on plantation land

Adopt a defeasible inference rule: when a source records an enslaved person or
population in a coercive relation to an E74 plantation organization, infer
probable presence at the matched E25 plantation and its contemporary E53
extent unless the source states otherwise.

This inference is not a second source claim. Publish it as a derived assertion
with:

- `prov:wasDerivedFrom` pointing to the source observation;
- the same or narrower time-span;
- `stm:certainty` set to probable;
- an identifier for the inference rule and the E25-E74 match used;
- a researcher-visible explanation and an override or rejection mechanism.

For aggregate counts, infer only the probable presence of the recorded
population, not unnamed individual identities. Suppress or qualify the rule
when fields indicate another plantation, shared labor, private rather than
plantation assignment, off-site administration, or another explicit location.
Residence, work, and presence are distinct relations and must not be inferred
from each other without a documented rule.

### Change over time

Keep physical and organizational change separate:

- An organizational split, merger, formation, or dissolution is modeled on
  E74 through E66 Formation, E68 Dissolution, P95, P99, and P151 as supported
  by evidence.
- A changed field boundary or altered complex does not automatically create a
  new plantation identity. Record dated geometries and E11 Modification while
  identity is considered continuous.
- Use E81 Transformation only when evidence supports the end of one physical
  identity and the production of another. Use E6 Destruction only when the
  documented E25 itself ceases to exist, not merely when cultivation stops.
- Abandonment, decay, or cessation reported by a source is an operational or
  condition assertion; source absence is not proof of destruction.

A settlement that develops on former or continuing plantation land is a new
E25 settlement feature at an overlapping E53 Place. It does not retype the
plantation. Both may coexist, or a sourced E81 Transformation may connect them
when substantial physical continuity and replacement are documented.

## Consequences

- A source-carried E41 may identify E25, E74, or both; source context controls
  the targets, so identical text is not duplicated automatically.
- Historically documented enslavement relations point to E74. Probable
  presence at the corresponding E25/E53 is a separate, reversible inference.
- Plantation organization mergers do not silently rewrite physical boundaries,
  and later settlements do not erase plantation history.
- E74 records use local STM URIs, Almanakken observations target them, and the
  merge review workflow distinguishes duplicate E25 records from multiple valid
  physical plantations associated with the same E74. A reviewer may merge the
  former or persist `confirmed-multiple` with the exact reviewed Gazetteer IDs
  for the latter. The decision becomes stale when that active ID set changes.
- Almanakken v2 is the sole source dataset. Its QIDs drive E74 observation
  targets but never silently rewrite curated Gazetteer authority links; the old
  cross-version comparison is not a research review task.
- Explore and the organization workspace present the E25-E74 correspondence in
  both directions. `stm:organizationAssociationStatus` distinguishes a linked
  correspondence from a missing Gazetteer authority link or a physical-link
  ambiguity; it is an editorial state, not an ownership assertion.
- The current publication exposes inference and suppression statuses. A later
  editorial PR must add persisted researcher acceptance, rejection, and reason
  fields without changing the source observation.
