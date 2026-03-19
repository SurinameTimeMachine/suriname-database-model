# Plantation Data Model Implementation

## Overview

This document describes the implementation of the Suriname Time Machine plantation data model, following Linked Open Data (LOD) principles with CIDOC-CRM, Schema.org, and PICO alignment.

## Data Model

### Core Concept: Dual-Typing

A **plantation** is modeled with multiple types on the same entity:

```
wd:Q59115309
    a crm:E24_Physical_Human-Made_Thing,  # Physical built thing
      sdo:Organization,                     # Legal/economic entity (PICO alignment)
      stm:Plantation ;                      # Domain-specific type
```

This approach:

- Uses **CIDOC-CRM E24** for the physical/geographical aspect
- Uses **Schema.org Organization** for PICO model compatibility (person affiliation)
- Uses **stm:Plantation** as a convenience class for domain queries

### Why E24_Physical_Human-Made_Thing?

We chose [E24_Physical_Human-Made_Thing](https://cidoc-crm.org/Entity/e24-physical-human-made-thing/version-7.1.3) over other CIDOC-CRM classes for the following reasons:

| Class                         | Definition                                       | Why not?                                                  |
| ----------------------------- | ------------------------------------------------ | --------------------------------------------------------- |
| E22_Human-Made_Object         | Movable physical items                           | Plantations are **immovable** (attached to land)          |
| E24_Physical_Human-Made_Thing | Persistent physical items (movable OR immovable) | ✓ **Correct choice**                                      |
| E25_Human-Made_Feature        | Features dependent on a larger structure         | Plantations are **self-contained**                        |
| E27_Site                      | Defined by archaeological convention             | Too arbitrary; plantations have clear physical boundaries |

A plantation qualifies as E24 because it is:

1. **Immovable** — Attached to the land
2. **Human-made** — Cleared forest, constructed buildings, irrigation, planted crops
3. **Persistent** — Has a lifespan (built → modified → abandoned)
4. **Self-contained** — Not dependent on a larger structure

The CIDOC-CRM specification states that E24 covers "all instances of E19 Physical Object" plus "instances of E26 Physical Feature that are purposely created by human activity" — including **buildings and land modifications**.

Using E24 gives us access to useful properties:

- `crm:P53_has_former_or_current_location` — geographical placement
- `crm:P92i_was_brought_into_existence_by` — construction events
- `crm:P93i_was_taken_out_of_existence_by` — abandonment events

### Identifier Strategy

| Identifier   | Purpose                          | Example        |
| ------------ | -------------------------------- | -------------- |
| Wikidata QID | Primary URI (`@id`)              | `wd:Q59115309` |
| PSUR ID      | Link to Slave Registers          | `PSUR0041`     |
| Map ID       | Link to historic map annotations | `MAP_1930`     |

### Properties

| Property                 | Ontology   | Purpose                                              |
| ------------------------ | ---------- | ---------------------------------------------------- |
| `skos:prefLabel`         | SKOS       | Current/latest known name                            |
| `skos:altLabel`          | SKOS       | Historical name variants                             |
| `stm:psurId`             | Custom     | Slave Register identifier                            |
| `stm:status`             | Custom     | Physical status (built, abandoned, planned, unknown) |
| `geo:hasGeometry`        | GeoSPARQL  | Polygon coordinates                                  |
| `stm:depictedOnMap`      | Custom     | Links to historic map depictions                     |
| `sdo:parentOrganization` | Schema.org | Merger relationship                                  |

## Generated Files

### Directory Structure

```
lod/
├── context.jsonld         # JSON-LD context with namespace definitions
├── csv/
│   ├── plantations.csv    # Enhanced plantation data (1596 rows)
│   ├── plantation_names.csv   # Alternative names (93 rows)
│   └── plantation_maps.csv    # Map depiction links (2055 rows)
└── ttl/
    ├── plantations.ttl    # All plantations as RDF/Turtle (1061 with QID)
    └── example_plantation.jsonld  # Sample JSON-LD output
```

### Scripts

| Script                             | Purpose                                                  |
| ---------------------------------- | -------------------------------------------------------- |
| `scripts/transform_plantations.py` | CSV preprocessing (add prefLabel, status, extract links) |
| `scripts/csv_to_rdf.py`            | Generate RDF Turtle and JSON-LD from CSVs                |

## Statistics

From the 1930 plantation polygon dataset:

| Metric                      | Count  | Percentage |
| --------------------------- | ------ | ---------- |
| Total polygons              | 1,596  | 100%       |
| With Wikidata QID           | 1,061  | 66.5%      |
| With PSUR ID                | 443    | 27.8%      |
| Status "built"              | ~1,063 | -          |
| Status "unknown"            | 533    | -          |
| Alternative names extracted | 93     | -          |
| Map depiction links         | 2,055  | -          |

## PICO Model Alignment

Following the [PICO ontology](https://iisg.amsterdam/pico) (Modelling the enslaved as historical persons):

### Section 5.7: Plantations as Organizations

The PICO model represents plantations as `sdo:Organization` with:

- `sdo:additionalType: wdt:Q188913` (Wikidata: plantation)
- Person links via `sdo:affiliation` (for enslaved persons)
- Ownership via `sdo:parentOrganization`

### Our Extension

We extend PICO by adding:

- `crm:E24_Physical_Human-Made_Thing` for spatial/physical properties
- `geo:hasGeometry` for GIS integration
- `stm:PlantationObservation` for time-series data (Almanakken)

## Example Output

### Turtle

```turtle
wd:Q59115309
    a crm:E24_Physical_Human-Made_Thing,
      sdo:Organization,
      stm:Plantation ;
    sdo:additionalType wd:Q188913 ;
    stm:psurId "PSUR0041" ;
    skos:prefLabel "Breedevoort"@nl ;
    stm:status "built" ;
    geo:hasGeometry [
        a geo:Geometry ;
        geo:asWKT "Polygon ((...))"^^geo:wktLiteral ;
        stm:geometrySource stm:MAP_1930
    ] ;
    stm:depictedOnMap [
        stm:mapId "MAP_1930" ;
        stm:labelOnMap "Breedevoort"
    ] ;
    sdo:sameAs <http://www.wikidata.org/entity/Q59115309> .
```

### JSON-LD

```json
{
  "@context": "https://raw.githubusercontent.com/.../context.jsonld",
  "@id": "http://www.wikidata.org/entity/Q59115309",
  "@type": [
    "crm:E24_Physical_Human-Made_Thing",
    "sdo:Organization",
    "stm:Plantation"
  ],
  "additionalType": "http://www.wikidata.org/entity/Q188913",
  "prefLabel": "Breedevoort",
  "status": "built",
  "psurId": "PSUR0041"
}
```

## Next Steps

1. **Almanakken Integration**: Extract `plantation_observations.csv` from 23,004 Almanakken rows
2. **SPARQL Endpoint**: Consider using Oxigraph or Virtuoso for query support
3. **Person Linking**: Connect enslaved persons via `sdo:affiliation` to plantation QIDs
4. **Validation**: Run SHACL validation against PICO shapes
