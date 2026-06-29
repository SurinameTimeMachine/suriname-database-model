# Model implementation coverage

`app/app/model/page.tsx` describes the intended CIDOC CRM model. It now marks
each class by implementation status rather than treating every diagram node as
currently serialized data.

## Aggregate graph

E25, E26, E74, E53, E41, E22, E13, E36, E52, E55, and E12 are generated in
`database.jsonld`. Some property ranges remain transitional: actors and
dimensions are still literals, and several identifiers are not yet E42 nodes.

## Place-record profile

Per-record JSON-LD adds E17 operational classifications, E42 QGIS identifiers,
E99 product types, GeoSPARQL CRS84 geometry, source-row Almanakken evidence,
and probable time-scoped source-linked organisation associations.

## Planned

E39 Actor, E54 Dimension, E81 Transformation, E11 Modification, E6
Destruction, and E68 Dissolution are not yet emitted as graph entities.
Rijksmuseum, vital records, ward registers, and emancipation registers remain
future source adapters.
