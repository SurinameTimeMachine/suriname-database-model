# Contract Migration Datasets (`12-migratie-datasets`)

## Data Governance, Licensing & Access Notice

> ⚠️ **RESTRICTED DATASET — DO NOT COMMIT RAW DATA TO GIT** (Until license resolved)
> 
> Formal licensing and public reuse agreements for these raw migration registers are currently being finalized with the rightsholders (including Prof. dr. Maurits Hassankhan / collaborating institutions).
> 
> - **Repository Policy:** All raw data files in this folder are strictly excluded from public Git tracking via `.gitignore`.
> - **Permitted Scope:** Internal database modeling, record pairing, entity resolution, and local search-index pipeline processing only. Public redistribution of raw registers is strictly prohibited.
> - **Licensing Model (Pending):** Re-use is conducted under an assumed Non-Commercial, Share-Alike, with Attribution framework (CC BY-NC-SA style).

---

## Archival Provenance & Primary Source Portals

This dataset integrates genealogical and contract labor migration registers sourced from and published by the national archival institutions of Suriname and the Netherlands:

### Primary Archival Portals — Nationaal Archief Suriname (NAS)
1. **Hindostani Contract Laborers (1873–1916):** [NAS Genealogie Hindostanen](https://nationaalarchief.sr/onderzoeken/alle-genealogie/genealogie-hindostanen-contractarbeiders/persons)
2. **Chinese Contract Laborers (1858–1874):** [NAS Genealogie Chinezen](https://nationaalarchief.sr/onderzoeken/alle-genealogie/genealogie-chinezen-contractarbeiders/persons)
3. **Javanese Contract Laborers (1890–1930):** [NAS Genealogie Javanen](https://nationaalarchief.sr/onderzoeken/alle-genealogie/genealogie-javanen-contractarbeiders/persons)

### Secondary Search Guides — Nationaal Archief Nederland (NAN)
1. **Hindostaanse contractarbeiders in Suriname (1873–1916):** [NAN Zoekhulp Hindostanen](https://www.nationaalarchief.nl/onderzoeken/zoekhulpen/hindostaanse-contractarbeiders-in-suriname-1873-1916)
2. **Chinese contractarbeiders in Suriname (1858–1874):** [NAN Zoekhulp Chinezen](https://www.nationaalarchief.nl/onderzoeken/zoekhulpen/chinese-contractarbeiders-in-suriname-1858-1874)
3. **Javaanse contractarbeiders in Suriname (1890–1930):** [NAN Zoekhulp Javanen](https://www.nationaalarchief.nl/onderzoeken/zoekhulpen/javaanse-contractarbeiders-in-suriname-1890-1930)

---

## Source File Inventory

| File Name | File Size | Record Count | Encoding / Format | Content |
| :--- | :--- | :--- | :--- | :--- |
| `NT00345_hindostanen.csv` | 21.2 MiB | **28,775** | UTF-8 with BOM, CRLF, double-quoted CSV | Hindostani contract labourers (1873–1916) |
| `NT00347_chinezen.csv` | 1.0 MiB | **2,017** | UTF-8 with BOM, CRLF, double-quoted CSV | Chinese contract labourers (1853–1874) |
| `Jaarletters contractarbeiders.xlsx` | 10.5 KB | 75 rows | XLSX, 1 sheet | Year $\rightarrow$ contract-letter lookup code table |
| `Voorstel aanpassingen database...txt` | 3.9 KB | — | Extended-ASCII | Design proposal: arrival snapshot DB + life-events DB |
| `20201208 Antwoorden Maurits...txt` | 6.6 KB | — | ISO-8859 / CRLF | Q&A on register scope, marriages/children completeness |
| `HDS Achtergrondinfo...txt` | 56.6 KB | — | UTF-8 | HDS background, field legend (38 fields + memo), contract-letter system |

---

## Data Schema & Record Model

### 1. Schema Overview (Headerless Registry CSVs)
Both CSVs are **headerless** (row 0 contains data). Columns map directly to the official HDS field legend (01–39 + memo + flags + UUID tail).

* **Hindostanen (45 base columns, 226 ragged rows with 46–95 cols due to memo newlines):**
  - `Col 0`: Row `Id` (file-local, 1–28775)
  - `Col 1`: `contractnummer` (`AA/1` format)
  - `Col 2–3`: `naam` / `voornaam`
  - `Col 4`: Ship name (121 unique, e.g., *Ganges*, *Lalla Rookh*, *Mersey II*)
  - `Col 6 & 13`: `geboorteland` & `godsdienst/kaste` (1,737 unique variants)
  - `Col 14–16`: Origin location triples (district/police post/village)
  - `Col 18–19 & 21–22`: Departure & Arrival dates (Dual Dutch + ISO pairs)
  - `Col 24–25`: Planter / Plantation (1,454 unique plantation strings)
  - `Col 31–38`: Renewal / Return date cycles
  - `Col 40`: **Memo** (73% filled; contains multi-generation births, agenda-linked deaths, CVO notes)
  - `Col 42`: **Kinship references** (34% filled, e.g. `dochter van JJ/615;JJ/616`, `vrouw van F/77`)
  - `Col 44`: UUID v4 string (stable primary key)

* **Chinezen (Strict 44 columns, 0 ragged rows):**
  - Same registry shape with Chinese-specific fields: `monsternummer` (col 2), religion (`leer van confucius`, col 16), origin (`Wijtjoe`, `Hongkong`, `Macao`, cols 17–18), register code (`864D`, col 40), memo (79.6%), and UUID (col 43).

### 2. Entity Architecture & Key Findings
- **One Row per Immigrant:** Single-row entity model (no card front/back pairs).
- **Entities:** `ContractLabourer` $\rightarrow$ `Voyage` $\rightarrow$ `Placement` $\rightarrow$ `Kinship` / `LifeEvents`.
- **Zero Cross-File Overlap:** Contract-number overlap between Hindostani and Chinese files is **0** (disjoint contract-letter ranges). Ingest as separate batches, **never join**.

---

## Technical Data Quality & Ingestion Rules

1. **Regex UUID Extraction:** 226 Hindostani rows exceed 45 columns due to embedded newlines in the `memo` field. Parsers must locate the UUID via regex (`[0-9a-f-]{36}`) rather than relying on strict column index positioning.
2. **Date Duality Handling:** Ingest the ISO date (`yyyy-mm-dd`) as primary and keep the Dutch format (`d-m-yyyy`) as raw text. Partial dates (e.g. `??-??-1900`, `1866-00-00`) must be tagged with a precision flag instead of cast to full timestamps.
3. **Contract Number Normalization:** Contract numbers appear both as `AA/137` and `137/AA`. Normalize both directions before resolving kinship edges.
4. **Attribution Display:** All search results and UI cards rendering records from these migration datasets must display explicit attribution to **Nationaal Archief Suriname (NAS)** and **Nationaal Archief Nederland (NAN)**, alongside researcher credit to Prof. dr. Maurits Hassankhan e.a.