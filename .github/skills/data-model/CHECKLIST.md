# Validation Checklist

Quick reference for validating plantation data entities.

## Plantation (E25 Human-Made Feature) - MAIN ENTITY

- [ ] Type: `crm:E25_Human-Made_Feature`
- [ ] URI = `{base}plantation/{name-slug}`
- [ ] `crm:P1_is_identified_by` E41 Appellation (formal name)
- [ ] `rdfs:label` with `@nl` tag
- [ ] `crm:P2_has_type` with `type/plantation-status/*` value
- [ ] `crm:P53_has_location` linking to E53 Place
- [ ] `crm:P52_has_current_owner` linking to Organization (Q-ID)
- [ ] `crm:P124i_was_transformed_by` E81 Transformation if merged

## Location (E53 Place)

- [ ] Type: `crm:E53_Place`
- [ ] URI = `{base}place/{year}/fid-{fid}`
- [ ] `crm:P48_has_preferred_identifier` E42 Identifier (QGIS feature ID)
- [ ] `crm:P1_is_identified_by` E41 Appellation (map label)
- [ ] `geo:hasGeometry` with `geo:asWKT` polygon
- [ ] `geo:hasCentroid` centroid point (WGS84)
- [ ] `dcterms:conformsTo` source CRS (EPSG:31170)

## Organization (E74 / sdo:Organization)

- [ ] URI = Wikidata Q-ID (`wd:Qxxxxxxx`)
- [ ] Types: `sdo:Organization` or `crm:E74_Group`
- [ ] `sdo:additionalType wd:Q188913`
- [ ] `rdfs:label` with `@nl` tag
- [ ] `crm:P1_is_identified_by` E41 Appellation
- [ ] `crm:P48_has_preferred_identifier` E42 Identifier (Wikidata Q-ID)
- [ ] `crm:P99i_was_dissolved_by` E68 Dissolution if dissolved

## Qualified Links (for uncertain matches)

- [ ] `crm:P140_assigned_attribute_to` linking to E25
- [ ] `crm:P141_assigned` linking to Q-ID
- [ ] `crm:P2_has_type` (Certain / Probable / Uncertain)
- [ ] `crm:P3_has_note` explanation

## Observations (E13, from Almanakken)

- [ ] Type: `crm:E13_Attribute_Assignment`
- [ ] `crm:P140_assigned_attribute_to` linking to Organization (Q-ID)
- [ ] `crm:P4_has_time-span` E52 Time-Span (year)
- [ ] `crm:P141_assigned` E41 Appellation (observed name)
- [ ] `crm:P141_assigned` E55 Type (product)
- [ ] `crm:P14_carried_out_by` E39 Actor (eigenaar / administrateur / directeur)
- [ ] `crm:P43_has_dimension` E54 Dimension (size in akkers)
- [ ] `crm:P7_took_place_at` E53 Place (location text)
- [ ] `prov:hadPrimarySource` linking to E22 (almanac)
- [ ] Person-related data (enslaved counts, free residents) is **deferred** -- requires PICO integration

## Classification (E17 Type Assignment)

- [ ] Type: `crm:E17_Type_Assignment` (subclass of E13)
- [ ] `crm:P41_classified` linking to E25 Plantation (the physical thing)
- [ ] `crm:P42_assigned` linking to E55 Type (`type/plantation-status/abandoned`)
- [ ] `crm:P4_has_time-span` E52 Time-Span (year from almanac)
- [ ] `prov:hadPrimarySource` linking to E22 (almanac)

## Source Documents (E22)

- [ ] Type: `crm:E22_Human-Made_Object`
- [ ] `crm:P128_carries` linking to E36 Visual Item
- [ ] `crm:P128_carries` linking to E41 Appellation
- [ ] E36 uses `crm:P138_represents` to E25 Plantation (NOT to E53 directly)
- [ ] Digital scans: E36 Visual Item `crm:P138_represents` the E22
