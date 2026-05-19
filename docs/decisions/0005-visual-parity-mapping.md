# ADR 0005: Main-Site Visual Parity Integration

## Status

Accepted

## Context

The Suriname Time Machine citizen science site (surinametijdmachine.org) has a mature visual system using Geist fonts, teal/cream color palette, and geometric motifs (angled panels, cut-corner blocks, hero overlays). The data.surinametijdmachine.org platform now adopts key visual language elements from the main site to create a unified brand experience while preserving domain-critical constraints: CIDOC-CRM entity color semantics, warm/sepia surface palette, and square corners throughout.

## Decision

### Token Mapping: Main Site → Data Site

All substitutions respect existing local tokens and constraints; no CRM colors or corner radius rules are overridden.

| Category              | Main Site                                               | Data Site                                                             | Rationale                                                                                        |
| --------------------- | ------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Fonts**             | Geist Sans (body), Source Serif 4 (headlines in slides) | Inter (body), Libre Baskerville (serif headlines)                     | Data site already uses these via Next.js font imports; maintain existing choice                  |
| **Background**        | `--background: #f4f8f7` (light teal-tinged)             | `--stm-warm-50: #faf9f7` (warm parchment)                             | Warm palette is canonical per ADR-0004; teal tints appear in accent overlays only                |
| **Text**              | `--ink: #0b3c34` (dark teal)                            | `--stm-warm-900: #242019` (warm charcoal)                             | Warm text ensures coherent hierarchy without CRM color confusion                                 |
| **Primary Accent**    | `--teal-strong: #006d5b`                                | `--stm-teal-600: #0b7a6b`                                             | Mapped for link underlines, focus states, hover accents                                          |
| **Secondary Accent**  | `--teal-bright: #34d1b3`                                | `--stm-teal-400: #22b8a0`                                             | Used for borders, active states, badge highlights                                                |
| **Tertiary Accent**   | `--cream: #fdf8f2`                                      | `--stm-sepia-50: #fdf8f0`                                             | Near-equivalent for subtle surface layers                                                        |
| **Dark Teal**         | `--deep-teal: #003c34`                                  | `--stm-warm-900: #242019`                                             | Used in hero backgrounds; substituted with warm-dark for consistency                             |
| **Angled/Cut Motifs** | Geometric overlays with `rgba(52, 209, 179, x)` teal    | Geometric overlays with `rgba(52, 209, 179, x)` or mapped teal equiv. | Teal-based overlays permitted for visual interest on light backgrounds; CRM semantics unaffected |
| **Entity Colors**     | N/A (main site has no entity graph)                     | Keep as defined in ADR-0004 `CRM_COLORS` dict                         | Unchanged; semantic integrity is non-negotiable                                                  |
| **Corner Radius**     | `rounded-sm`, `border-radius: 4px-8px` in components    | Square (`border-radius: 0`) everywhere per global `@theme`            | Global radius tokens set to 0px; exception only for `rounded-full` on circular avatars           |

### Application Scope

**Brand-Forward Pages** (apply strong parity):

- Homepage (`/`)
- Navigation header (all pages)
- Footer (all pages)
- Contact/participation pages if added

**Data-Semantic Pages** (apply conservative parity):

- Explore map (`/explore`)
- Model diagram (`/model`)
- Places view (`/places`)
- Sources view (`/sources`)
- Vocabulary editor (`/vocabulary`)

Rationale: Brand pages communicate the STM mission and visual identity; they can safely adopt hero overlays, angled panels, and prominent CTA styling. Data pages prioritize entity semantics and CIDOC-CRM clarity; visual embellishment is minimal and always subordinate to semantic colors.

### Visual Motifs Adapted

| Motif                      | Main Site                                                        | Data Site Implementation                                                                                 |
| -------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Hero overlay**           | Dark teal gradient (`linear-gradient(135deg, #003c34, #004f43)`) | Warm-dark gradient using `stm-warm-800/900` with optional teal accent layer at `rgba(52, 209, 179, 0.1)` |
| **Angled panel/section**   | Clip-path polygon with teal border/background                    | Clip-path polygon using sepia/warm tokens; teal used for accent border or gradient highlight only        |
| **Cut-corner card**        | White card with angled clip and teal gradient overlay            | White card with same clip-path and optional sepia/teal gradient overlay (muted opacity)                  |
| **Diagonal stack**         | Layered gradients with teal in background                        | Same structure, swapping teal components for warm/sepia equivalents or using teal as subtle accent layer |
| **Section divider/stripe** | Teal border or gradient bar                                      | Warm border or optional teal stripe for visual rhythm (with low opacity to preserve hierarchy)           |

### Typography Hierarchy

Adopt main-site rhythm and scale while maintaining existing font choices:

| Level              | Main Site                                     | Data Site                                                          |
| ------------------ | --------------------------------------------- | ------------------------------------------------------------------ |
| H1 (display)       | Source Serif 4, 1.4–1.75em, bold              | Libre Baskerville, 2–2.5rem (scale-up on small screens), font-bold |
| H2 (section)       | Source Serif 4, 0.95em, 600wt                 | Libre Baskerville, 1.5–1.875rem, font-semibold                     |
| H3 (subsection)    | Inter, 0.72em, 600wt                          | Inter, 1.125–1.25rem, font-semibold                                |
| H4 (small heading) | Inter, 0.62em, 400wt italic                   | Inter, 0.875–1rem, font-medium                                     |
| Body               | Inter, 0.82em (for presentations)             | Geist/Inter, 0.875–1rem, 400–500wt                                 |
| Caption/label      | Inter, 0.65–0.75em, uppercase, letter-spacing | Inter, 0.75–0.875rem, uppercase, tracking-wide                     |
| Mono (code/ID)     | Monospace, 0.7–0.8em                          | Geist Mono, 0.75–0.85rem                                           |

### Color Contrast & Accessibility

- Entity badge text: dark (`#78716c` / `stm-warm-800`) on CRITERIA pastels per ADR-0004.
- CTA buttons: use `stm-sepia-500/600` or `stm-teal-600` with white text (verified WCAG AA minimum 4.5:1).
- Link underlines: `stm-teal-600` or `stm-warm-600` with transparent underline offset per main site pattern.
- Focus outlines: `ring-2 ring-stm-teal-500` or equivalent visible ring; no reliance on color alone.

## Consequences

- Visual continuity between main-site marketing and data-site platform, reducing cognitive load for users transitioning between ecosystems.
- Homepage and navigation adopt sophisticated composition patterns (angled sections, hero gradients, visual rhythm) while data views maintain clarity and semantic color integrity.
- Maintenance surfaces a single token mapping reference; designers/devs quickly understand which main-site feature maps to which local equivalent.
- Addition of geometric motif utility classes (`.angled-panel`, `.cut-corner`, `.diagonal-stack`, etc.) increases CSS payload slightly but centralizes visual consistency.
- No CRM entity color changes; graph, map, and model page semantics remain stable and unambiguous.
- No introduction of rounded corners; visual language stays aligned with sharp, structured aesthetic.

## Related ADRs

- ADR-0004: Unified Color System (CRITERIA colors, entity badges, surface palette) — **not overridden** by this decision.

## References

- Main-site globals.css: https://github.com/SurinameTimeMachine/suriname-time-machine-citizen-science/blob/main/app/globals.css
- Main-site layout.tsx: https://github.com/SurinameTimeMachine/suriname-time-machine-citizen-science/blob/main/app/layout.tsx
- CRITERIA color scheme: https://github.com/chin-rcip/CRITERIA
