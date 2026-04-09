# Plantation Data Model Implementation

## Overview

This document describes the implementation of the Suriname Time Machine plantation data model, following Linked Open Data (LOD) principles with CIDOC-CRM, Schema.org, and PICO alignment.

## Data Model

### Core Concept: Dual-Typing

A **plantation** is modeled with multiple types on the same entity:

```
wd:Q59115309
    a crm:E25_Human-Made_Feature,  # Physical landscape feature
      sdo:Organization,                     # Legal/economic entity (PICO alignment)
      crm:E25_Human-Made_Feature ;    # Physical landscape feature (domain type)
```

This approach:

- Uses **CIDOC-CRM E25** for the physical/geographical aspect
- Uses **Schema.org Organization** for PICO model compatibility (person affiliation)
- Uses **crm:E25_Human-Made_Feature** as the primary physical type for domain queries

### Why E25_Human-Made_Feature?

We chose [E25_Human-Made_Feature](https://cidoc-crm.org/Entity/e25-human-made-feature/version-7.1.3) over other CIDOC-CRM classes for the following reasons:

| Class                         | Definition                                       | Why not?                                                  |
| ----------------------------- | ------------------------------------------------ | --------------------------------------------------------- |
| E22_Human-Made_Object         | Movable physical items                           | Plantations are **immovable** (attached to land)          |
| E24_Physical_Human-Made_Thing | Persistent physical items (movable OR immovable) | Too broad; includes movable objects                       |
| E25_Human-Made_Feature        | Human-made features of larger structures or land | **Correct choice** -- plantations are landscape features  |
| E27_Site                      | Defined by archaeological convention             | Too arbitrary; plantations have clear physical boundaries |

A plantation qualifies as E25 because it is:

1. **Immovable** — Attached to the land
2. **Human-made** — Cleared forest, constructed buildings, irrigation, planted crops
3. **Persistent** — Has a lifespan (built -> modified -> abandoned)
4. **A landscape feature** — A purposely created modification of the physical landscape

The CIDOC-CRM specification states that E25 "comprises physical features of any size that are purposely created by human activity" and is a subclass of both E24 Physical Human-Made Thing and E26 Physical Feature — covering **buildings, gardens, and land modifications**.

Using E25 gives us access to useful properties:

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

| Property                       | Ontology   | Purpose                                              |
| ------------------------------ | ---------- | ---------------------------------------------------- |
| `skos:prefLabel`               | SKOS       | Current/latest known name                            |
| `skos:altLabel`                | SKOS       | Historical name variants                             |
| `crm:P1_is_identified_by`      | CRM        | PSUR register identifier (E42)                       |
| `crm:P2_has_type`              | CRM        | Physical status (built, abandoned, planned, unknown) |
| `geo:hasGeometry`              | GeoSPARQL  | Polygon coordinates                                  |
| `crm:P138i_has_representation` | CRM        | Links to historic map depictions (E36)               |
| `sdo:parentOrganization`       | Schema.org | Merger relationship                                  |

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

- `crm:E25_Human-Made_Feature` for spatial/physical properties
- `geo:hasGeometry` for GIS integration
- `crm:E13_Attribute_Assignment` for time-series data (Almanakken)

## Example Output

### Turtle

```turtle
plantation/breedevoort
    a crm:E25_Human-Made_Feature ;
    crm:P2_has_type type/plantation-status/built ;
    skos:prefLabel "Breedevoort"@nl ;
    crm:P52_has_current_owner wd:Q59115309 ;
    crm:P53_has_location [
        a crm:E53_Place ;
        crm:P48_has_preferred_identifier "fid-1572" ;
        geo:hasGeometry [
            a geo:Geometry ;
            geo:asWKT "Polygon ((...))"^^geo:wktLiteral
        ]
    ] .

wd:Q59115309
    a crm:E74_Group, sdo:Organization ;
    sdo:additionalType wd:Q188913 ;
    crm:P48_has_preferred_identifier "Q59115309" ;
    crm:P1_is_identified_by [ a crm:E42_Identifier ; crm:P190_has_symbolic_content "PSUR0041" ] ;
    skos:prefLabel "Breedevoort"@nl .
```

### JSON-LD

```json
{
  "@context": "https://raw.githubusercontent.com/.../context.jsonld",
  "@id": "plantation/breedevoort",
  "@type": "crm:E25_Human-Made_Feature",
  "P2_has_type": "type/plantation-status/built",
  "prefLabel": "Breedevoort",
  "P52_has_current_owner": {
    "@id": "http://www.wikidata.org/entity/Q59115309",
    "@type": ["crm:E74_Group", "sdo:Organization"],
    "additionalType": "http://www.wikidata.org/entity/Q188913",
    "P48_has_preferred_identifier": "Q59115309",
    "P1_is_identified_by": { "@type": "crm:E42_Identifier", "P190": "PSUR0041" }
  }
}
```

## Next Steps

1. **Almanakken Integration**: Extract `plantation_observations.csv` from 23,004 Almanakken rows
2. **SPARQL Endpoint**: Consider using Oxigraph or Virtuoso for query support
3. **Person Linking**: Connect enslaved persons via `sdo:affiliation` to plantation QIDs
4. **Validation**: Run SHACL validation against PICO shapes
