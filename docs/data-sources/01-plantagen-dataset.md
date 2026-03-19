# Suriname Plantagen Dataset (Slave Registers)

> **Version:** 1.1  
> **Citation:** [@RosenbaumFeldbrugge2024-plantagen]  
> **License:** CC BY-SA 4.0  
> **DOI:** [10.17026/SS/YOFINK](https://hdl.handle.net/10622/YOFINK)

---

## Dataset Overview

| Property                | Values                               |
| ----------------------- | ----------------------------------- |
| **Primary Entity**      | Plantations (organizations)         |
| **Time Coverage**       | 1700–1863 (slavery period)          |
| **Data Rows**           | 375                                 |
| **Data Columns**        | 15                                  |
| **File Format**         | CSV                                 |
| **Geographic Coverage** | Suriname (all plantation districts) |

### Description

This dataset is derived from the "Suriname Slave and Emancipation Registers Dataset Version 1.1" dataset and contains all the plantations that appear in the Slave Registers as legal entities owning enslaved persons. In the original Slave Register dataset, plantations do not have a unique ID (although the plantation names are standardized). In this dataset, each plantation has its own unique ID (PSURxxxx). The Suriname Plantation Dataset provides background information on the plantations whose enslaved populations can be found in the Suriname slave registers and provides information on the completeness of the data present for each plantation in the Suriname Slave Registers database. Legally, plantations has a specific status with regards to owning enslaved, that was different from private owners -- e.g. there were more restrictions on the sale of enslaved persons by plantations.

### Purpose

This dataset provides a **master list of Suriname plantations as legal entities that owned enslaved persons between 1830-1863** with:

- Unique identifiers (PSUR IDs)
- plantations are not seen as locations but as organisations (legal entities)
- Enslaved population counts across 4 time series of the Slave registers
- remarks about transfer of the slave forces to/from other plantations
- Whether the part of the register series where the plantation was mentioned is missing or complete
- Product information in 1846 and 1859
- District classification at different years (1842, 1855)
- General remarks and historical notes

---

## Field Definitions

Based on the source documentation, the dataset contains these columns:

### Identification

| Field             | Type        | Description                          | Example    | Crucial for Linking | Primary Information |
| ----------------- | ----------- | ------------------------------------ | ---------- | ------------------- | ------------------- |
| `ID_plantation`   | text/string | PSUR identifier (unique key)         | `PSUR0001` |             Yes: to Almanakken dataset      |         NOTE: it would be useful to add a linking table that adds the wikidata Q-ids to this dataset (to which our own plantation permanent ids will be added). A TODO for Thunnis            |
| `Name_plantation` | text/string | Primary/standardized plantation name | `Aasvogel` |         Yes: to Slave registers           |          Yes although the name can differ from labels in other sources. So: nice to have           |

### Enslaved Population Series

The dataset tracks enslaved population across **4 temporal series**:

| Field                    | Type    | Description                           | Notes      | Crucial for Linking | Primary Information |
| ------------------------ | ------- | ------------------------------------- | ---------- | ------------------- | ------------------- |
| `Serie1_number_enslaved` | integer | Number of enslaved people in Series 1 | ~1830–1840 |                     |          Yes, even though this amount can be derived directly from the Slave Registers, this would require extra calculations           |
| `Serie2_number_enslaved` | integer | Number of enslaved people in Series 2 | ~1841–1850 |                     |           Y           |
| `Serie3_number_enslaved` | integer | Number of enslaved people in Series 3 | ~1851–1860 |                     |          Y            |
| `Serie4_number_enslaved` | integer | Number of enslaved people in Series 4 | ~1861–1863 |                     |          Y            |

### Series Status

Each series has a status indicating data completeness:

| Field           | Type        | Description              | Values                                | Crucial for Linking | Primary Information |
| --------------- | ----------- | ------------------------ | ------------------------------------- | ------------------- | ------------------- |
| `Serie1_Status` | text/string | Completeness of Series 1 | `complete`, `missing`, `non existent` |                     |        Nice to have but not crucial. It explains the availability of the source Slave registers for a particular plantation             |
| `Serie2_Status` | text/string | Completeness of Series 2 | `complete`, `missing`, `non existent` |                     |         Nice to have            |
| `Serie3_Status` | text/string | Completeness of Series 3 | `complete`, `missing`, `non existent` |                     |         Nice to have            |
| `Serie4_Status` | text/string | Completeness of Series 4 | `complete`, `missing`, `non existent` |                     |          Nice to have           |

### Temporal Information

| Field           | Type        | Description                      | Notes | Crucial for Linking | Primary Information |
| --------------- | ----------- | -------------------------------- | ----- | ------------------- | ------------------- |
| `StartYear`     | integer     | Start year of plantation records |       |                     |         Yes: useful information to include if we want a time slider etc. So this would indicate from which year the plantation occurs in the Slave registers           |
| `EndYear`       | integer     | End year of plantation records   |       |                     |          Yes: until this year the plantation owned enslaved according to the SR           |
| `Start_remarks` | text/string | Notes about start/transfer       |       |                     |        Yes: explains from which plantation enslaved were moved - perhaps needs Dutch translation?            |
| `Start_date`    | text/string | Specific start date if known     |       |                     |                  |              |
| `End_remarks`   | text/string | Notes about end/closure          |       |                     |         Yes: explains to which plantation enslaved were moved or other reason for end date (e.g. last enslaved died)- perhaps needs Dutch translation?  It would be a small effort to manually create links to the plantations that are referred to. A todo for Thunnis?           |
| `End_date`      | text/string | Specific end date if known       |       |                     |                     |

### Geographic Information

| Field           | Type        | Description      | Notes                              | Crucial for Linking | Primary Information |
| --------------- | ----------- | ---------------- | ---------------------------------- | ------------------- | ------------------- |
| `District_1842` | text/string | District in 1842 | Historical administrative division |        not crucial but useful - but we still need a map/dataset that describes the historical districts that changed over time. To distinguish plantations with a similar name, either district or river/road on which it is located is needed             |                     |
| `District_1855` | text/string | District in 1855 | May differ from 1842               |           idem          |                     |

### Production Information

| Field          | Type        | Description           | Values                                       | Crucial for Linking | Primary Information |
| -------------- | ----------- | --------------------- | -------------------------------------------- | ------------------- | ------------------- |
| `Product_1846` | text/string | Product grown in 1846 | `sugar`, `coffee`, `cotton`, `cacao`, `food` |         not crucial            |          better to get this information straight from the Almanakken database, where it is more precise          |
| `Product_1854` | text/string | Product grown in 1854 | Same as above                                |       idem              |           idem          |
| `Product_1859` | text/string | Product grown in 1859 | Same as above                                |            idem         |              idem       |

### Additional Information

| Field             | Type        | Description                                 | Crucial for Linking | Primary Information |
| ----------------- | ----------- | ------------------------------------------- | ------------------- | ------------------- |
| `General_remarks` | text/string | Additional notes and historical information |        not crucial             |       useful information to show because it often tells more about where the enslaved workforce is actually located or if it was abandoned. It would be a small effort to manually create links to the plantations that are referred to          |

---

## Entity-Relationship Diagram

```mermaid
erDiagram
    PLANTATION {
        string ID_plantation PK "PSUR0001"
        string Name_plantation "Aasvogel"
        string District_1842 "Para"
        string District_1855 "Para"
        string Product_1846 "sugar"
        string Product_1854 "sugar"
        text General_remarks
    }

    ENSLAVED_SERIES {
        string plantation_id FK
        int series_number "1, 2, 3, 4"
        int number_enslaved "183"
        string status "complete"
    }

    TEMPORAL_INFO {
        string plantation_id FK
        int start_year
        int end_year
        text start_remarks
        text end_remarks
    }

    PLANTATION ||--o{ ENSLAVED_SERIES : "has_population_data"
    PLANTATION ||--|| TEMPORAL_INFO : "has_temporal_info"
```

---

## Data Interpretation Diagram

Based on the conceptual diagram from the source:

```mermaid
flowchart TB
    subgraph PLANTATION["Plantage (Plantation)"]
        ID["PSUR identifier<br>e.g. 'PSUR0001'"]
        NAME[name]
    end

    subgraph TEMPORAL["Temporal Information"]
        DISTRICT[District name<br>based on year]
        SERIES[Series Number]
    end

    subgraph SERIES_DATA["Series Details"]
        START[Start Year]
        END[End Year]
        COUNT[number of<br>enslaved people]
        STATUS[Status]
        STARTDATE[Start date]
        ENDDATE[End Date]
    end

    subgraph PRODUCT["Product"]
        PROD[grows]
    end

    subgraph REMARKS["Additional"]
        GENERAL[General remarks<br>add/comments]
    end

    PLANTATION --> |has id| ID
    PLANTATION --> |has| NAME
    PLANTATION --> |has| TEMPORAL
    TEMPORAL --> |based on year| DISTRICT
    TEMPORAL --> |has| SERIES
    SERIES --> |has| SERIES_DATA
    PLANTATION --> |grows| PRODUCT
    PLANTATION --> |has| REMARKS
```

---

## Observations & Notes

### Key Design Decisions in Source Data

1. **Denormalized temporal data**: Products and districts at specific years are stored as separate columns (`Product_1846`, `Product_1854`) rather than in a normalized time-series table. 

TvO: I would leave out 'product' and instead get that data from the Almanak dataset. For district the same: we would preferably have a separate dataset on the historical districts of Suriname? For now I would use the district info perhaps as illustration so that users can easily distinguish between similarly named plantations

2. **Series-based population tracking**: Enslaved population is organized into 4 temporal series rather than year-by-year counts.

3. **Status tracking**: Each series has a status field to indicate data quality/availability.

### Implications for Database Design

1. **Normalization opportunity**: Convert `Product_YEAR` and `District_YEAR` columns into proper temporal tables for better querying.

2. **Series interpretation needed**: The exact year ranges for Series 1-4 need to be documented (approximately 1830-1840, 1841-1850, 1851-1860, 1861-1863). 

TvO: New series were started in 1830, 1838, 1848 and 1851, ending 1863. See for more background: https://doi.org/10.1080/1081602X.2018.1507917 and https://www.nationaalarchief.nl/onderzoeken/index/nt00461. So: series I: 1830-1838, II: 1838-1848; III: 1848-1851 and IV: 1851-1863. There could be some overlap between series in the transitional year.

3. **PSUR_ID as linking key**: The `ID_plantation` (PSUR ID) serves as the master key for connecting plantation data across datasets (Almanakken, Slave Registers, etc.). 

TvO: also: the standardized name is used to link to the slave registers, which unfortunately does not use the PSUR ids....

### Questions to Investigate

- [ ] What are the exact date ranges for each series? -- TvO: solved
- [ ] How do districts map between 1842 and 1855 classifications? Todo: create districting dataset
- [ ] Are there plantations that changed products over time? TvO: yes but better to link to Almanakken dataset for this
- [ ] How does this dataset relate to the Slave & Emancipation Registers? TvO: via standardized name

Added TvO: todo: create linking table that links PSUR ids to wikidata ids (which is for now the main linking pin to other data until we have our own permanent ids for plantations)

---

## Related Datasets

| Dataset                                          | Relationship                               | Linking Field               |
| ------------------------------------------------ | ------------------------------------------ | --------------------------- |
| [Slave & Emancipation](05-slave-emancipation.md) | Individual enslaved persons on plantations | `Plantation`                |
| [Almanakken](06-almanakken.md)                   | Detailed annual plantation management      | `plantation_id` → `PSUR_ID` |
| [QGIS Maps](07-qgis-maps.md)                     | Geographic plantation locations            | Map features → plantation   |
| [Wikidata](08-wikidata.md)                       | External identifiers                       | `Wikidata_id` if available  |

---

7 January 2026
