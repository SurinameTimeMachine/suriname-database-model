# Readable place object profile

## Purpose

The readable place profile provides one predictable JSON-LD object shape for
every active Gazetteer record: address points, creeks, districts, Indigenous
and Maroon villages, military posts, plantations, railroads, rivers, roads,
settlements, stations, and towns. It follows the single-root object style used
by GLOBALISE and the core Linked Art Place API without claiming full
conformance to either profile.

It is the default public JSON-LD representation. It does not replace the
Gazetteer editor record, the application JSON projection, or the lossless STM
authority-record graph.

## Endpoint and identity

For `stm-00705`:

- `/place/stm-00705` remains the canonical authority-record page.
- `/place/stm-00705.jsonld` returns the readable Place object.
- `/place/stm-00705.jsonld?profile=complete` returns the complete
  authority-record graph.
- `/place/stm-00705.jsonld?profile=globalise` remains a compatibility alias for
  the readable object.
- The readable root keeps the existing
  `https://data.surinametijdmachine.org/place/stm-00705#location` identifier.

The readable representation never wraps the result in `@graph`. Nested names, identifiers,
features, assignments, time spans, and geometry references retain their
existing IDs, so their identity does not depend on the JSON nesting.

Its only visible schema declaration is the versioned
`https://data.surinametijdmachine.org/data/context/stm-v1.jsonld` context. That
context layers a small STM extension over Linked Art 1.0. The complete graph
uses the versioned `/data/context/place-record-v1.jsonld` context by URL
instead of embedding its definitions in every record.

## Symmetric place structure

Every record has the same E53 Place root:

| Readable field | Meaning |
| --- | --- |
| `id`, `type`, `_label` | Stable E53 Place identity and display label |
| `classified_as` | Canonical STM structural place-type concept |
| `identified_by` | Existing E41 names and E42 identifiers |
| `referred_to_by` | Human-readable location descriptions |
| `defined_by` | Authoritative GeoSPARQL WKT, when present |
| `centroid` | Existing centroid geometry; never promoted to a boundary |
| `part_of` | Link to a containing E53 Place |
| `related_features` | Separate E25/E26 feature occupying the Place |
| `attributed_by` | E13 statements about the Place |
| `classified_by` | Dated E17 classifications of the Place |
| `derived_from` | Record-level source provenance |
| `documented_by` | Link back to the complete authority record |

Points, lines, polygons, and multipolygons therefore differ only in their WKT,
not in their surrounding object model. Records without an authoritative
geometry remain valid Places. A centroid alone remains an approximation and
does not become `defined_by`.

For records with a separate physical feature, the complete STM graph links the
same identified E41 appellations to both the feature and its Place. This gives
all place types one query shape without minting duplicate names or changing
their source metadata.

## Place, physical feature, and organization

An E53 Place is a spatial extent. A plantation, settlement, road, station, or
other built feature is represented separately as E25; a river or creek is
represented separately as E26. The Place links to that entity through
`related_features`. District and historical-address records currently need no
separate physical feature.

The relation is:

```text
E53 Place
  └─ related_features → E25/E26 physical feature
                           └─ associated_organizations → E74 organization
```

Organization links remain properties of the physical feature rather than the
spatial Place. The readable profile publishes an organization target only when
the existing association status is `linked`. It retains
`organization_association_status` for review, but does not turn
`needs-physical-link-review` or `needs-organization-link` candidates into
facts. The relation is not an ownership claim.

The current physical-feature/organization relation is not time-qualified.
Historical changes must be published as source-bound assertions with their own
IDs, time spans, certainty, and evidence; they must not be collapsed into a
permanent direct relation.

## Time and provenance

Assignments are nested for convenient reading but remain identified entities:

```text
Place or physical feature
  ├─ attributed_by → E13 Attribute Assignment
  └─ classified_by → E17 Type Assignment
                         ├─ timespan → E52 Time-Span
                         ├─ evidence → source
                         ├─ derived_from → exact observation or row
                         └─ certainty → controlled term
```

This keeps historical addresses, district membership, operational status, and
plantation functions source- and time-bound. Unknown dates, certainty, or
sources are not invented. Name-level source carriers are retained through
`carried_by`.

Exact, close, broad, narrow, and related external matches remain distinct SKOS
relations on the physical feature. The profile does not introduce `sameAs`.

## Separation of responsibilities

- Editors continue to save concise Gazetteer records and source-bound
  assertions.
- The normal JSON representation remains the application/editor projection.
- The default JSON-LD representation is the readable interoperability view.
- The `complete` JSON-LD profile remains the lossless authority-record graph.

Future independent files for Place, physical feature, organization, source,
assertion, and change entities can reuse the IDs already exposed here. That
migration should be additive and should not move facts between entities without
an explicit model decision.

## Validation

The publication pipeline validates every active Place object. It checks stable
root IDs, structural type, names and identifiers, geometry versus centroid,
containing-place links, physical-feature links, assignment counts, source
provenance, and organization review status. One representative of every active
place type is expanded as JSON-LD. Profiles containing `@graph` or `sameAs`
fail publication.
