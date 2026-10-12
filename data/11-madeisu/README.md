# Madeisu Contract Laborers Dataset (`11-madeisu`)

## Data Provenance & Attribution

- **Source Provider:** Generously provided by **Stichting Madeisu** ([https://www.madeisu.org/](https://www.madeisu.org/)).
- **Attribution Requirement:** All usage, ingestion, and presentation of this dataset on the Suriname Time Machine platform must explicitly attribute **Stichting Madeisu** as the original record provider, including direct links to their official website ([https://www.madeisu.org/](https://www.madeisu.org/)).
- **Licensing & Usage:** Usage and ingestion of this dataset is restricted to explicitly confirmed terms granted by **Stichting Madeisu**. Do not assume any broader license; confirm terms with the provider before any public reuse or redistribution.

---

## Source File Inventory

| File Name | File Size | Record Count | Description |
| :--- | :--- | :--- | :--- |
| `Brondocument historisch register- DetailsContractarbeiders.xlsx` | 46 KB | **505 records** | Person-level contract records (16 columns) |
| `Brondocument historisch register - Plantages.xlsx` | 10.5 KB | **25 records** | Plantation aggregate placements & Geo coordinates (7 columns) |
| `Plantagekaart contractarbeiders 1853-1864.png` | 1.9 MB | Image (1267×863) | Historical placement map of contract laborers |
| `*:Zone.Identifier` | 25 B | — | *Windows ADS junk files (excluded from ingestion)* |

> **Tech Note:** Both Excel workbooks are single-sheet XLSX files (`sheet1.xml` + `sharedStrings.xml`) and can be read directly via standard XML/zip utilities without requiring external heavy dependencies.

---

## Data Schema & Record Architecture

### 1. Person Contract Records (`Brondocument historisch register- DetailsContractarbeiders.xlsx`) — 505 Records

| Column | Example | Description |
| :--- | :--- | :--- |
| `ID` | `1`, `2` | Unique sequential primary key (100% unique) |
| `Voornaam` | `Manuel` | First name |
| `Achternaam` | `Gonsalves` | Surname |
| `Naam` | `Manuel Gonsalves` | Full composite name (121 rows differ from `Voornaam` + `Achternaam`) |
| `Sex` | `M`, `V`, `F` | Gender code (`V` and `F` both represent Female; requires normalization) |
| `Leeftijd` | `24`, `??` | Age at contract (55% marked with `??` placeholders) |
| `Boot` | `Libania & Adelaida` | Transport ship name (5 unique ships total) |
| `Month-Year` | `08-1853` | Arrival / Contract month and year |
| `Gecontracteerd door` | `A.S. Binda` | Contracting agent / sponsor |
| `Plantage` | `Guineesche Vriendschap` | Target plantation name |
| `District` | `Commewijne` | Target district |
| `Start contract` | `1853` | Contract start year |
| `Eind contract` | `1858` | Contract end year |
| `Index` | `101` | Record index number |
| `Bijzonderheden` | `Kind van Maria` | Free text remarks (contains implicit kinship relations) |

### 2. Plantation Placements (`Brondocument historisch register - Plantages.xlsx`) — 25 Aggregates
- **Aggregate Counts:** Contains `Locatie`, `Geo(lat, lon)`, `Eigenaar`, `Vrouw`, `Man`, `Type`, and `Boot`.
- Sum of `Vrouw` + `Man` = 506 persons vs. 505 transcribed individuals in the person sheet (1 row delta). The `Brondocument historisch register - Plantages.xlsx` sheet is a derived roll-up summary, not an independent person source.

### 3. Ships / Voyages (Implicit Entity)
- 5 distinct ships: *Libania & Adelaida*, *Tres Amigos*, *Maravilha*, *Mathilda*, and *Rothsay*.

---

## Data Quality & Normalization Rules

1. **Gender Normalization:** Map `M` $\rightarrow$ `Male`, and both `V` and `F` $\rightarrow$ `Female`.
2. **Plantation Name Resolution:** Cross-file OCR drift exists between files (e.g. `Dr . J.R. Arrias` vs `Dr. J.R. Arrias`, `Guineesche Vriendschap` vs `Guinesche Vriendschap`, `St . Barbara` vs `St. Barbara`). Resolve all plantation strings against the central Suriname Time Machine place/plantation thesaurus (`docs/ingestion/civil-location-matching-workflow.md`).
3. **Kinship Extraction:** Parse free-text relationships in `Bijzonderheden` (e.g. `Kind van ...`, `Zuster van ...`) using deterministic regex matchers into explicit family edge observations.
4. **Age & Placeholder Cleanup:** Treat `??`, `Onbekend`, and float artifacts (e.g. `455.0`) as unknown/null fields with appropriate quality flags.

---

## Recommended Ingestion Strategy

1. **Mint Source Observations (PICO PersonObservation):** Generate individual source-bound PICO PersonObservation records for contract laborers keyed on `stm-madeisu/<ID>`.
2. **Link Ships & Voyages:** Create arrival voyage event entities linking group members arriving on the same vessel and date.
3. **Link Plantations:** Link laborer placement observations to resolved plantation entities in `person-search-index.json`.
4. **Display Attribution:** Ensure all UI detail cards rendering Madeisu records explicitly feature the **Stichting Madeisu** credit line and link ([https://www.madeisu.org/](https://www.madeisu.org/)).