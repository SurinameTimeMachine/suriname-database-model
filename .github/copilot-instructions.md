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

## Formatting Rules

- **No emojis** — Never use emojis in any files, diagrams, code, or documentation in this project
- **Mermaid erDiagram** — Does NOT support `%%` comments; use YAML frontmatter for metadata instead
- **Mermaid flowchart** — Supports `%%` comments normally

## Key Modeling Decisions (Universal Source Pattern)

Always use these patterns (see SKILL.md Part 8 for full details):

- **Physical sources**: Use E22 Human-Made Object for maps, books, ledgers (NOT E73 Information Object)
- **Source chain**: E22 Human-Made Object -> P128 carries -> E36 Visual Item -> P138 represents -> E24/E26/E74/E21
- **Digital reproductions**: E38 Image -> P138 represents -> E22 (NOT P183i)
- **Production events**: E22 -> P108i was produced by -> E12 Production -> P4 has time-span -> E52 Time-Span
- **Location principle**: "Maps depict things; things have locations" — E36 does NOT connect directly to E53 Place

## Diagram Files

Key conceptual diagrams in `/docs/models/`:

- `universal-source-pattern.mmd` — How all sources (maps, almanacs, registers) connect to entities
- `three-entity-model.mmd` — Main ER diagram with all CIDOC-CRM entities
- `postgres-schema.mmd` — Database implementation schema
