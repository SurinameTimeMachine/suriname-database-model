# Provenance Chain Checklist (Step-by-step)

Purpose: define a shared way to measure “how long” a claim’s evidence chain is, without final link priorities. This helps with scientific traceability and later link evaluation.

---

## Step 1: Define provenance depth (metric)

**Provenance depth** = the number of hops from a claim to its ultimate source artifacts.

Count each hop between entities as 1 (e.g., claim → record = 1, record → data source = 1, map feature → map = 1).

**Depth bands:**

- **D1 (direct)**: claim links to a single source record.
- **D2 (documented)**: claim links to record → data source.
- **D3 (contextual)**: claim links to record → data source → holding archive / map.
- **D4+ (interpretive)**: claim requires cross-source linking or map interpretation.

**Why now:** this metric lets us compare chain lengths even before we decide which links are definitive.

---

## Step 2: “Longest chain” checklist (qualitative)

For any claim, record:

1. **Claim type** (person, place, organization, event).
2. **Primary evidence** (record or map feature).
3. **Supporting evidence** (other records, maps, annotations).
4. **Source provenance** (data source, archive, publication details).
5. **Linking assumptions** (name matching, temporal overlap, spatial overlap).
6. **Known uncertainty** (conflict, missing fields, ambiguous names).

---

## Step 3: Chain templates for hard questions

Use these templates as “maximum” paths. They can be shorter in practice.

### H03 — Ancestors of person X

- Person claim → vital record role (child/mother/father)
- Vital record → data source (birth/death register)
- Person ↔ person link (name/date/parent linkage)
- Data source → archive/holding metadata

### H06 — What can we say about person X

- Person claim → multiple records (birth/death/ward/enslavement)
- Each record → data source
- Person ↔ organization (plantation) via role/event
- Organization → location (place claim)
- Location → map depiction (when available)

### H09 — Provenance of claim X

- Claim → evidence record or map feature
- Evidence → data source
- Data source → archive/holding
- If map-based: map feature → map → data source
- If cross-source: link rationale recorded as “linking assumption”

---

## Step 4: Defer interpretation layer until link evaluation

We will **not** formalize `interpretation` records until we start active link evaluation. For now, capture assumptions and uncertainties in the checklist fields above. This keeps the model light but preserves scientific traceability.

---

## Step 5: Minimal tracking fields to collect now

- `claim_text`
- `claim_type`
- `primary_evidence_id`
- `supporting_evidence_ids`
- `provenance_depth`
- `linking_assumptions`
- `uncertainty_notes`

---

## Next use

- Use this checklist to log 2–3 example claims per dataset.
- Identify the **longest chain** by counting depth and number of cross-source links.
- Add interpretation records later when link evaluation begins.
