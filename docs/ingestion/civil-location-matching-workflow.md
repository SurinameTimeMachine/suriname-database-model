# Civil Location Matching Workflow (living guideline)

Dual-track, human-in-the-loop pipeline for resolving unmapped civil-record
locations (births 1828–1921, deaths 1845–1915). This document governs the
pipeline; update it whenever matching rules, gates, or file conventions change.

## 1. Core architecture

**Track A — Direct ingestion (high confidence, deterministic).** Matches that
need no human review land directly in the live pipeline:

- Exact hit on an existing thesaurus key, street-standardization alias, or
  concordance key.
- Relative-phrase resolution (`in voormeld huis`, `aldaar`, `alhier`) that
  inherits the primary subject's already-approved location
  (`derived-inheritance` provenance).
- Fully qualified `Street W NNN` OW-exact matches (`certain` confidence).

Track A persons are eligible for `person-search-index.json` ingestion while
Track B evaluation is still underway (gated by `CIVIL_TRACK_A_ONLY=1` env flag
in the manifest generator — downstream index builders consume only
`certain`-confidence, non-derived locations by default).

**Track B — Iterative human-in-the-loop evaluation.** Every other unique
`(normalized_location_string, observation_year)` tuple goes to a versioned
evaluation manifest for manual scoring
(`data/evaluation/civil-locations-eval-vN.json`), with machine-proposed
candidates and reasons. Humans set `manual_review.status` to
`pending | approved | rejected | custom_override`, add `approved_place_id`
and notes; the next generator run merges those decisions back in and only
proposes candidates for still-pending tuples.

## 2. Safety & data preservation rules (STRICT)

1. **Write-protection:** generator scripts MUST NEVER overwrite
   `data/evaluation/civil-locations-eval-vN.json` manual_review fields or
   `data/civil-location-manual-overrides.json` once created. New runs may add
   tuples and refresh machine candidate fields only.
2. **Idempotent merging:** on every run, load existing manifests + manual
   overrides first; match new tuples against them by `tuple_id`; preserve
   `status`, `approved_place_id`, and `notes` verbatim.
3. **Versioned output runs:** never mutate a published manifest in place.
   New matching logic bumps the version (`-v2`, …); the old file stays as
   audit trail. The `latest` symlink/pointer (if any) moves only after human
   sign-off.
4. **No silent promotion:** a tuple enters Track A only via an explicit
   `approved` status or a deterministic exact-match rule documented below.
   Raising a match score never auto-approves.

## 3. Multi-century & missing-coordinates strategy

- **Post-1885 street names** (e.g. `Hofstraat`, `Groote Dwarsstraat` — absent
  from the 1828–1847 ward ladder): resolve via the street-standardization
  table + Concordans Paramaribo keys first; unmatched modern streets get a
  street-level record with `precision: 'street'` and a
  `coordinates_pending: true` flag rather than being dropped.
- **20th-century locations without exact historical GIS coordinates:**
  fallback spatial anchoring in this order — street-segment centroid >
  parent ward anchor > district centroid — each with explicit
  `precision: 'street' | 'derived' | 'district'` so persons remain searchable
  while exact points are pending. Anchors MUST be flagged, never presented
  as exact coordinates.
- **Brt codes** (`D 806`): pre-1836 buurt system; keep as `street-address`
  precision with `probable` confidence until the buurt-code leg is validated.

## 4. Tuple model & candidate reasons

- Normalization: NFKD, strip diacritics, lowercase, collapse whitespace,
  strip parenthetical qualifiers. `tuple_id` = `<normalized>_<year>`
  (non-alphanumerics → `_`).
- Year = certificate `cert_date` year (event dates are partial); `year_null`
  bucket when unparseable.
- Candidate `match_reason` vocabulary: `thesaurus_exact`,
  `street_alias_exact`, `concordance_exact`, `street_name_only`,
  `plantation_normalized`, `district_keyword`, `relative_phrase`,
  `fuzzy_jaro_winkler` (score only, never Track A).
- Track A gate (ALL required): reason in
  (`thesaurus_exact`, `street_alias_exact`, `concordance_exact`,
  `relative_phrase`), confidence `certain`, no parenthetical qualifier
  stripped, year regime compatible (OW ≤1847, NW/Brt flagged per era).

## 5. Workflow loop

1. `pnpm transform:civil-records` → raw `unmapped-civil-locations.json`.
2. `pnpm manifest:civil-locations` → Track A/B split + versioned manifest.
3. Humans review Track B manifest → set statuses / overrides.
4. Re-run generator → pending tuples shrink; approved tuples join Track A.
5. Downstream indexes consume Track A + approved overrides only.
6. Refine matching logic → bump manifest version → repeat.

## 6. File registry

| File | Role | Write rule |
|---|---|---|
| `data/unmapped-civil-locations.json` | raw transform output | regenerated freely |
| `data/evaluation/civil-locations-eval-vN.json` | versioned Track B manifest | append-only for machine fields; human fields preserved |
| `data/civil-location-manual-overrides.json` | cross-version human decisions | human-only + generator merge source; never overwritten |
| `data/civil-locations-track-a.json` | Track A gate output | regenerated; consumed by index builders |
