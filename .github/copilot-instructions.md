# Copilot Instructions for Suriname Time Machine

## MANDATORY: Read Skills Before Any Work

Before performing ANY task related to the following topics, you MUST read the corresponding skill file:

| Topic                                                                 | Skill File                              | When to Read                    |
| --------------------------------------------------------------------- | --------------------------------------- | ------------------------------- |
| New features, creative work, design decisions                         | `.github/skills/brainstorming/SKILL.md` | BEFORE any creative/design work |
| Data model, RDF, CIDOC-CRM, linked data, entities, schemas, databases | `.github/skills/data-model/SKILL.md`    | ANY data modeling task          |

## How to Use Skills

1. **Always read the full SKILL.md file first** — don't skim, don't assume
2. **Follow the patterns and decisions documented** — they exist for a reason
3. **Ask if something contradicts the skill** — don't silently ignore it

## Project Context

This is the Suriname Time Machine project — a Linked Open Data initiative for historical records from Suriname's colonial archives. Key concepts:

- **Three-entity model**: Land Plot (E53), Physical Site (E24), Organization (sdo:Organization)
- **CIDOC-CRM** for cultural heritage modeling
- **PICO model** for historical persons
- **Wikidata Q-IDs** as primary identifiers for organizations
- **Qualified links** with certainty levels connecting entities

## Data Sources

Primary data lives in `/data/` with these key sources:

- `07-gis-plantation-map-1930/` — QGIS polygons
- `06-almanakken/` — Annual plantation observations
- `05-slave-emancipation/` — Slave registers with PSUR IDs

## Output Locations

- RDF/Turtle files → `/lod/ttl/`
- Processed CSVs → `/lod/csv/`
- Transformation scripts → `/scripts/`
- Documentation → `/docs/`
