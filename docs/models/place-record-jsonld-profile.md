# Place record JSON-LD profile

## Purpose

The Gazetteer is an editorial working record. Public Linked Data is generated
from it as one authority-record document per place. The authority record is a
stable STM document which describes, but is not identical to, the CRM entities
within it.

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
