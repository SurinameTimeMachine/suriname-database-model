# Model implementation coverage

The CIDOC CRM model is documented here by implementation status rather than
treating every diagram node as currently serialized data.

## Aggregate graph

E25, E26, E53, E41, E22, E13, E36, E52, E55, and E12 are generated in
`database.jsonld`. Plantation QIDs are external `skos:closeMatch` authority
links, not locally retyped E74 organizations. Owner and management values are
source transcriptions pending actor reconciliation; dimensions and several
identifiers are also not yet modeled as their own CRM nodes.

## Place-record profile

Per-record JSON-LD adds E17 operational classifications, E42 QGIS identifiers,
E99 product types, GeoSPARQL CRS84 geometry, source-row Almanakken evidence,
and probable time-scoped source-linked organisation associations.

## Planned

E39 Actor, E74 Group, E54 Dimension, E81 Transformation, E11 Modification,
E6 Destruction, and E68 Dissolution are not yet emitted as graph entities.
Rijksmuseum, vital records, ward registers, and emancipation registers remain
future source adapters.
