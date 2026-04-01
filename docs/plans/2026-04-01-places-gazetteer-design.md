# Places Gazetteer Design

Date: 2026-04-01

## Overview

A Suriname place gazetteer -- an authority list / taxonomy of named places (plantations, districts, rivers, settlements) that serves as the canonical reference for all location data in the project.

## Scope

Initial seed covers:

- 1,596 plantation locations from QGIS (E53 Place entities with polygon geometry)
- 11 districts/divisions from almanakken `district_of_divisie` column
- 44 standardized location references from almanakken `loc_std` column (rivers, creeks, roads)

## Data Schema

Each place is a flat JSON object:

```json
{
  "id": "plantation/fid-1572",
  "type": "plantation",
  "prefLabel": "Nieuw Java",
  "altLabels": [],
  "broader": "district/nickerie",
  "description": "",
  "location": {
    "lat": 5.854,
    "lng": -54.508,
    "wkt": "POLYGON((...)))",
    "crs": "EPSG:4326"
  },
  "sources": ["map-1930"],
  "wikidataQid": "Q59132846",
  "fid": 1572,
  "modifiedBy": null,
  "modifiedAt": null
}
```

Place types: `plantation` | `district` | `river` | `settlement`

Hierarchy: `broader` field links child to parent (e.g. plantation -> district).

## Storage

- Source of truth: `data/places-gazetteer.json` in the Git repo
- App reads from `app/public/data/places-gazetteer.json` (copied by prepare-data)
- Edits committed to GitHub via Contents API as the authenticated user

## Authentication

- GitHub OAuth (collaborators can edit)
- API routes handle OAuth flow with encrypted cookie session
- Read access is public (no auth required to browse)

## UI

- Route: `/places`
- List view with search + type filter (All / Plantations / Districts / Rivers / Settlements)
- Inline editor panel with form fields + Leaflet mini map preview
- Auth bar: "Sign in with GitHub" or user avatar

## CIDOC-CRM Alignment

The gazetteer corresponds to E53 Place entities in the data model:

- `prefLabel` = skos:prefLabel / rdfs:label
- `altLabels` = skos:altLabel / P139 has alternative form
- `broader` = skos:broader (taxonomy hierarchy)
- `location.wkt` = geo:asWKT on geo:Geometry
- `location.crs` = dcterms:conformsTo
- `sources` = P70i is documented in
- `wikidataQid` = sdo:sameAs
