# Validation Checklist

Quick reference for validating plantation data entities.

## Plantation (E24 Physical Human-Made Thing) - MAIN ENTITY

- [ ] Type: `crm:E24_Physical_Human-Made_Thing`
- [ ] URI = `stm:plantation/{name-slug}`
- [ ] `skos:prefLabel` with `@nl` tag
- [ ] `crm:P2_has_type` with `stm:PlantationStatus_*` value
- [ ] `crm:P53_has_location` linking to E53 Place
- [ ] `stm:operatedBy` linking to Organization (Q-ID)
- [ ] `prov:wasDerivedFrom` linking to source
- [ ] `stm:mergedFrom` / `stm:mergedInto` if applicable

## Location (E53 Place)

- [ ] Type: `crm:E53_Place`
- [ ] URI = `stm:place/{year}/fid-{fid}`
- [ ] `stm:fid` from QGIS CSV
- [ ] `stm:mapYear` indicating source map year
- [ ] `geo:hasGeometry` with `geo:asWKT` polygon

## Organization (E74 / sdo:Organization)

- [ ] URI = Wikidata Q-ID (`wd:Qxxxxxxx`)
- [ ] Types: `sdo:Organization` or `crm:E74_Group`
- [ ] `sdo:additionalType wd:Q188913`
- [ ] `skos:prefLabel` with `@nl` tag
- [ ] `stm:absorbedInto` if absorbed

## Qualified Links (for uncertain matches)

- [ ] `stm:plantation` linking to E24
- [ ] `stm:organization` linking to Q-ID
- [ ] `stm:linkCertainty` (Certain / Probable / Uncertain)
- [ ] `stm:linkEvidence` explanation

## Observations (from Almanakken)

- [ ] Type: `stm:OrganizationObservation`
- [ ] `stm:observationOf` linking to Organization (Q-ID)
- [ ] `stm:observationYear` from Almanakken `year`
- [ ] `prov:hadPrimarySource` linking to almanac source

## Source Documents (E22)

- [ ] Type: `crm:E22_Human-Made_Object`
- [ ] `crm:P128_carries` linking to E36 Visual Item
- [ ] E36 uses `crm:P138_represents` to E24 Plantation (NOT to E53 directly)
- [ ] Digital scans: E38 Image `crm:P138_represents` the E22
