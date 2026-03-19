# Paramaribo Ward Registers 1828-1847

> **Version:** V1  
> **Citation:** [@KasteleijnvanOort2024-ward]  
> **License:** CC BY-NC-SA 4.0  
> **DOI:** [10.17026/SS/VAQF63](https://hdl.handle.net/10622/VLN8FD)

---

## Linked Open Data Version

This dataset has also been published as Linked Open Data using the PICO (Persons in Context) model:

| Resource             | URL                                                                         |
| -------------------- | --------------------------------------------------------------------------- |
| **DataLegend (RDF)** | https://druid.datalegend.net/RJM/Paramaribo-Ward-Registers-1828-1847        |
| **SPARQL Endpoint**  | https://druid.datalegend.net/RJM/Paramaribo-Ward-Registers-1828-1847/sparql |
| **Statements**       | 2,078,149 triples                                                           |
| **Schema**           | Extended PICO with HDSC enslavement properties                              |

The LOD version uses:

- `pico:PersonObservation` for each person record
- `pnv:PersonName` for structured names
- `hdsc:isEnslavedOf` / `hdsc:isEnslaverBy` for enslavement relationships
- `sdo:PostalAddress` with `hdsc:wijk` for addresses

See [pico-model.md](../concepts/pico-model.md) for full analysis of this schema.

---

## Dataset Overview

| Property                | Value                              |
| ----------------------- | ---------------------------------- |
| **Primary Entity**      | Persons (census-like registration) |
| **Time Coverage**       | 1828–1847                          |
| **Data Rows**           | 102,260                            |
| **Data Columns**        | 40                                 |
| **File Format**         | CSV                                |
| **Geographic Coverage** | Paramaribo (city wards only)       |

### Purpose & Description

Since 1828, the colonial government of Suriname made an annual registration of the non-enslaved free inhabitants of the city. The registers have been partially preserved for 18 years. These "Ward Registers" are now available as a single CSV dataset. For more detailed information, consult the documentation or the datapaper (TSEG 2025): https://doi.org/10.52024/x5vgg810 

The dataset includes:

- Person demographics (name, age, sex, ethnicity, religion, occupation)
- Household information (free persons count by type)
- Enslaved persons (count per household) (from 1836 onwards)
- Address information (detailed street-level)
- Location codes (using historical numbering systems)
- Administrative fields (register type, ward number)
- Original/raw data fields alongside standardized versions

---

## Field Definitions

Based on the source documentation screenshot:

### Archive Identification

| Field     | Type        | Description                       | Example | Crucial for Linking | Primary Information |
| --------- | ----------- | --------------------------------- | ------- | ------------------- | ------------------- |
| `Id`      | integer     | Record identifier                 |     60713    |         In the future: yes, if we start linking persons within this dataset and with external person data            |          No           |
| `Arch`     | text/string | Archive code (e.g., `1.04.08.01`) |    1.05.08.01     |          No         |         Perhaps for provenance          |
| `Inv`     | integer     | Inventory number                  |    669     |          No           |         No            |
| `Kaart Id` | text/string | Scan(image) identifier            |   1840f73      |         Only if we want to be able to refer to all entries on one card (meaning all free inhabitants on a certain address in a certain year)             |          No           |
| `Scan`    | bool/string | URL to digitized original scan    |   https://www.nationaalarchief.nl/onderzoeken/archief/1.05.08.01/invnr/669/file/NL-HaNA_1.05.08.01_669_0079      |         Yes for linking to the orig source / provenance            |          Yes           |
| `Jaar`    | integer     | Level (year)                      |     1840    |        Yes if you want to be able to limit linking to a certain year             |         Yes            |

### Person Information - Name

| Field           | Type        | Description                         | Crucial for Linking | Primary Information |
| --------------- | ----------- | ----------------------------------- | ------------------- | ------------------- |
| `Voornaam`      | text/string | First name/given name(s) .           |          Depends on how we will link to other person observations, I assume this will be done via person IDs and thse are not (yet) in this dataset           |         Yes            |
| `Tussenvoegsel`  | text/string | Name prefix(es) (e.g., `van`, `de`). Note that prefixes have additional meaning in Suriname, 'van' can indicate a manumission name, referring to the previous owner |         Idem            |         Yes            |
| `Achternaam`    | text/string | Surname/family name. Note that people in slavery were not allowed surnames                 |       Idem              |           Yes          |
| `Meisjesnaam`       | text/string | Maiden name, the surname of a married woman before marriage        |          Idem           |          Yes           |
| `Weduwe`      | text/string |           Field contains 'weduwe' if the person was widow                |            Idem         |           Nice to have           |
| `Fn_Dec_Spouse` | text/string | First name of deceased (male) spouse       |        Idem             |         No  -- in the linked data modelling the deceased husband should lead to a new person observation            |
| `Suffix`        | text/string | Suffix (e.g., `Jr`)                 |        Idem             |           Nice to have           |
| `Prefix`        | text/string | Prefix (e.g., 'de vrije', 'mr.')                 |          Idem            |        Nice to have             |
### Person Information - Demographics

| Field       | Type        | Description                                                | Notes                       | Crucial for Linking | Primary Information |
| ----------- | ----------- | ---------------------------------------------------------- | --------------------------- | ------------------- | ------------------- |
| `Religie`   | text/string | Religion - normalized                                       |            Normalized notation of religion                 |           No: assuming we link person observations outside in a separate operation          |          Yes           |
| `Rel_Std`   | text/string | Religion - standardized level DAIS                         | Standardized classification, useful for research purposes but better use the normalized terms for presentation |           No          |          No           |
| `Leeftijd`  | mixed/float | Normalized age in years (can include fractions like `0.5` for months) |                             |        No            |          Yes           |
| `Ethnicity` | text/string | Ethnicity                                                  |       Normalized. Contemporary ethnic classification referring to skin color. The n-word is replaced by 'Zwarte'.                   |           No          |           Yes          |
| `Sex`       | text/string | Sex (`M` for male, `V` for female)                         |                             |            No         |         Yes            |
| `Beroep`    | text/string | Occupation/profession                                      |                            |           No          |           Yes          |

| `Herkomst`  | text/string | Place of origin (place)                      |           No          |          Yes           |

### Household Composition - Enslaved Persons (tabular data)

These fields represent the tabular information that describes the number of enslaved persons present at a certain address, usually attached to a free person on the same row on the card. The following attributes are used: 

- X = colored 
- B = black 
- m = male
- f = female
- a = adult
- c = child

In the rdf representation of the data, for each person mentioned this way there is a (nameless) person observation. In combination with the owner, we can potentially link this nameless person observation to a person observation in the Slave Registers.

| Field | Type    | Description                                        | Crucial for Linking | Primary Information |
| ----- | ------- | -------------------------------------------------- | ------------------- | ------------------- |
| `Xma` | integer | Number of enslaved adult males (mixed ethnicity) - cross-referenced      |          No           |           Yes          |
| `Xfa` | integer | Number of enslaved adult females - cross-referenced    |          Idem, etc.           |        Idem, etc             |
| `Xmc` | integer | Number of enslaved male children - uncrossreferenced   |                     |                     |
| `Xfc` | integer | Number of enslaved female children - uncrossreferenced |                     |                     |
| `Bma` | integer | Number of enslaved adult males (African origin) - heathen               |                     |                     |
| `Bfa` | integer | Number of enslaved adult females - heathen             |                     |                     |
| `Bmc` | integer | Number of enslaved male children - (heathen)           |                     |                     |
| `Bfc` | integer | Number of enslaved female children - (heathen)         |                     |                     |
| `Unk` | integer | Number of enslaved persons with unknown demographics        |                     |                     |

### Person attributes and comments

| Field                   | Type        | Description                 | Crucial for Linking | Primary Information |
| ----------------------- | ----------- | --------------------------- | ------------------- | ------------------- |
| `Enslaved`              | text/string | Enslaved status indicator: value '1' indicates that the person in this row in the dataset is enslaved   |           No          |        No             |
| `Aantal_Slaafgemaakten` | integer     | Count of enslaved persons in this row of the dataset  |         No            |          No           |
| `Diverse`              | text/string | Original comments (in Dutch) |        No             |           Yes - preferable show in presentation of data            |          |
| `Enslaved_Remarks`         | text/string |  Remarks about the enslaved on this address              |            No         |        Yes - preferable show in presentation of data            |
| `Freeperson_Remarks`      | text/string |  Remarks about the free person(s) on this address          |         No            |        Yes - preferable show in presentation of data            |             |
| `Eigenaar`              | text/string |  Owner of the property (house and/or land parcel)                |                     |           Yes - preferable show in presentation of data            |          |
| `Annotaties`              | text/string |  Annotations added by the transcribers about the person                |           No          |          Yes - preferable show in presentation of data  (with sufficient explanation)          |           |

### Address Information

| Field                             | Type        | Description                                            | Notes | Crucial for Linking | Primary Information |
| --------------------------------- | ----------- | ------------------------------------------------------ | ----- | ------------------- | ------------------- |
|                   
| `Wijk`                             | text/string | District/ward                                          |       |           No          |           Yes - preferable show in presentation of data           |
| `wijkletter`                      | text/string | Ward/district letter code                              |      |        Yes: a unique location code must be created from 1. wijkletter 2. Brt code (if available) 3. huisnummer           |          No           |
| `Straatnaam`                      | text/string | Street name                                     |       |          No           |       Yes - preferable show in presentation of data               |
| `Huisnummer`                      | text/string | House number (in `M+` entry)                           |       |           Yes          |          No           |
| `Adres_Richting_Aanv`              | text/string | Address direction (supplement): e.g., `Prins`, `Oost` |       |         No            |          No           |
| `Adres_Aanvulling` | text/string | Extra location info, e.g. `a=oost zijde, zo=z oost zijde`    |       |         No            |         No            |
| `Kamer`                | text/string | Address supplement: indication of the room                                     |       |         No            |          Yes - preferable show in presentation of data           |
| `Buurt`                          | text/string | Source description (e.g., `N house`, `N1 house`)       |       |             No        |          No           |
| `Brt`                           | text/string | Neighborhood code. For pre-1836 addresses it is necessary to know the neighborhood code to establish the exact address                                           |       |           Yes          |          Yes           |

### Location Codes

| Field                | Type        | Description                                           | Crucial for Linking | Primary Information |
| -------------------- | ----------- | ----------------------------------------------------- | ------------------- | ------------------- |
| 
| `Ow`                 | text/string | Reference to old numbering system in post 1836 data                              |            No         |       No              |
| `Nw`                 | text/string | Reference to new numbering system (only in 1834)                             |           No          |       No              |
| `Locatie`            | text/string | Remarks about the location,  e.g. if undeveloped land, etc.                                  |           No          |          Yes - preferable show in presentation of data           |
| `Adres_Remarks`       | text/string | Remarks specifically about the address, often remarks by transcriptors about errors                                  |           No          |          No           |
| `Concordans_Muntjw` | text/string | Cross-reference to Muntjewerff's Concordans |           No          |            No         |
| `Address_Full`        | text/string | Formatted full address                                |          No           |        Yes: this is the main label for the address             |

### Administrative Fields

| Field       | Type        | Description                              | Crucial for Linking | Primary Information |
| ----------- | ----------- | ---------------------------------------- | ------------------- | ------------------- |
| `S_Order`   | integer     | Original sort order of the transcribed table                               |         No            |          No           |
| `Register`  | text/string | Register type (`W=Registers Paramaribo`) |       No              |             No        |
| `Archieftoegang` | text/string |        Full name of the archival source              |            No         |        No             |

### Original Data Fields

These preserve the original values before standardization. These can all be ignored for our purposes.

| Field               | Type        | Description                                                          | Crucial for Linking | Primary Information |
| ------------------- | ----------- | -------------------------------------------------------------------- | ------------------- | ------------------- |
| `Age_Orig`          | text/string | Original age notation (may include `m` for months, etc.)             |                     |                     |
| `Rel_orig`          | text/string | Original religion abbreviation                                       |                     |                     |
| `Slilr_Or`          | text/string | Original activity code (`B` = Blanke/white, `K` = kleurling/colored) |                     |                     |
| `Rleur/Colon_K`     | text/string | Color/colonial status                                                |                     |                     |
| `Surname_Orig`      | text/string | Surname as recorded                                                  |                     |                     |
| `FirstSurname_Orig` | text/string | Original first name as recorded                                      |                     |                     |
| `Remarks_Orig`      | text/string | Original remarks from source                                         |                     |                     |
| `Links_Orig`        | text/string | Cross-links original                                                 |                     |                     |
| `Kroniek_Remarks`   | text/string | Extra entry remarks                                                  |                     |                     |

---

## Standardization Tables

### Religion Standardisation

The dataset includes standardized religion codes:

| Field                | Description                                                                    |
| -------------------- | ------------------------------------------------------------------------------ |
| `id`                 | integer                                                                        |
| `Rel_org`            | text/string - Original religion as in rows as recorded in historical documents |
| `Standaardisering_1` | text/string                                                                    |
| `Standaardisering_2` | text/string                                                                    |

**Notes on this:**

- Mostly only original data are preserved as Excel
- Doesn't or marks (?, ???) indicates uncertainty or gaps
- Numerical/abbreviated religions included
- Can assign with no occupation (e.g., housewife/husband) rather than
- The cross-standardizations have different standardized names/groupings for analysis

### Street Standardisation

| Field                        | Description                                                            |
| ---------------------------- | ---------------------------------------------------------------------- |
| `id`                         | integer                                                                |
| `street_org`                 | text/string - Original street name as recorded in historical documents |
| `standaardiseerd_straatnaam` | text/string                                                            |

---

## Entity-Relationship Diagram

```mermaid
erDiagram
    WARD_REGISTRATION {
        int Id PK
        string Ark
        int Inv
        string Scan_Id
        int Year
        string Register
        int G_Orden
    }

    PERSON {
        int registration_id FK
        string Voornaam
        string Tussenvoesel
        string Achternaam
        string Suffix
        string Sex
        float Leeftijd
        string Ethnicity
        string Religie
        string Rel_Std
        string Beroep
        string Burgerst
        string Geboorteland
    }

    HOUSEHOLD {
        int registration_id FK
        int Hwa "free adult males"
        int Vba "free adult females"
        int Hwb "free male children"
        int Vbb "free female children"
        int Aantal_Slaafgemaakten "enslaved count"
        string Eigenaar "owner"
    }

    ADDRESS {
        int registration_id FK
        string wijkletter
        string Straatnaam
        string Housnummer
        string Buurt
        string Locatie
        string Address_Ful
    }

    LOCATION_CODES {
        int registration_id FK
        string BN
        string Ov "old numbering"
        string Nw "new numbering"
    }

    ORIGINAL_DATA {
        int registration_id FK
        string Age_Orig
        string Rel_orig
        string Surname_Orig
        string FirstSurname_Orig
        string Remarks_Orig
    }

    WARD_REGISTRATION ||--|| PERSON : "records"
    WARD_REGISTRATION ||--|| HOUSEHOLD : "has"
    WARD_REGISTRATION ||--|| ADDRESS : "located_at"
    WARD_REGISTRATION ||--|| LOCATION_CODES : "coded_as"
    WARD_REGISTRATION ||--|| ORIGINAL_DATA : "original_values"
```

---

## Observations & Notes

### Key Characteristics

1. **Census-like data**: Annual registrations of free inhabitants, household composition.

2. **Rich address data**: Multiple address fields with old/new numbering systems.

3. **Original + Standardized**: Both raw original values and standardized versions preserved.

4. **Religion & Street standardization**: Separate lookup tables for normalizing historical variations.

5. **Enslaved counts per household**: Number of enslaved persons owned by each registered person.

### Unique Features

- **Leeftijd (age)**: Can be fractional (e.g., `0.5` for 6-month-old infant).
- **Multiple numbering systems**: `BN`, `Ov`, `Nw` codes for location cross-referencing.
- **Wijkletter**: Ward letter codes for Paramaribo neighborhoods.

### Implications for Database Design

1. **Person deduplication challenge**: Same person appears across multiple years (1828-1847).

This will be done by the HDSC (Matthias Rosenbaum-Feldbrügge)

2. **Address normalization needed**: Complex street standardization with multiple systems.

To make the address data operable, we need Muntjewerff's concordans: https://www.concordansparamaribo.info/concordans/concordans-2022 (perhaps we should add this as yet another dataset...)

3. **Temporal person tracking**: Track same individual across registration years.

4. **Household vs Person**: Need to separate household-level (enslaved counts) from person-level data.

We tried to solve this in the rdf version of the data.

### Questions to Investigate

- [ ] How to track same person across years (name + age progression)?
- [ ] How do ward letters map to modern Paramaribo neighborhoods?
- [ ] What is the relationship between `Eigenaar` (owner) and person record?
- [ ] How does this overlap with Birth/Death certificate addresses?
- [ ] How can we link enslaved persons in the WR to the enslaved persons in the Slave registers (via the owner)?
---

## Related Datasets

| Dataset                                          | Relationship           | Potential Linking    |
| ------------------------------------------------ | ---------------------- | -------------------- |
| [Birth Certificates](03-birth-certificates.md)   | Address matching       | Street names, ward   |
| [Death Certificates](02-death-certificates.md)   | Person matching        | Name + age + address |
| [QGIS Maps](07-qgis-maps.md)                     | Geographic context     | Ward boundaries      |
| [Slave & Emancipation](05-slave-emancipation.md) | Enslaved person counts | Owner name matching  |

---

7 January 2026
