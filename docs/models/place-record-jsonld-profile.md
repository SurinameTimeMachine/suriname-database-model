# Place record JSON-LD profile

## Purpose

The Gazetteer is an editorial working record. Public Linked Data is generated
from it as one authority-record document per place. The authority record is a
stable STM document which describes, but is not identical to, the CRM entities
within it.

Editors change the concise Gazetteer fields and source-bound statements; they
do not edit generated JSON-LD. A GitHub save is the canonical change. The next
deployment runs the publication pipeline and updates the HTML, `.json`, and
`.jsonld` representations together. The editor shows this as pending until the
deployment has completed.

## Stable identifiers and representations

For `stm-00705` the public contract is:

- `https://data.surinametijdmachine.org/place/stm-00705` — authority record and HTML representation.
- `.../place/stm-00705.jsonld` — JSON-LD representation.
- `.../place/stm-00705.json` — application JSON representation.
- `.../place/stm-00705/feature` — E25/E26 physical feature when applicable.
- `.../place/stm-00705/location` — E53 Place.

The HTTPS URL is canonical until an ARK name assigning authority issues ARKs.
The generated identifier manifest is the only place future ARK redirects are
configured; no provisional `ark:/` values are published.

## Evidence model

An Almanakken row is retained as a source-bound E13 observation, not treated as
proof that a building was constructed or destroyed. The generated record
therefore distinguishes:

- physical feature lifecycle — E25/E26 claims only when direct physical
  evidence exists;
- operational status — source-bound E17 Type Assignments such as cultivation
  attested, abandonment reported, and cultivation re-attested;
- cultivation evidence — E13 Attribute Assignment to the physical feature,
  assigning an E99 Product Type;
- organisational relations — future E13 role assertions linking E25 and E74
  with a role, source, time span, and certainty.

Derived periods are marked `probable` where they summarize multiple source
assertions. A source statement such as a reported abandonment is `certain` as
a statement by that source, not as an unqualified historical fact. The raw
Almanakken record ID remains on each observation so summaries are reproducible.

## Sources and geometry

Names are E41 Appellations, identifiers are E42 Identifiers, source documents
are E22/E31 nodes, and Dikland PDF references become structured E22/E31 nodes
linked to the Dikland collection. Geometries use GeoSPARQL WKT in CRS84.

Each editorial statement has a stable ID and a registry source. Product and
operational-status statements also require a date or time span. District and
location statements carry a time span when the source supplies one; an unknown
date is left unknown rather than invented. Record-level `sources` describe
evidence for the overall record or geometry, while statement sources describe
the individual claim. They are different scopes, not duplicate claims.

## Historical address points

The 1885 Paramaribo point layer is imported as editable `historical-address`
records whose E53 location is explicitly a `stm:LocationPoint`: a persistent
coordinate anchor for future source observations. This follows the HisGIS /
Amsterdam Time Machine space-time-prism pattern at profile level: the point is
the fixed control point, while each dated address statement is a source-bound
observation attached to that point.

Each address observation cites `historic-map-27`, has an 1885 time span, points
back to the `stm:LocationPoint` with `crm:P140_assigned_attribute_to`, assigns
the dated address appellation with `crm:P141_assigned`, and retains its original
QGIS feature index. Its geometry is serialized as GeoSPARQL `POINT` WKT under a
`/geometry/point` URI. It is not a claim that the address, building, parcel, or
function persisted at another time. The 1854 and 1916 descriptive fields in
this source remain source content until independently georeferenced address
datasets are available.

## Deferred domains

Rijksmuseum, births, deaths, ward registers, and emancipation data require
their own source adapters. They must retain source-row provenance and may not
assert unresolved place links as facts.

## Validation

The pipeline checks canonical IDs, per-record JSON-LD contexts, unique graph
IDs, generated JSON projections, authority-link syntax, and publication
consistency. The corresponding SHACL profile is
`app/lod/place-record-profile.shacl.ttl`; pipeline checks enforce the supported
record constraints until a general RDF/SHACL engine is added. The project does
not claim full Linked Art conformance.
