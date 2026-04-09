# Suriname Time Machine Database Model

A Linked Open Data platform for historical records from Suriname's colonial archives. Transforms plantation datasets, almanac observations, and georeferenced maps into a CIDOC-CRM knowledge graph, served through an interactive map viewer.

## Quick Start

```bash
cd app
pnpm install
pnpm pipeline    # generate JSON-LD + prepare frontend data
pnpm dev         # start dev server at http://localhost:3000
```

## Project Structure

```
data/                            # Source datasets (CSV, TSV)
docs/                            # Documentation & data models
app/                             # Next.js application
  scripts/
    transform-plantations.ts     # QGIS CSV -> CIDOC-CRM entities
    transform-almanakken.ts      # Almanac CSV -> observations
    generate-database.ts         # Build JSON-LD + GeoJSON
    prepare-data.ts              # Split JSON-LD for frontend
  components/                    # React components (map, search, panels)
  lib/                           # Types & data loading
  lod/                           # Generated JSON-LD & GeoJSON (gitignored)
  public/data/                   # Frontend data files (gitignored)
```

## Data Pipeline

1. **transform-plantations.ts** -- Reads 1,596 QGIS polygons (EPSG:31170 Suriname Old TM), reprojects to WGS84, produces E25/E74/E53/E41 entity arrays
2. **transform-almanakken.ts** -- Reads 22,999 almanac rows (1818-1861), produces organization observations and appellations
3. **generate-database.ts** -- Merges both transforms into a single JSON-LD graph (38,371 entities) with provenance chains, plus a GeoJSON feature collection
4. **prepare-data.ts** -- Splits the JSON-LD into indexed JSON files for the Next.js frontend

Run the full pipeline: `pnpm pipeline`

## Data Sources

| Dataset                                                                      | Records            | Period    | Primary Entity   |
| ---------------------------------------------------------------------------- | ------------------ | --------- | ---------------- |
| [Plantagen Dataset](docs/data-sources/01-plantagen-dataset.md)               | 375                | 1700-1863 | Plantations      |
| [Death Certificates](docs/data-sources/02-death-certificates.md)             | 192,335            | 1845-1915 | Vital records    |
| [Birth Certificates](docs/data-sources/03-birth-certificates.md)             | 63,200             | 1828-1921 | Vital records    |
| [Ward Registers](docs/data-sources/04-ward-registers.md)                     | 102,260            | 1828-1847 | Census data      |
| [Slave & Emancipation](docs/data-sources/05-slave-emancipation.md)           | 95,388             | 1830-1863 | Enslaved persons |
| [Almanakken](docs/data-sources/06-almanakken.md)                             | 22,999             | 1818-1861 | Observations     |
| [QGIS Maps](docs/data-sources/07-qgis-maps.md)                               | 1,596              | 1930      | Polygons         |
| [Wikidata](docs/data-sources/08-wikidata.md)                                 | --                 | --        | Identifiers      |
| [Historic Map Annotations](docs/data-sources/10-historic-map-annotations.md) | not yet determined | --        | Map annotations  |

## Tech Stack

- **Next.js 15** with React 19, Tailwind CSS 4
- **Leaflet** + react-leaflet for interactive maps
- **CIDOC-CRM** ontology for cultural heritage modeling
- **JSON-LD** as the linked data serialization format
- **proj4** for CRS reprojection (EPSG:31170 -> EPSG:4326)

## Documentation

```
docs/
  data-sources/    # Dataset documentation
  concepts/        # Theoretical foundations
  models/          # Data models & diagrams
  decisions/       # Architecture Decision Records
  references.md    # Academic citations
```
