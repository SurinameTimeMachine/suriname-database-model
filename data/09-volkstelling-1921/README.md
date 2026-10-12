# 1921 Suriname Census Dataset (`09-volkstelling-1921`)

This directory contains the transcribed population census records from the **1921 Suriname Population Census (Volkstelling 1921)**.

## Source File Inventory

| File | Size | Total Rows | Records | Encoding |
| :--- | :--- | :--- | :--- | :--- |
| `NT00445_VT1921_Aangevuld_kolomnamen.csv` | 30.3 MB | 109,985 | **109,984** | UTF-8 with BOM, CRLF |

> **Format Warning (Double CSV Quoting):** The file is double-encoded with a nested quoting wrapper (`"""id"",""achternaam""..."""`). Standard CSV tools or `file(1)` may misidentify this file. Parsers must perform a **two-pass CSV decode** or explicit quote unescaping before reading columns.

---

## Data Schema & Record Model

### 1. Schema Overview (11 Declared Headers + 1 Unlabeled UUID)

| Header Name | Type / Example | Fill Rate | Description |
| :--- | :--- | :--- | :--- |
| `id` | `1`, `2` ... | 100% | Sequential file-local identifier |
| `achternaam` | String (`Jansen`, `Kromodimedjo`) | ~100% | Primary surname |
| `initialen_of_contractnr` | String (`J.A.` or `UU/1234/z/v`) | ~100% | Initials OR Indentured Labor Contract Number |
| `geboortejaar` | Integer (`1885`, `1910`, `?`) | ~98.8% | Year of birth (contains placeholders & invalid years) |
| `naam district` | String (`Paramaribo`, `Commewijne`) | 100% | District name |
| `kringnummer` | Integer/String (`1`, `?`) | ~98.4% | Census precinct/district sub-zone |
| `lijstnummer` | Integer/String (`12`, `?`) | ~97.7% | Registration list number (Household container) |
| `adres` | String (`Gravenstraat`, `Pl. Marienburg`)| ~100% | Street address, plantation, or location string |
| `scan_klapper` | URL | ~100% | Direct link to index card scan |
| `scan_registratielijst` | URL | ~97.3% | Direct link to full registration sheet scan |
| `opmerking_registratielijst`| String | ~2.7% | Miscellaneous remarks / archival notes |
| *(Unlabeled 12th column)* | UUID string | 100% | **Global source-record key** (`stm-census1921/<uuid>`) |

### 2. Record Model Architecture
- **Single Row per Person:** Unlike the 1950 census (which uses front/back card row pairs), **each row in 1921 represents one source-bound PICO PersonObservation**.
- **Registration-List Grouping:** Records are structurally grouped by the tuple: `(naam district, kringnummer, lijstnummer)`.
  - Yields **22,474 distinct registration-list groups** (median size: 3 persons; max: 1,132 persons in institutional/barracks lists).
  - These tuples represent registration-list groups only. They should only be classified as households if supported by source context (e.g. shared address or explicit household markers), not by list co-membership alone.
- **No Direct Kinship Attributes:** Parent/spouse relationships are not explicitly declared in columns, but can be inferred through shared registration-list groups and surnames.

---

## Data Quality & Normalization Rules

### 1. Indentured Labor Contracts (`initialen_of_contractnr`)
- Approximately **39,717 rows** contain contract numbers containing `/` and category codes (`UU`, `KK`, `JJ`, `VV`, `AC`) with `z/v` (zonder/voorvoegsel) notations.
- **Transformation Action:** Ingestion logic must split this column into:
  - Clean initials (e.g., `A.B.`)
  - Labor contract identifier (e.g. `contract_number: 'UU/1234'`) for Asian indentured immigrants (Hindoestani / Javanese / Chinese laborers).

### 2. Birth Years (`geboortejaar`)
- Contains `?` (1,318 rows), `-` (1 row), and out-of-range years (`1806`, `1842`, `1993`, `1999`).
- **Transformation Action:** Derive a clean integer `birth_year` and assign a quality flag (`valid` vs `questionable_range`). Do not fail the record on invalid dates.

### 3. Address Resolution (`adres`)
- The 905 unique address strings mix street names (~29.8k rows matching 1828–1847 street vocabulary) and plantation names (~32.8k rows matching plantation lists).
- **Transformation Action:** Route unknown/unmapped addresses into the shared street $\rightarrow$ plantation location resolution ladder (`docs/ingestion/civil-location-matching-workflow.md`).

---

## Recommended Ingestion Pipeline Strategy

1. **Decoder:** Implement two-pass CSV decoding in `app/scripts/transform-volkstelling-1921.ts` to cleanly unescape double-quoted lines.
2. **Entity Generation:** Mint individual source-bound PICO PersonObservations keyed on the 12th UUID column (`stm-census1921/<uuid>`).
3. **Registration-List Aggregation:** Create group entities linked by `(naam district, kringnummer, lijstnummer)`; classify as households only where source context supports it.
4. **Contract Extract:** Parse Asian labor contract numbers into explicit record metadata.
5. **Search Indexing:** Register person observations under search category `census-1921-resident`.