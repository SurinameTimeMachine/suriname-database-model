# Civil Records Ingestion Plan (v1 — observational)

Sources: Death Certificates 1845–1915 v1.0 (75,542 CSV rows) and Birth
Certificates 1828–1921 v1.0 (63,240 CSV rows). Ontology:
`docs/modeling/enslaved-pico-guidelines.md` (Enslaved-PiCo, Mourits et al. 2026).

## 1. v1 strategy: strictly observational

- Every person-role cell becomes one `picom:PersonObservation`. No
  `E21_Person` merges, no cross-certificate identity resolution.
- URI scheme: `civil-observation/<recordId>-<role>` (recordId = CSV `id`,
  role = `deceased | child | mother | father | informant | witness1 |
  witness2 | parent1 | parent2 | spouse1..4`). Deterministic, re-runnable.
- Observation reasons (`enslaved:P30`): Death rows → `Death` (+ `Birth` where
  `dec_birthplace` present); Birth rows → `Birth`; emancipation-era name
  changes follow the two-observation + `sdo:sameAs` rule (§3.6 of guidelines).
- Status (`enslaved:P33`): assert `EnslavedPerson` only when stated; 1863+
  civil persons default to Free Person only when the record implies it
  (occupation/civil status present), otherwise omit status.

## 2. Role mapping

| CSV group | Observation role | Kinship edges (direct properties) |
|---|---|---|
| Death `dec_*` | `deceased` | `sdo:spouse` → spouse1..4, `sdo:parent` → parent1/2 |
| Death `parent_*_1/2` | `parent` | `sdo:children` → deceased |
| Death `spouse_*_1..4` | `spouse` | `sdo:spouse` → deceased |
| Death `inf_*` | `informant` | `iisg:isLegallyRepresentedBy`-style link only when `inf_relation` states representation (father, guardian); plain `bekende` → no edge, role badge only |
| Death `witn_*_1/2` | `witness` | none |
| Birth `child_*` | `child` | `sdo:parent` → mother, father |
| Birth `moth_*` | `mother` | `sdo:children` → child |
| Birth `fath_*` | `father` | `sdo:children` → child (incl. late `erkenning:` recognitions as second observation edge) |
| Birth `inf_*` | `informant` | none (role badge; `inf_pres` records presence at birth) |
| Birth `witn_*_1/2` | `witness` | none |

Name fields: `sdo:givenName` (fname), PNV prefix particle, `sdo:familyName`
(sname), `sdo:name` full join. `$` sigil kept verbatim in raw text.
Occupation → `sdo:hasOccupation`; sex → `sdo:gender`; age text kept raw
(`dec_age` free text like `54 jaren en 9 maanden`) with `enslaved:hasAgeCategory`
only when mappable (infant/child/adult).

## 3. Provenance on every edge

All kinship edges, derived locations, and deterministic cross-links carry:

```json
{ "method": "<see below>", "rawText": "<verbatim fragment>", "confidence": "certain|probable|unresolved" }
```

Methods: `record-co-occurrence` (same certificate), `deterministic-note-parse`
(`overlijden:`/`erkenning:`), `address-ladder-ow|nw|brt`,
`plantation-normalize`, `derived-inheritance`, `signature-flag`.

## 4. Address resolution

- **OW/NW/Brt ladder** (reuse `link-ward-registers-to-addresses.ts`
  normalizers): `Street W NNN` → try OW-exact → OW-without-buurt →
  OW-without-suffix → NW variants; bare `D 806`-style codes → Brt leg.
  Confidence `certain` on exact, `probable` on fallback, `unresolved` + entry
  in `data/unmapped-civil-locations.json` otherwise.
- **Plantations/districts**: normalize via PSUR anchor (strip `plantage`,
  NFKD, lowercase) → `precision: "plantation"` on match;
  district-only (`in dit district`, `post Coronie`) → `precision: "district"`;
  ships/rivers → `precision: "unresolved"` + unmapped entry.
- **Derivation**: child/informant/witness without own address inherits the
  primary subject's (deceased / mother) resolved location, flagged
  `derivedFrom: "<obsId>"`, `method: "derived-inheritance"`, confidence
  capped at `probable`.
- **Unmapped export**: `data/unmapped-civil-locations.json` — unique raw
  strings with counts, example record IDs, and field origin; the todo list
  for new place creation.

## 5. Deterministic cross-links

- `overlijden:` notes (12,468 birth rows): parse date + folio/page →
  edge `birth-observation → death-observation` (matched on date + name
  where possible, else note-level edge with `unresolved` target),
  `method: "deterministic-note-parse"`, raw note verbatim.
- `erkenning:`/`wettiging:` notes (19,929 rows): father-recognition edge
  `father → child` with event date; marriage-legitimation flagged
  `spouse` edge between named parents.
- v1 does not resolve note targets to death-certificate observation IDs
  unless date + name match uniquely; all others stay note-level edges.

## 6. Literacy tracking

`inf_sig` / `witn_sig_*`: `signed` → `literate: true`;
`not signed, illiteracy` → `literate: false`; `sig_other` free text kept raw.
Aggregated per-record as `illiteracyFlags` for UI display.

## 7. Outputs & pipeline wiring

- `app/scripts/transform-civil-records.ts` exports `transformCivilRecords()`;
  standalone run prints counts + top unmapped locations.
- Artifacts (gitignored build outputs, same convention as ward links):
  `data/civil-records-observations.json` (observations + edges),
  `data/unmapped-civil-locations.json` (todo list).
- `pnpm transform:civil-records` script; full `pnpm pipeline` ordering:
  after `link-ward-registers-to-addresses.ts` (reuses its normalizers),
  before `prepare-data.ts` (future: persons-by-org enrichment — v1 only
  validates counts, no downstream consumption yet).
- Validation: row parity (75,542 + 63,240 inputs), observation/edge counts,
  unmapped uniqueness, spot-check `overlijden:` edges, `npx tsc --noEmit`,
  `pnpm build`.
