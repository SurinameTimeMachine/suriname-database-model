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

- **E25 Plantation is the main entity** - the physical thing depicted by sources
- E53 Place = location/geometry of the plantation (via P53)
- E74/sdo:Organization = who operates the plantation
- **CIDOC-CRM** for cultural heritage modeling
- **PICO model** for historical persons
- **Wikidata Q-IDs** as primary identifiers for organizations
- **Qualified links** with certainty levels for uncertain matches

## Data Sources

Primary data lives in `/data/` with these key sources:

- `07-gis-plantation-map-1930/` — QGIS polygons
- `06-almanakken/` — Annual plantation observations
- `05-slave-emancipation/` — Slave registers with PSUR IDs

## Source Registry Rules (Mandatory)

- The canonical source authority is `data/sources-registry.jsonld`.
- Every source reference used in transformations, JSON-LD, or UI must resolve to a registry E22 entry.
- Never introduce ad-hoc source IDs/URIs in scripts or components.
- If a new source is needed, add/update it in the registry and ensure it is visible on `/sources`.

## Provenance Boundary (Mandatory)

- Distinguish entity-level provenance (`prov:wasDerivedFrom`) from assertion-level provenance (E41/E13/E17 statements tied to E22 + time context).
- For changeable values (names, roles, products, locations, notes), prefer assertion-level provenance over flat record fields.

## Output Locations

- RDF/Turtle files → `/lod/ttl/`
- Processed CSVs → `/lod/csv/`
- Transformation scripts → `/scripts/`
- Documentation → `/docs/`

## Formatting Rules

- **No emojis** — Never use emojis in any files, diagrams, code, or documentation in this project
- **No rounded corners** — All UI elements use sharp/square corners (border-radius: 0). The `--radius-*` theme tokens are globally set to `0px` in `globals.css`. Never add `rounded`, `rounded-sm`, `rounded-md`, `rounded-lg`, or `rounded-xl` to new elements. Exception: `rounded-full` is allowed only for circular avatars and small dot indicators.
- **Mermaid erDiagram** — Does NOT support `%%` comments; use YAML frontmatter for metadata instead
- **Mermaid flowchart** — Supports `%%` comments normally

## Color System

- **CRITERIA/Bruseker CRM colors are canonical** — Entity identity colors follow the CIDOC-CRM CRITERIA scheme (George Bruseker). Never invent new entity colors; use `CRM_COLORS` from `app/lib/data.ts`.
- **Single source of truth** — `CRM_COLORS` dict in `app/lib/data.ts` is the canonical mapping. CSS tokens in `globals.css` (`--color-entity-*`) mirror these values for Tailwind usage.
- **Place type colors derive from CRM parent class** — Each place type uses a tint/shade within its parent CRM class hue family (e.g., plantation types use E25 salmon variants, water features use E26 blue variants). Defined in `data/place-types-thesaurus.jsonld`.
- **Entity colors as backgrounds, not text** — CRITERIA pastels have poor contrast as text on light backgrounds. Use entity color as `background-color` with dark text (`text-stm-warm-800` or `#78716c`) for WCAG AA compliance. Use white text only on darker entity colors (E25, E53, E22).
- **Surface palette** — Backgrounds use the warm sepia/parchment palette (`stm-warm-*`, `stm-sepia-*`). Never use arbitrary hex values for surfaces; use the existing CSS custom properties.
- **No hardcoded entity hex in components** — Always reference `CRM_COLORS['Exx']` in TypeScript or `bg-entity-exx`/`text-entity-exx` in Tailwind classes. Never inline raw hex values for entity identity colors.

## Key Modeling Decisions (Universal Source Pattern)

Always use these patterns (see SKILL.md for full details):

- **E25 Plantation is central**: Sources depict plantations; plantations have locations
- **Physical sources**: Use E22 Human-Made Object for maps, books, ledgers (NOT E73)
- **Source chain**: E22 -> P128 carries -> E36 Visual Item -> P138 represents -> E25 Plantation
- **Location chain**: E25 Plantation -> P53 has location -> E53 Place (geometry)
- **Digital reproductions**: E36 Visual Item -> P138 represents -> E22
- **Location principle**: "Maps depict things; things have locations" — E36 does NOT connect to E53 directly

## Diagram Files

Key conceptual diagrams in `/docs/models/`:

- `universal-source-pattern.mmd` — How all sources (maps, almanacs, registers) connect to entities
- `three-entity-model.mmd` — Main ER diagram with all CIDOC-CRM entities
- `postgres-schema.mmd` — Database implementation schema
