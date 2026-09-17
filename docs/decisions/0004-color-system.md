# ADR 0004: Unified Color System

## Status

Accepted

## Context

The Suriname Time Machine front-end had divergent color values across CSS tokens, TypeScript constants, SVG diagrams, and inline styles. Entity identity colors in `globals.css` did not match the CIDOC-CRM CRITERIA standard (George Bruseker) defined in `CRM_COLORS`. Place type map colors were arbitrary rather than derived from their CRM parent class. Homepage cards used entity colors as text on light backgrounds, which fails WCAG AA contrast requirements for pastel hues.

## Decision

### 1. CRITERIA colors are canonical

All entity identity colors follow the CIDOC-CRM CRITERIA scheme. The single source of truth is `CRM_COLORS` in `app/lib/data.ts`. CSS custom properties in `globals.css` (`--color-entity-*`) mirror these values for Tailwind usage.

| Entity | CRITERIA Hex | Name                 |
| ------ | ------------ | -------------------- |
| E25    | `#e6956b`    | Human-Made Feature   |
| E26    | `#5b9bd5`    | Physical Feature     |
| E24    | `#d4956b`    | Physical Human-Made  |
| E22    | `#c78e66`    | Human-Made Object    |
| E36    | `#d4a574`    | Visual Item          |
| E53    | `#94cc7d`    | Place                |
| E74    | `#ffbdca`    | Group / Organization |
| E41    | `#fef3ba`    | Appellation          |
| E13    | `#82ddff`    | Attribute Assignment |
| E39    | `#ffe6eb`    | Actor                |
| E55    | `#d4edda`    | Type                 |
| E52    | `#cce5ff`    | Time-Span            |
| E54    | `#e2d9f3`    | Dimension            |
| E12    | `#f0c87a`    | Production           |
| E17    | `#f0a0a0`    | Type Assignment      |
| E42    | `#b8c9e0`    | Identifier           |
| E81    | `#f0a0a0`    | Transformation       |
| E68    | `#e0b0b0`    | Dissolution          |
| PROV   | `#d4c4fb`    | Provenance           |

### 2. Place type colors derive from CRM parent class

Each place type uses a tint/shade within its parent CRM class hue family:

- **E25 salmon family**: plantation `#d4845a`, military-post `#c46f5a`, road `#b8816b`, railroad `#a07260`, station `#8c6350`, settlement `#c4956b`, town `#d4a87a`, indigenous-village `#c4a080`, maroon-village `#b89070`
- **E26 blue family**: river `#4a86b8` (darker), creek `#7aaed4` (lighter)
- **E53 green family**: district `#7ab86a`

### 3. Entity colors as backgrounds, not text

CRITERIA pastels (E41, E39, E74, E52, E54, E55) have poor contrast as text on light backgrounds. Rule: always use as `background-color` with dark text (`text-stm-warm-800` / `#78716c`). Use white text only on darker entity colors (E25, E53, E22, E26).

### 4. Surface palette

Backgrounds use the warm sepia/parchment palette (`stm-warm-*`, `stm-sepia-*`). No arbitrary hex values for surfaces.

### 5. No hardcoded entity hex in components

Always reference `CRM_COLORS['Exx']` in TypeScript or `bg-entity-exx` / `text-entity-exx` in Tailwind classes. Never inline raw hex values for entity identity colors.

## Consequences

- All entity colors are consistent across the model page, entity graph, thesaurus editor, homepage, and future components.
- Adding a new CRM entity requires one entry in `CRM_COLORS` + one CSS token in `globals.css`.
- Place types are visually grouped by their CRM parent class on the map.
- WCAG AA contrast is maintained by using entity colors as backgrounds with dark text.
