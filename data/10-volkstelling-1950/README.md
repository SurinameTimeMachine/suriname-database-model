# 1950 Suriname Census Dataset (`10-volkstelling-1950`)

This directory contains transcribed records from the **1950 Suriname Population Census (Volkstelling 1950)** (National Archives access `2.10.19.02`).

## Source Files Overview

| File | Size | Records | Unique Inventories | Image Format |
| :--- | :--- | :--- | :--- | :--- |
| `vt1950.txt` | 19.2 MB | 86,180 | 130 (range 1–511) | `.jpg` |
| `vt1950_2.txt` | 3.3 MB | 14,626 | 22 (range 26–418) | `.tif` |
| **Combined Total** | **22.5 MB** | **100,806** | **152 inventories** | — |

---

## Key Data Architecture & Findings

### 1. File Relationship: Supplementary Batches
- `vt1950_2.txt` is a **pure supplementary batch** filling inventory gaps missing from `vt1950.txt`.
- **Zero Overlap:** Proved disjoint across all primary keys (`Bestandsnaam`, `URL`, `Toegang + Inventarisnummer + Volgnummer`).
- Both files share an identical 21-column TSV schema.
- Local `Id` columns restart at `1` in both files and must be discarded in favor of global composite keys: `(Toegang, Inventarisnummer, Volgnummer)`.

### 2. Paired Record Model (Cards: Front & Back)
The source records represent physical census cards where **one person spans two consecutive rows** (`Volgnummer` pairs):
- **Odd Row (`Volgnummer` N):** Card Front — Main person attributes (`Voornamen`, `Achternaam_1921`, `Achternaam_1950`, `Woonplaats`, `Woondistrict`, `Geboortedatum`).
- **Even Row (`Volgnummer` N+1):** Card Back — Kinship and relationships (`Achternaam_Vader`, `Voornamen_Vader`, `Achternaam_Moeder`, `Voornamen_Moeder`, `Achternaam_Partner`, `Huwelijksdatum`).

> **Transformation Rule:** Ingestion scripts **must pair consecutive rows scoped within the same `Toegang` and `Inventarisnummer`** during transformation. Pairing across inventory boundaries would corrupt records. Processing rows independently would split individuals and orphan kinship data.

---

## Ingestion & Pipeline Requirements

When transforming this dataset for the Suriname Time Machine pipeline:
1. **Union & Assertion:** Concatenate `vt1950.txt` and `vt1950_2.txt`. Assert zero overlap on `(Inventarisnummer, Volgnummer)`.
2. **Row Pairing:** Merge row pairs $N$ (subject) and $N+1$ (kinship) into a single unified observation model.
3. **Date Parsing:** Handle partial dates (e.g., `??-??-1900`) by extracting `year` + assigning a precision flag (`precision: 'year'`) rather than failing full date validation.
4. **District Normalization:** Clean OCR noise in `Woondistrict` fields (e.g. `'I '`, `'Ì'`, `'l'`, `'!'`).