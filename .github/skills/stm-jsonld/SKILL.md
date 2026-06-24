---
name: stm-jsonld
description: 'Model, generate, review, and validate Suriname Time Machine place-record JSON-LD. Use when changing Gazetteer transforms, authority-record routes, CIDOC CRM/GeoSPARQL/PROV mappings, source provenance, lifecycle assertions, or future source adapters.'
---

# STM JSON-LD Skill

Read [the place-record profile](../../../docs/models/place-record-jsonld-profile.md)
before changing the public record model.

## Workflow

1. Keep editorial Gazetteer input separate from generated public JSON-LD.
2. Preserve every source assertion and its source-row provenance.
3. Model physical E25/E26 lifecycle separately from operational and cultivation evidence.
4. Use E13 for source-bound attributions; do not create E12 production events
   without evidence of a discrete event and output.
5. Keep E25 features distinct when an E74 organisation operates non-contiguous
   places. Use E81 only for evidenced physical transformation.
6. Run the full pipeline and production build before publishing changes.

## Editing rules

- Edit Gazetteer values and source-bound statements only; generated JSON-LD is
  rebuilt during deployment.
- Every statement needs a stable ID and a registered source. Add a time span
  when the source supplies one; never invent dates to satisfy a field.
- A record source and a statement source have different scopes. Do not add a
  second field merely to repeat the same identifier.
- Treat historical address points as source-specific E53 observations. Preserve
  their source feature index and do not turn their labels into timeless
  building or organisation claims.

## Public contract

- `/place/{id}` is the authority-record URL and HTML representation.
- `.jsonld` is semantic JSON-LD; `.json` is the application projection.
- Use the canonical data host. Do not introduce provisional ARKs or the retired
  ontology host.

## Coverage status

The model page distinguishes aggregate-graph, place-record-profile, and planned
classes. Do not present planned classes as serialized data. Keep future source
adapters unresolved until they preserve source-row provenance and match review.
