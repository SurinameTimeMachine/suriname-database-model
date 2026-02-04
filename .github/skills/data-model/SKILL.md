# Suriname Time Machine Data Model Skill

> **IMPORTANT:** This document must be read and followed when working on any data model, RDF schema, CIDOC-CRM mapping, or linked data task in the Suriname Time Machine project.

## Purpose

This skill provides step-by-step guidance for modeling historical entities from Suriname's colonial archives as Linked Open Data. It documents every design decision with explicit reasoning, allowing for review, questions, and future refinement.

## References (Read These First)

| Reference                 | URL                                                                                       | Why Essential                             |
| ------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------- |
| CIDOC-CRM 7.1.3 HTML      | https://cidoc-crm.org/html/cidoc_crm_v7.1.3.html                                          | Official class and property definitions   |
| CIDOC-CRM 7.3.1 Spec      | [docs/models/cidoc-crm-version_7-3-1.md](../../../docs/models/cidoc-crm-version_7-3-1.md) | Full specification with examples          |
| PICO Model                | https://personsincontext.org/                                                             | Dutch LOD standard for historical persons |
| PICO for Enslaved Persons | https://github.com/RJMourits/Modelling-the-enslaved-as-historical-persons                 | Extensions for slavery context            |
| Schema.org Organization   | https://schema.org/Organization                                                           | PICO-compatible organizational typing     |
| Wikidata Plantation       | https://www.wikidata.org/wiki/Q188913                                                     | Type identifier for plantations           |
| GeoSPARQL                 | https://www.ogc.org/standard/geosparql/                                                   | Spatial data standard                     |

---

# Part 1: What Is a Plantation?

## Step 1.1: The Problem Statement — What Are We Actually Observing?

Before deciding how to model "a plantation," we must carefully examine what we actually observe in our data sources and what a plantation conceptually _is_.

### Our Data Sources

We have data about **plantations** in Suriname from multiple sources:

| Source                  | What It Contains                                                 | Time Period        |
| ----------------------- | ---------------------------------------------------------------- | ------------------ |
| **1930 Plantation Map** | Polygon outlines with labels                                     | 1930 snapshot      |
| **Almanakken**          | Names, owners, administrators, directors, crops, enslaved counts | 1819–1935 (annual) |
| **Slave Registers**     | Links between enslaved persons and plantations                   | Various            |
| **Wikidata**            | Stable Q-IDs, standardized names                                 | Current            |

### What Do We Observe About Plantations?

Let's enumerate everything we can observe or know about a plantation:

#### 1. Spatial Observations (from maps, that were also created at a year)

- A **polygon outline** on a historical map (e.g., the 1930 map)
- A **label/name** written on that map next to/inside the polygon
- The polygon has **coordinates** (after georeferencing the map with a more or less good accuracy to WGS84)

**Critical insight:** An outline on a map does NOT mean the plantation was physically created. The map may show:

- A plantation that was **built and operating**
- A plantation that was **planned but never realized**
- A **land grant** that existed only on paper
- An **abandoned** plantation where the forest has reclaimed the land

The map documents an **idea** or **claim** about a piece of land — not necessarily physical reality.

#### 2. Naming Observations

- A **standardized name** (e.g., "Tygerhol") — the canonical/preferred form
- **Historical spelling variants** (e.g., "Tijgershol", "Tyger-hol")
- **Names in different languages** — Dutch colonial names, potentially Sranantongo names
- **Name changes over time** — a plantation might be renamed when sold or merged
- **Multiple names in the same year** — the Almanakken sometimes record both `plantation_org` (original spelling in source) and `plantation_std` (standardized)

#### 3. Organizational/Legal Observations (from Almanakken)

The Almanakken reveal that plantations functioned as **economic organizations**:

- **Owner** (`eigenaar`) — the legal owner, could be a person or another organization
- **Administrator** (`administrateur`) — manages the plantation's business affairs
- **Director** (`directeur`) — on-site manager overseeing daily operations
- **Ownership by another plantation** — one plantation can own another (see `reference_std_id` column)

These relationships change over time. In year X, person A is owner; in year Y, person B.

#### 4. Agricultural/Production Observations

- **Crops grown** — sugar, coffee, cotton, cacao, etc.
- **Machinery** — types of processing equipment
- **Production quantities** — in specific years

#### 5. Population Observations (from Almanakken and Slave Registers)

- **Enslaved persons count** — broken down by gender, age, work status
- **Free persons count** — after 1856
- **Individual enslaved persons** — (future: linkable via organization Q-ID)

#### 6. Structural Relationships Between Plantations

From the Almanakken `split` and `partof` columns:

- Plantation A **is composed of** parts B, C, D (plantation was split)
- Plantation X **forms part of** larger plantation Y (plantation was merged into another)
- Plantation P **is owned by** plantation Q (organizational ownership)

#### 7. Lifecycle Observations

- **Creation/establishment** — when the forest was cleared and the plantation built (often unknown)
- **Operational period** — when actively producing crops
- **Abandonment** — when production ceased
- **Current state** — some are archaeological sites, some are still visible in the landscape, some have been reclaimed by forest

### The Conceptual Nature of "Plantation"

So what IS a plantation? We can think of it at several levels:

**Level 1: A Concept/Idea**
A plantation is first an **idea** — a human decision to designate a piece of land for agricultural exploitation. This idea can exist on paper (a land grant, a plan, a map annotation) even if the land was never actually cleared.

**Level 2: A Physical Transformation**
If the idea is realized, the plantation becomes a **physical modification of the landscape**:

- Forest is cut down
- Land is cleared and prepared
- Drainage canals are dug
- Buildings are constructed (processing facilities, housing)
- Crops are planted

This is an **immovable human-made thing** — attached to a specific piece of the Earth's surface.

**Level 3: An Economic Organization**
The plantation also functions as a **legal/economic entity**:

- It can be owned, sold, mortgaged
- It employs people (directors, administrators)
- It has enslaved workers (before emancipation)
- It produces goods for sale
- It can be split into parts or merged with other plantations

**Level 4: A Historical Record**
For us as researchers, a plantation is also what we can **observe in historical sources**:

- A polygon on a map
- A row in the Almanakken
- A reference in slave registers
- An entry in Wikidata

### The Modeling Challenge

**Question:** How do we model "a plantation" as a single coherent entity that can:

1. **Exist as an idea** even if never physically built
2. **Have a spatial extent** (polygon) derived from map observations
3. **Have multiple names** (preferred, alternatives, in different languages, changing over time)
4. **Function as an organization** with owners, directors, administrators
5. **Be linked to persons** (owners, administrators, enslaved people)
6. **Have agricultural attributes** (crops, machinery) that change over time
7. **Be split into parts or merged** with other plantations
8. **Have a lifecycle** (planned → built → operating → abandoned → archaeological site)
9. **Be observed at different points in time** with different attributes

The answer will involve modeling the plantation as an entity with **multiple natures** — physical and organizational — and using an **observation pattern** to capture time-varying attributes.

---

## Step 1.2: Three Separate Entities — Land Plot, Physical Site, Organization

### The Key Insight: Separation of Concerns

After careful analysis, we realize that a "plantation" is actually **three distinct things** with independent lifecycles:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. LAND PLOT (E53 Place)                                                   │
│     The piece of land itself — exists before, during, and after the         │
│     plantation. Has boundaries observed on maps. Can be merged or split.    │
│     Is a Legal Object (E72) — can be owned, claimed, granted.               │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ stm:physicalSiteAt (qualified link)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  2. PHYSICAL SITE (E24 Physical Human-Made Thing)                           │
│     The human transformation of the land — cleared forest, buildings,       │
│     canals, planted crops. Created when plantation is built, may be         │
│     destroyed/abandoned. Occupies the land plot.                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ stm:operatedBy (qualified link)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  3. ORGANIZATION (sdo:Organization)                                         │
│     The legal/economic entity — has owners, administrators, directors.      │
│     Can be sold, merged, dissolved. Employs/enslaves people.                │
│     Has a Wikidata Q-ID. Observed in Almanakken.                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why Separate Entities? A Real Example

Consider **Geijersvlijt / Suzanna'sdal** from our QGIS data (fid 1619):

```csv
label_1930: Geijersvlijt
label_1860-79: Kl. Suzanna'sdal
qid: Q4392658 (Geijersvlijt)
qid_alt: Q131349015 (probably Suzanna'sdal)
```

**What happened historically:**

```
1860s                                        1930
┌───────────────────┐                       ┌─────────────────────────────────────┐
│ Land Plot A       │                       │                                     │
│ "Kl. Suzanna'sdal"│ ────── merged ──────► │  Land Plot C                        │
│ (small plot)      │         into          │  "Geijersvlijt"                     │
└───────────────────┘                       │  (larger merged plot)               │
┌───────────────────┐                       │                                     │
│ Land Plot B       │ ────────────────────► │                                     │
│ "Geijersvlijt"    │                       └─────────────────────────────────────┘
│ (small plot)      │
└───────────────────┘
```

With **separate entities**, we can model:

1. **Land Plot A** (1860) was labeled "Kl. Suzanna'sdal" — small parcel
2. **Land Plot B** (1860) was labeled "Geijersvlijt" — small parcel
3. **Land Plot C** (1930) is the merged result, labeled "Geijersvlijt"
4. **Organization Q4392658** (Geijersvlijt) operated on Land Plot B, then on Land Plot C
5. **Organization Q131349015** (Suzanna'sdal) operated on Land Plot A, then was absorbed or dissolved

With **dual-typing on a single entity**, we could NOT express:

- That two land plots became one
- That the Suzanna'sdal organization may have been absorbed into Geijersvlijt
- That the land existed before and persists after the organization

### The Three Entities in Detail

| Entity            | CIDOC-CRM Class                   | Purpose                                             | Lifecycle                                     |
| ----------------- | --------------------------------- | --------------------------------------------------- | --------------------------------------------- |
| **Land Plot**     | E53 Place (also E72 Legal Object) | The land itself, with boundaries                    | Pre-exists plantation, persists after         |
| **Physical Site** | E24 Physical Human-Made Thing     | The human modifications (buildings, canals, fields) | Created when built, destroyed when abandoned  |
| **Organization**  | sdo:Organization                  | The legal/economic entity                           | Created when established, ends when dissolved |

### URI Patterns

```turtle
# Land Plot — identified by map year and label for readability
stm:landplot/1930/geijersvlijt
stm:landplot/1860/suzannasdal
stm:landplot/1860/geijersvlijt

# Physical Site — linked to a land plot
stm:site/geijersvlijt

# Organization — uses Wikidata Q-ID as primary identifier
wd:Q4392658   # Geijersvlijt organization
wd:Q131349015 # Suzanna'sdal organization
```

**Note:** The `fid` from the QGIS CSV can be stored as an identifier on the land plot for traceability.

---

## Step 1.3: Entity 1 — Land Plot (E53 Place)

### What is a Land Plot?

A **Land Plot** is a piece of the Earth's surface with defined boundaries. In our model:

- It is **observed on a historical map** (1860, 1930, etc.)
- It has a **polygon geometry** (after georeferencing)
- It has a **label** written on the map
- It can be **merged** with other land plots or **split** into smaller ones
- It exists **independently** of any organization or physical structures

### CIDOC-CRM Class: E53 Place

From the CIDOC-CRM specification:

> **E53 Place** comprises extents in the natural space we live in, in particular on the surface of the Earth, in the pure sense of physics: independent from temporal phenomena and matter.

Key properties:

- Places are **immovable** — they are parts of the Earth's surface
- Places have **fuzzy boundaries** in reality, but we define them precisely from maps
- Places can **overlap** or be **contained within** other places

### E53 Place is also E72 Legal Object!

This is important for ownership. From the CIDOC-CRM hierarchy:

```
E72 Legal Object
└── E18 Physical Thing
    └── E53 Place  ← Land can be OWNED
```

Wait — that's not quite right. Let me check the actual hierarchy:

Actually, **E53 Place** is NOT a subclass of E72 Legal Object in CIDOC-CRM. However:

- Land plots CAN be subject to legal ownership in reality
- We can express this through **P52 has current owner** (domain: E18 Physical Thing)
- E53 Place is a subclass of E18 Physical Thing, so it inherits P52

**Resolution:** A land plot (E53 Place) can have owners via P52, even though it's not formally typed as E72 Legal Object.

### URI Patterns for Land Plots

| Condition          | URI Pattern                       | Example                          |
| ------------------ | --------------------------------- | -------------------------------- |
| **Labeled plot**   | `stm:landplot/{year}/{name-slug}` | `stm:landplot/1930/geijersvlijt` |
| **Unlabeled plot** | `stm:landplot/{year}/fid-{fid}`   | `stm:landplot/1930/fid-1606`     |

The `fid` is always unique from the QGIS CSV, so it serves as a fallback identifier when no label exists.

### Land Plot RDF Pattern (Labeled)

```turtle
@prefix crm: <http://www.cidoc-crm.org/cidoc-crm/> .
@prefix geo: <http://www.opengis.net/ont/geosparql#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix stm: <https://suriname-timemachine.org/vocab/> .
@prefix prov: <http://www.w3.org/ns/prov#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

# A labeled land plot observed on the 1930 map
stm:landplot/1930/geijersvlijt
    a crm:E53_Place, stm:LandPlot ;

    # Identifiers
    stm:fid "1619" ;                              # From QGIS CSV
    stm:mapYear 1930 ;                            # Year of the map

    # Label as observed on the map
    stm:observedLabel "Geijersvlijt"@nl ;
    skos:prefLabel "Geijersvlijt (1930 land plot)"@en ;

    # Geometry (from georeferenced map)
    geo:hasGeometry [
        a geo:Geometry ;
        geo:asWKT "POLYGON((563534.4 646616.5, ...))"^^geo:wktLiteral
    ] ;

    # Provenance — which map this came from
    prov:wasDerivedFrom <map:1930_plantation_polygons> ;

    # Temporal changes — this plot resulted from merging earlier plots
    stm:mergedFrom stm:landplot/1860/suzannasdal ,
                   stm:landplot/1860/geijersvlijt .
```

---

## Step 1.4: Entity 2 — Physical Site (E24 Physical Human-Made Thing)

### What is a Physical Site?

A **Physical Site** represents the human transformation of a land plot:

- Cleared forest
- Constructed buildings (processing facilities, storage, housing)
- Dug canals and irrigation systems
- Planted crops

This is the **material reality** of the plantation — what you would see if you visited it.

### CIDOC-CRM Class: E24 Physical Human-Made Thing

From the specification:

> **E24 Physical Human-Made Thing** comprises all persistent physical items of any size that are purposely created by human activity.

This class:

- Covers **immovable** things (unlike E22 which implies movable)
- Is created through an **E12 Production** event
- Can be destroyed through an **E6 Destruction** event
- **Occupies** a place via **P156 occupies**

### Physical Site RDF Pattern

```turtle
# The physical site — the actual plantation infrastructure
stm:site/geijersvlijt
    a crm:E24_Physical_Human-Made_Thing, stm:PlantationSite ;

    skos:prefLabel "Geijersvlijt plantation site"@en ;

    # Status of physical realization
    crm:P2_has_type stm:PlantationStatus_Built ;

    # The land it occupies (can change if land plots merge)
    crm:P156_occupies stm:landplot/1930/geijersvlijt ;

    # Previous land it occupied (before merger)
    stm:formerlyOccupied stm:landplot/1860/geijersvlijt .
```

### When is Physical Site Needed?

The Physical Site entity is useful when:

- You need to track **physical changes** (construction, destruction, renovation)
- You want to distinguish "the land" from "the buildings on the land"
- Different physical sites existed on the same land at different times

For simpler cases, you might skip the Physical Site and link Organization directly to Land Plot.

---

## Step 1.5: Entity 3 — Organization (sdo:Organization)

### What is the Organization?

The **Organization** is the legal/economic entity that:

- Has a **name** (the plantation name as a business)
- Has **owners, administrators, directors**
- **Operates** a physical site on a land plot
- Can be **bought, sold, merged, dissolved**
- Is observed in the **Almanakken** with time-varying attributes
- Has a **Wikidata Q-ID** as stable identifier

### Why Schema.org Organization?

We use `sdo:Organization` (not CIDOC-CRM E74 Group) because:

1. **PICO compatibility** — The Dutch historical persons model uses Schema.org
2. **Person relationships** — Schema.org provides `sdo:affiliation`, `sdo:employee`, etc.
3. **Wikidata alignment** — Wikidata uses Schema.org-compatible typing

### Organization RDF Pattern

```turtle
@prefix sdo: <https://schema.org/> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix stm: <https://suriname-timemachine.org/vocab/> .
@prefix wd: <http://www.wikidata.org/entity/> .

# The organization — the legal/economic entity
wd:Q4392658
    a sdo:Organization, stm:PlantationOrganization ;

    # Wikidata type for plantation
    sdo:additionalType wd:Q188913 ;

    # Names
    skos:prefLabel "Geijersvlijt"@nl ;
    skos:altLabel "Geyersvlijt"@nl ;  # Historical spelling variant

    # The organization was absorbed into another (if applicable)
    # stm:absorbedInto wd:Qxxxxxx .
```

---

## Step 1.6: Qualified Links — Connecting Entities with Certainty

### The Problem: Simple Links Aren't Enough

We can't just say:

```turtle
wd:Q4392658 stm:operatesAt stm:landplot/1930/geijersvlijt .
```

Because:

1. **Certainty varies** — How sure are we that this organization owned this land?
2. **Temporal scope** — When did this relationship hold?
3. **Evidence** — What source tells us this?

### Solution: Link Entities (Reification)

We create a **separate entity** for the link itself:

```turtle
# The link between land plot and organization
stm:link/1930/geijersvlijt_org
    a stm:LandOrganizationLink ;

    # The two things being linked
    stm:landPlot stm:landplot/1930/geijersvlijt ;
    stm:organization wd:Q4392658 ;

    # Nature of the link
    stm:linkType stm:LinkType_OperatedBy ;

    # Certainty (E55 Type vocabulary)
    stm:linkCertainty stm:Certainty_Certain ;

    # Temporal scope
    stm:observedInYear 1930 ;

    # Evidence
    stm:linkEvidence "Label on 1930 map matches organization name in Wikidata" ;
    prov:wasDerivedFrom <map:1930_plantation_polygons> .
```

### Link Certainty Vocabulary (E55 Type)

```turtle
stm:LinkCertainty
    a crm:E55_Type ;
    skos:prefLabel "Link Certainty"@en .

stm:Certainty_Certain
    a crm:E55_Type ;
    skos:broader stm:LinkCertainty ;
    skos:prefLabel "certain"@en ;
    skos:definition "The link is confirmed by explicit matching or multiple corroborating sources"@en .

stm:Certainty_Probable
    a crm:E55_Type ;
    skos:broader stm:LinkCertainty ;
    skos:prefLabel "probable"@en ;
    skos:definition "The link is likely based on name matching but not independently verified"@en .

stm:Certainty_Uncertain
    a crm:E55_Type ;
    skos:broader stm:LinkCertainty ;
    skos:prefLabel "uncertain"@en ;
    skos:definition "The link is tentative; multiple candidates exist or evidence is weak"@en .
```

### Link Type Vocabulary

```turtle
stm:LinkType
    a crm:E55_Type ;
    skos:prefLabel "Land-Organization Link Type"@en .

stm:LinkType_OperatedBy
    a crm:E55_Type ;
    skos:broader stm:LinkType ;
    skos:prefLabel "operated by"@en ;
    skos:definition "The organization operated the plantation on this land"@en .

stm:LinkType_OwnedBy
    a crm:E55_Type ;
    skos:broader stm:LinkType ;
    skos:prefLabel "owned by"@en ;
    skos:definition "The organization held legal ownership of this land"@en .

stm:LinkType_ClaimedBy
    a crm:E55_Type ;
    skos:broader stm:LinkType ;
    skos:prefLabel "claimed by"@en ;
    skos:definition "The organization claimed rights to this land (e.g., land grant)"@en .
```

---

## Step 1.7: Temporal Changes — Mergers, Splits, and Biographies

### Plantation Biographies

Our goal is to tell **plantation biographies** — how land plots and organizations change over time.

### Land Plot Changes

**Merging:** Two or more land plots become one.

```turtle
stm:landplot/1930/geijersvlijt
    stm:mergedFrom stm:landplot/1860/suzannasdal ,
                   stm:landplot/1860/geijersvlijt .

stm:landplot/1860/suzannasdal
    stm:mergedInto stm:landplot/1930/geijersvlijt .
```

**Splitting:** One land plot becomes multiple.

```turtle
stm:landplot/1860/large_estate
    stm:splitInto stm:landplot/1880/part_a ,
                  stm:landplot/1880/part_b .
```

### Organization Changes

**Absorption:** One organization is absorbed into another.

```turtle
wd:Q131349015  # Suzanna'sdal organization
    stm:absorbedInto wd:Q4392658 ;  # Geijersvlijt organization
    stm:absorptionYear 1890 .        # Approximate year (if known)
```

**Dissolution:** An organization ceases to exist.

```turtle
wd:Qxxxxxxx
    stm:dissolved true ;
    stm:dissolutionYear 1920 .
```

### Visualizing a Plantation Biography

For Geijersvlijt / Suzanna'sdal:

```
TIME    LAND PLOTS                    ORGANIZATIONS
────────────────────────────────────────────────────────────────

1860    ┌─────────────────┐           wd:Q131349015 (Suzanna'sdal)
        │ Kl. Suzanna'sdal│ ◄─────── operates on
        └─────────────────┘

        ┌─────────────────┐           wd:Q4392658 (Geijersvlijt)
        │ Geijersvlijt    │ ◄─────── operates on
        └─────────────────┘

~1890   (land plots merge)            (Suzanna'sdal absorbed?)

1930    ┌─────────────────────────┐   wd:Q4392658 (Geijersvlijt)
        │ Geijersvlijt            │ ◄─ operates on
        │ (merged plot)           │
        └─────────────────────────┘
```

---

## Step 1.8: Why CIDOC-CRM for This Model?

**Why not just use Schema.org or a custom ontology?**

1. **Temporal sophistication:** CIDOC-CRM is designed for cultural heritage with complex temporal relationships. Properties like P2 has type, P156 occupies, and the E55 Type pattern let us express nuanced classifications.

2. **Provenance built-in:** CIDOC-CRM has native patterns for documenting where information comes from (E73 Information Object, P70 documents).

3. **Community adoption:** Archives, museums, and digital humanities projects worldwide use CIDOC-CRM. This makes our data more interoperable.

4. **PICO compatibility:** The PICO model for Dutch historical persons uses CIDOC-CRM. Since we link enslaved persons to plantations, alignment is essential.

**Why Schema.org for Organizations?**

PICO uses `sdo:Organization` for organizational entities. Using the same class allows direct linking of persons to organizations via `sdo:affiliation` and related properties. We don't lose CIDOC-CRM benefits — we just use Schema.org where PICO requires it.

---

## Step 1.9: Using E55 Type for Classifications

**Problem:** How do we classify the status of a Physical Site (built, planned, abandoned)?

CIDOC-CRM has a proper pattern for classifications using **E55 Type**.

**Pattern: Defining Status Types**

```turtle
# === DEFINE THE STATUS VOCABULARY ===

stm:PlantationStatus
    a crm:E55_Type ;
    skos:prefLabel "Plantation Status"@en ;
    skos:definition "Classification of a plantation site's physical realization state"@en .

stm:PlantationStatus_Built
    a crm:E55_Type ;
    skos:broader stm:PlantationStatus ;
    skos:prefLabel "built"@en ;
    skos:prefLabel "gebouwd"@nl ;
    skos:definition "The plantation was physically constructed and operated"@en .

stm:PlantationStatus_Planned
    a crm:E55_Type ;
    skos:broader stm:PlantationStatus ;
    skos:prefLabel "planned"@en ;
    skos:prefLabel "gepland"@nl ;
    skos:definition "The plantation existed as a plan or land grant but may never have been physically realized"@en .

stm:PlantationStatus_Abandoned
    a crm:E55_Type ;
    skos:broader stm:PlantationStatus ;
    skos:prefLabel "abandoned"@en ;
    skos:prefLabel "verlaten"@nl ;
    skos:definition "The plantation ceased operations and was left to decay or reclaimed by forest"@en .

stm:PlantationStatus_Unknown
    a crm:E55_Type ;
    skos:broader stm:PlantationStatus ;
    skos:prefLabel "unknown"@en ;
    skos:prefLabel "onbekend"@nl ;
    skos:definition "The physical realization status cannot be determined from available sources"@en .

# === USE THE STATUS ON A PHYSICAL SITE ===

stm:site/geijersvlijt
    a crm:E24_Physical_Human-Made_Thing ;
    crm:P2_has_type stm:PlantationStatus_Built .
```

**When to use E55 Type:**

| Use E55 Type for...                       | Use simple properties for... |
| ----------------------------------------- | ---------------------------- |
| Classifications with defined vocabularies | Free-text descriptions       |
| Status values that need definitions       | Numeric measurements         |
| Categories that might form hierarchies    | Unique identifiers           |
| Terms that need multilingual labels       | Boolean flags                |

---

## Step 1.10: Complete Example — The Three-Entity Model

Putting it all together for Geijersvlijt:

```turtle
@prefix crm: <http://www.cidoc-crm.org/cidoc-crm/> .
@prefix geo: <http://www.opengis.net/ont/geosparql#> .
@prefix prov: <http://www.w3.org/ns/prov#> .
@prefix sdo: <https://schema.org/> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix stm: <https://suriname-timemachine.org/vocab/> .
@prefix wd: <http://www.wikidata.org/entity/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

# ══════════════════════════════════════════════════════════════════════════════
# ENTITY 1: LAND PLOT (from 1930 map)
# ══════════════════════════════════════════════════════════════════════════════

stm:landplot/1930/geijersvlijt
    a crm:E53_Place, stm:LandPlot ;

    # Identifiers
    stm:fid "1619" ;
    stm:mapYear 1930 ;

    # Label as observed on map
    stm:observedLabel "Geijersvlijt"@nl ;
    skos:prefLabel "Geijersvlijt (1930 land plot)"@en ;

    # Geometry
    geo:hasGeometry [
        a geo:Geometry ;
        geo:asWKT "POLYGON((563534.4 646616.5, 561412.9 647918.2, 561831.5 648651.8, 564047.8 647387.0, 563551.1 646710.6, 563534.4 646616.5))"^^geo:wktLiteral
    ] ;

    # Provenance
    prov:wasDerivedFrom <map:1930_plantation_polygons> ;

    # This plot merged from earlier plots
    stm:mergedFrom stm:landplot/1860/suzannasdal ,
                   stm:landplot/1860/geijersvlijt .

# Earlier land plot (1860)
stm:landplot/1860/suzannasdal
    a crm:E53_Place, stm:LandPlot ;
    stm:observedLabel "Kl. Suzanna'sdal"@nl ;
    skos:prefLabel "Kl. Suzanna'sdal (1860 land plot)"@en ;
    stm:mapYear 1860 ;
    stm:mergedInto stm:landplot/1930/geijersvlijt .

# ══════════════════════════════════════════════════════════════════════════════
# ENTITY 2: PHYSICAL SITE (the plantation infrastructure)
# ══════════════════════════════════════════════════════════════════════════════

stm:site/geijersvlijt
    a crm:E24_Physical_Human-Made_Thing, stm:PlantationSite ;

    skos:prefLabel "Geijersvlijt plantation site"@en ;

    # Status
    crm:P2_has_type stm:PlantationStatus_Built ;

    # Currently occupies the merged land plot
    crm:P156_occupies stm:landplot/1930/geijersvlijt .

# ══════════════════════════════════════════════════════════════════════════════
# ENTITY 3: ORGANIZATION (the legal/economic entity)
# ══════════════════════════════════════════════════════════════════════════════

wd:Q4392658
    a sdo:Organization, stm:PlantationOrganization ;
    sdo:additionalType wd:Q188913 ;  # Wikidata: plantation

    skos:prefLabel "Geijersvlijt"@nl .

# The other organization (possibly absorbed)
wd:Q131349015
    a sdo:Organization, stm:PlantationOrganization ;
    sdo:additionalType wd:Q188913 ;

    skos:prefLabel "Suzanna'sdal"@nl ;
    stm:absorbedInto wd:Q4392658 .

# ══════════════════════════════════════════════════════════════════════════════
# QUALIFIED LINKS (connecting entities with certainty and evidence)
# ══════════════════════════════════════════════════════════════════════════════

# Link: 1930 land plot → Geijersvlijt organization
stm:link/1930/geijersvlijt_Q4392658
    a stm:LandOrganizationLink ;
    stm:landPlot stm:landplot/1930/geijersvlijt ;
    stm:organization wd:Q4392658 ;
    stm:linkType stm:LinkType_OperatedBy ;
    stm:linkCertainty stm:Certainty_Certain ;
    stm:observedInYear 1930 ;
    stm:linkEvidence "Label 'Geijersvlijt' on 1930 map matches Wikidata Q4392658" ;
    prov:wasDerivedFrom <map:1930_plantation_polygons> .

# Link: 1860 land plot → Suzanna'sdal organization
stm:link/1860/suzannasdal_Q131349015
    a stm:LandOrganizationLink ;
    stm:landPlot stm:landplot/1860/suzannasdal ;
    stm:organization wd:Q131349015 ;
    stm:linkType stm:LinkType_OperatedBy ;
    stm:linkCertainty stm:Certainty_Probable ;
    stm:observedInYear 1860 ;
    stm:linkEvidence "Label 'Kl. Suzanna'sdal' on 1860 map, matched to Wikidata by name" ;
    prov:wasDerivedFrom <map:1860_plantation_map> .
```

---

## Step 1.11: Unlabeled Land Plots

### The Problem

Not all land plots on the 1930 map have labels. From the CSV data:

- **~1,598 total rows** in `plantation_polygons_1930.csv`
- **100+ rows** have only `fid` and `coords` — no `label_1930`, no `qid`
- Examples: fid 1606, 1612-1614, 1811-1820, 2049-2143

### What We Know vs. Don't Know

| Property                  | Labeled Plot | Unlabeled Plot |
| ------------------------- | ------------ | -------------- |
| `fid`                     | ✅           | ✅             |
| `coords` (geometry)       | ✅           | ✅             |
| `label_1930`              | ✅           | ❌             |
| `qid` (Organization link) | ✅           | ❌             |
| Almanakken data           | ✅ (via qid) | ❌             |

### This is Valid, Not an Error

An unlabeled land plot is still a valid **E53 Place**. The three-entity model explicitly allows:

- A **Land Plot** that has no associated **Organization**
- A **Land Plot** that has no associated **Physical Site**

Unlabeled land could be:

- Abandoned plantations (name no longer used in 1930)
- Government/crown land
- Forest reserves
- Infrastructure (roads, canals)
- Land merged into neighbors (label omitted)
- Cartographic uncertainty

### Label Status Vocabulary (E55 Type)

```turtle
# === LABEL STATUS VOCABULARY ===

stm:LabelStatus
    a skos:ConceptScheme ;
    skos:prefLabel "Land Plot Label Status"@en .

stm:LabelStatus_Labeled
    a crm:E55_Type, skos:Concept ;
    skos:inScheme stm:LabelStatus ;
    skos:prefLabel "Labeled"@en ;
    skos:definition "Land plot has a visible label on the source map."@en .

stm:LabelStatus_Unlabeled
    a crm:E55_Type, skos:Concept ;
    skos:inScheme stm:LabelStatus ;
    skos:prefLabel "Unlabeled"@en ;
    skos:definition "Land plot has no visible label on the source map."@en .

stm:LabelStatus_Illegible
    a crm:E55_Type, skos:Concept ;
    skos:inScheme stm:LabelStatus ;
    skos:prefLabel "Illegible"@en ;
    skos:definition "Land plot has a label but it cannot be read."@en .
```

### Unlabeled Land Plot RDF Pattern

```turtle
# An unlabeled land plot — uses fid in URI
stm:landplot/1930/fid-1606
    a crm:E53_Place, stm:LandPlot ;

    # Identifiers
    stm:fid "1606" ;
    stm:mapYear 1930 ;

    # Label status — explicitly unlabeled
    stm:labelStatus stm:LabelStatus_Unlabeled ;
    # NO stm:observedLabel property
    # NO skos:prefLabel (no name to give)

    # Geometry still exists
    geo:hasGeometry [
        a geo:Geometry ;
        geo:asWKT "POLYGON((555000.0 640000.0, ...))"^^geo:wktLiteral
    ] ;

    # Provenance
    prov:wasDerivedFrom <map:1930_plantation_polygons> .

# NOTE: No stm:LandOrganizationLink created for this plot
# because we cannot identify which organization (if any) operated here.
```

### Consequences for Data Consumers

When querying plantation data:

1. **Not all land plots have organization links** — filter by `stm:labelStatus` if needed
2. **Unlabeled plots have no path to Almanakken data** — they are geographic features only
3. **Unlabeled plots may still be valuable** for:
   - Total land area calculations
   - Spatial analysis (neighboring plots)
   - Future identification attempts

---

## Step 1.12: Data Source → Entity Mapping

### Our Primary Data Sources

We focus on **two main CSV files** plus minimal map metadata:

1. **`plantation_polygons_1930.csv`** (QGIS) — polygons, labels, Q-IDs
2. **`Plantations Surinaamse Almanakken v1.0.csv`** — annual observations
3. **`10-historic-maps-metadata.tsv`** — map source metadata (minimal use)

### Which Data Source Populates Which Entity?

| Data Source           | Land Plot (E53)       | Physical Site (E24) | Organization | Qualified Links  | Observations |
| --------------------- | --------------------- | ------------------- | ------------ | ---------------- | ------------ |
| **QGIS CSV**          | ✅ Primary (polygons) | ❌                  | ✅ Q-ID      | ✅ (label + qid) | ❌           |
| **Almanakken**        | ❌                    | ❌                  | ✅ Name      | ❌               | ✅ Primary   |
| **Historic Maps TSV** | ✅ Provenance         | ❌                  | ❌           | ❌               | ❌           |

### The QGIS CSV Structure

The `plantation_polygons_1930.csv` contains:

| Column             | Purpose                        | Example              |
| ------------------ | ------------------------------ | -------------------- |
| `fid`              | Unique polygon ID              | `1619`               |
| `label_1930`       | Label from 1930 map            | `"Geijersvlijt"`     |
| `label_1860-79`    | Label from 1860 map            | `"Kl. Suzanna'sdal"` |
| `plantation_label` | Derived/standardized label     | `"Geijersvlijt"`     |
| `qid`              | Wikidata Q-ID                  | `Q4392658`           |
| `qid_alt`          | Alternative Q-ID (for mergers) | `Q131349015`         |
| `coords`           | Polygon coordinates            | `"POLYGON((...))"`   |

**Key insight:** The Q-ID is already in the QGIS CSV! This is the direct link to the Organization.

### The Almanakken CSV Structure

The `Plantations Surinaamse Almanakken v1.0.csv` contains:

| Column                     | Purpose                     | Example          |
| -------------------------- | --------------------------- | ---------------- |
| `recordid`                 | Unique record ID            | `1818-28-6`      |
| `year`                     | Year of almanac             | `1818`           |
| `plantation_id`            | **Wikidata Q-ID**           | `Q4392658`       |
| `plantation_org`           | Original spelling           | `"Geyersvlijt"`  |
| `plantation_std`           | Standardized name           | `"Geijersvlijt"` |
| `eigenaren`                | Owner(s)                    | `"J.C. Geyer."`  |
| `administrateurs`          | Administrator(s)            | `"J.C. Geyer."`  |
| `directeuren`              | Director(s)                 | `"J. Petsch"`    |
| `product_std`              | Crop type                   | `"koffie"`       |
| `slaven`                   | Enslaved count              | `50`             |
| `split1_lab`, `split1_id`  | Split references            |                  |
| `partof_lab`, `part of_id` | Merger references           |                  |
| `reference_std_id`         | Owned by another plantation |                  |

**Key insight:** The Almanakken `plantation_id` column contains the **Q-ID**, providing direct linking!

### Property Mapping by Data Source

#### From QGIS CSV → Land Plot + Organization Link

| CSV Column         | Entity       | Property            | Notes                         |
| ------------------ | ------------ | ------------------- | ----------------------------- |
| `fid`              | Land Plot    | `stm:fid`           | Unique identifier             |
| `coords`           | Land Plot    | `geo:hasGeometry`   | Polygon                       |
| `label_1930`       | Land Plot    | `stm:observedLabel` | 1930 map label                |
| `label_1860-79`    | Land Plot    | `stm:label1860`     | 1860 map label (same polygon) |
| `plantation_label` | Land Plot    | `skos:prefLabel`    | Derived name                  |
| `qid`              | Organization | URI (`wd:Qxxxxx`)   | **Direct link**               |
| `qid_alt`          | Organization | `stm:alternateQid`  | For mergers                   |

#### From Almanakken CSV → Observations

| CSV Column        | Entity      | Property               | Notes                |
| ----------------- | ----------- | ---------------------- | -------------------- |
| `recordid`        | Observation | URI component          | `<obs:{recordid}>`   |
| `year`            | Observation | `stm:observationYear`  | Year                 |
| `plantation_id`   | Observation | `stm:observationOf`    | Links to `wd:{qid}`  |
| `plantation_org`  | Observation | `stm:observedName`     | Original spelling    |
| `eigenaren`       | Observation | `stm:hasOwner`         | Owner(s)             |
| `administrateurs` | Observation | `stm:hasAdministrator` | Administrator(s)     |
| `directeuren`     | Observation | `stm:hasDirector`      | Director(s)          |
| `product_std`     | Observation | `stm:hasProduct`       | Crop type            |
| `slaven`          | Observation | `stm:enslavedCount`    | Population           |
| `deserted`        | Observation | `stm:isDeserted`       | If marked "verlaten" |

#### From Historic Maps TSV → Provenance

| TSV Column            | Entity     | Property         | Notes            |
| --------------------- | ---------- | ---------------- | ---------------- |
| `ID`                  | Map Source | URI              | `<map:{id}>`     |
| `Label`               | Map Source | `rdfs:label`     | Map name         |
| `Year of publication` | Map Source | `dct:date`       | Publication year |
| `Handle`              | Map Source | `dct:identifier` | Archive handle   |

### The Data Flow (Simplified)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PLANTATION BIOGRAPHY                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                     ▲
                                     │ combines
        ┌────────────────────────────┼────────────────────────────┐
        │                            │                            │
        ▼                            ▼                            ▼
┌───────────────┐          ┌─────────────────┐          ┌─────────────────┐
│  LAND PLOT    │◄─────────│  ORGANIZATION   │◄─────────│  OBSERVATIONS   │
│  (geometry)   │   qid    │  (wd:Qxxxxx)    │   qid    │  (annual data)  │
└───────────────┘          └─────────────────┘          └─────────────────┘
        ▲                            ▲                            ▲
        │                            │                            │
        │                      (Q-ID is the                       │
        │                       linking key)                      │
        │                            │                            │
┌───────┴────────────────────────────┴────────────────────────────┴───────┐
│                              QGIS CSV                                    │
│         (fid, coords, label_1930, label_1860-79, qid, qid_alt)          │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
                    Almanakken CSV   │
              (recordid, year, plantation_id=Q-ID, eigenaren, ...)
```

### The Linking Mechanism

**The Q-ID is the central linking key:**

1. **QGIS CSV** contains `qid` column → this IS the Organization URI
2. **Qualified Link** connects Land Plot (fid) to Organization (qid)
3. **Almanakken** contains `plantation_id` column → this IS the same Q-ID
4. **Observations** link to Organization via `plantation_id` matching `qid`

```
QGIS CSV row:
  fid=1619, label_1930="Geijersvlijt", qid=Q4392658
                                         │
                                         ▼
                              Organization: wd:Q4392658
                                         ▲
                                         │
Almanakken CSV row:
  recordid=1818-28-6, plantation_id=Q4392658, eigenaren="J.C. Geyer"
```

**For unlabeled plots:** No `qid` in QGIS CSV → no Organization link → no Almanakken data

---

## Step 1.13: Constructing Plantation Biographies

### What Is a Plantation Biography?

A **plantation biography** is the complete story of a plantation over time, combining:

1. **Spatial history** — how the land plot changed (mergers, splits)
2. **Organizational history** — ownership, management changes, absorption
3. **Demographic history** — enslaved population over time
4. **Agricultural history** — crops, production
5. **Physical history** — construction, abandonment (often unknown)

### Example: Geijersvlijt Biography Narrative

> **Geijersvlijt** (Wikidata Q4392658) is a plantation in Suriname.
>
> **Land History:**
>
> - In **1860**, there were two separate land plots: "Geijersvlijt" and "Kl. Suzanna'sdal"
> - By **1930**, these had merged into a single land plot labeled "Geijersvlijt" (fid 1619)
>
> **Organizational History:**
>
> - The organization **Suzanna'sdal** (Q131349015) was absorbed into **Geijersvlijt** (Q4392658)
> - Geijersvlijt continues as the surviving organization
>
> **Observations (from Almanakken):**
>
> - **1818**: Owner "J.C. Geyer", Director "J. Petsch", crop: coffee
> - **1820**: Owner "J. Janssen", Administrator "P. Pieters", 50 enslaved persons
> - ... (more observations linked via Q4392658 in `plantation_id` column)

### Constructing the Biography: Data Requirements

To tell a complete biography, we need:

| Component                  | Required Entities          | Required Links                                            |
| -------------------------- | -------------------------- | --------------------------------------------------------- |
| **Spatial history**        | Land Plots (1930 polygons) | `stm:mergedFrom`/`stm:mergedInto` (from label comparison) |
| **Organizational history** | Organizations (Q-IDs)      | `stm:absorbedInto`, `stm:partOf` (from Almanakken)        |
| **Land-Org connection**    | Qualified Links            | `stm:LandOrganizationLink` using `qid` from QGIS CSV      |
| **Demographic history**    | Observations               | `stm:OrganizationObservation` linked via `plantation_id`  |

### SPARQL Example: Retrieving a Plantation Biography

```sparql
PREFIX stm: <https://suriname-timemachine.org/vocab/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX crm: <http://www.cidoc-crm.org/cidoc-crm/>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX wd: <http://www.wikidata.org/entity/>

# Get all data for a plantation biography
SELECT ?component ?property ?value ?year ?source
WHERE {
  BIND(wd:Q4392658 AS ?org)  # Geijersvlijt

  {
    # Organization metadata
    BIND("Organization" AS ?component)
    ?org skos:prefLabel ?value .
    BIND("name" AS ?property)
  }
  UNION
  {
    # Land plots linked to this organization
    BIND("Land Plot" AS ?component)
    ?link a stm:LandOrganizationLink ;
          stm:organization ?org ;
          stm:landPlot ?plot ;
          stm:observedInYear ?year .
    ?plot stm:observedLabel ?value .
    BIND("linked plot" AS ?property)
  }
  UNION
  {
    # Land plot mergers
    BIND("Land History" AS ?component)
    ?link stm:organization ?org ;
          stm:landPlot ?plot .
    ?plot stm:mergedFrom ?earlierPlot .
    ?earlierPlot stm:observedLabel ?value .
    BIND("merged from" AS ?property)
  }
  UNION
  {
    # Observations over time
    BIND("Observation" AS ?component)
    ?obs a stm:OrganizationObservation ;
         stm:observationOf ?org ;
         stm:observationYear ?year ;
         stm:enslavedCount ?value .
    BIND("enslaved count" AS ?property)
  }
  UNION
  {
    # Absorbed organizations
    BIND("Organization History" AS ?component)
    ?absorbedOrg stm:absorbedInto ?org ;
                 skos:prefLabel ?value .
    BIND("absorbed" AS ?property)
  }
}
ORDER BY ?component ?year
```

### Biography Completeness by Data Source

| Data Source             | What It Adds to Biography                                                      |
| ----------------------- | ------------------------------------------------------------------------------ |
| **QGIS CSV (polygons)** | "In 1930, the plantation occupied this polygon..."                             |
| **QGIS CSV (labels)**   | "The 1930 map shows 'Geijersvlijt', the 1860 map showed 'Kl. Suzanna'sdal'..." |
| **QGIS CSV (qid)**      | "This is organization Q4392658 in Wikidata..."                                 |
| **Almanakken**          | "In 1818, owner was J.C. Geyer, director was J. Petsch, crop: coffee..."       |

### Gaps in the Biography

For any given plantation, we may have:

| Gap Type                | Cause                        | Impact                                   |
| ----------------------- | ---------------------------- | ---------------------------------------- |
| **No Q-ID in QGIS CSV** | Unlabeled polygon            | Can't link to Organization or Almanakken |
| **No observations**     | Q-ID not in Almanakken       | Can't show demographic/ownership history |
| **No 1860 label**       | `label_1860-79` column empty | Can't show land history before 1930      |
| **Uncertain links**     | Multiple Q-IDs (`qid_alt`)   | May need to track merged organizations   |

The model explicitly captures these gaps through:

- `stm:LabelStatus_Unlabeled` — no label, no org link possible
- `stm:Certainty_Uncertain` — link exists but confidence is low
- Absence of `stm:OrganizationObservation` — no Almanakken data

---

# Part 2: Naming the Plantation

## Step 2.1: The Naming Problem

Plantations have complex naming situations:

- **Multiple names over time** — "Meerzorg" might later be called "Jagtlust"
- **Multiple languages** — Dutch colonial names, Sranantongo names
- **Spelling variations** — "Tijgershol" vs "Tygerhol"
- **Current vs. historical** — Which name is "the" name?

**Example from Almanakken:**
| Year | plantation_org | plantation_std |
|------|----------------|----------------|
| 1820 | Tijgershol | Tygerhol |
| 1850 | Tygerhol | Tygerhol |

---

## Step 2.2: SKOS for Naming

**SKOS** (Simple Knowledge Organization System) provides:

- `skos:prefLabel` — the preferred label in a given language
- `skos:altLabel` — alternative labels (synonyms, historical variants)
- Language tags — `"Tygerhol"@nl`, `"..."@srn`

**Pattern:**

```turtle
wd:Q59115309
    skos:prefLabel "Tygerhol"@nl ;           # Current/standard Dutch name
    skos:prefLabel "..."@srn ;                # Sranantongo name (if known)
    skos:altLabel "Tijgershol"@nl ;           # Historical spelling variant
    skos:altLabel "Tyger-hol"@nl .            # Another variant
```

**Decision:**

- `skos:prefLabel` with `@nl` for the standardized Dutch name (from `plantation_std`)
- `skos:prefLabel` with `@srn` for the Sranantongo name (when available)
- `skos:altLabel` for historical variants (from `plantation_org` when different)

**Why not `rdfs:label` or `sdo:name`?**

- `rdfs:label` doesn't distinguish preferred vs. alternative
- `sdo:name` is fine for simple cases but SKOS provides richer semantics for historical name variants
- We CAN add `sdo:name` as well for Schema.org compatibility

---

## Step 2.3: Temporal Qualification of Names

**Problem:** A name might be valid only during a certain period.

**CIDOC-CRM approach:** Use `E41 Appellation` with temporal properties.

**Simpler approach for now:** Note the temporal context in a qualifier or keep names as simple labels, using the observation pattern (Part 4) to capture "in year X, the name was Y."

**Decision (for now):** Keep naming simple with SKOS labels. Temporal name changes will be captured through `stm:OrganizationObservation` entities (see Part 4).

---

# Part 3: Location and Spatial Data

## Step 3.1: The Location Problem

We have spatial data from:

1. **1930 plantation map** — georeferenced polygons in WGS84
2. **Future: other historical maps** — potentially different polygons

**Questions:**

- How do we attach a polygon to a plantation?
- How do we express that the polygon comes from a specific map?
- What if different maps show different boundaries?

---

## Step 3.2: GeoSPARQL for Geometry

**GeoSPARQL** is the OGC standard for representing spatial data in RDF.

In the three-entity model, geometry belongs to **Land Plots** (E53 Place), not to Organizations:

```turtle
@prefix geo: <http://www.opengis.net/ont/geosparql#> .
@prefix stm: <https://suriname-timemachine.org/vocab/> .
@prefix crm: <http://www.cidoc-crm.org/cidoc-crm/> .

# Geometry is on the Land Plot
stm:landplot/1930/geijersvlijt
    a crm:E53_Place, stm:LandPlot ;
    geo:hasGeometry [
        a geo:Geometry ;
        geo:asWKT "POLYGON((...coordinates...))"^^geo:wktLiteral
    ] .
```

**Properties:**

- `geo:hasGeometry` — links Land Plot to geometry
- `geo:asWKT` — Well-Known Text representation

---

## Step 3.3: CIDOC-CRM Location Properties

CIDOC-CRM provides nuanced location properties:

| Property                             | Meaning                                     |
| ------------------------------------ | ------------------------------------------- |
| `P53 has former or current location` | At some time, was located here              |
| `P54 has current permanent location` | Currently, this is its permanent location   |
| `P55 has current location`           | Currently located here (might be temporary) |
| `P156 occupies`                      | The place it physically occupies            |

**In the three-entity model:**

- **Land Plot** (E53 Place) — has geometry directly via `geo:hasGeometry`
- **Physical Site** (E24) — occupies a Land Plot via `P156 occupies`
- **Organization** — linked to Land Plot via `stm:LandOrganizationLink`

**Decision:** Use `crm:P156_occupies` linking Physical Site to Land Plot (which has the geometry).

```turtle
# Physical Site occupies a Land Plot
stm:site/geijersvlijt
    a crm:E24_Physical_Human-Made_Thing, stm:PlantationSite ;
    crm:P156_occupies stm:landplot/1930/geijersvlijt .

# Land Plot has the geometry
stm:landplot/1930/geijersvlijt
    a crm:E53_Place, stm:LandPlot ;
    geo:hasGeometry [
        a geo:Geometry ;
        geo:asWKT "POLYGON(...)"^^geo:wktLiteral
    ] .
```

---

## Step 3.4: Provenance of Spatial Data

**Problem:** The polygon comes from a specific historical map. We should record this.

**In the three-entity model:** Provenance is on the **Land Plot**, not on the Organization.

```turtle
# The Land Plot knows where it came from
stm:landplot/1930/geijersvlijt
    a crm:E53_Place, stm:LandPlot ;
    stm:fid "1619" ;
    stm:mapYear 1930 ;
    geo:hasGeometry [
        a geo:Geometry ;
        geo:asWKT "POLYGON(...)"^^geo:wktLiteral
    ] ;
    prov:wasDerivedFrom <map:1930_plantation_polygons> .

# The map source
<map:1930_plantation_polygons>
    a crm:E36_Visual_Item ;
    rdfs:label "1930 Plantation Map of Suriname (QGIS polygons)"@en .
```

**Decision:** Use `prov:wasDerivedFrom` on the Land Plot to indicate source map. The `stm:mapYear` property also indicates the temporal context.

---

# Part 4: Observations Over Time (Almanakken Pattern)

## Step 4.1: The Observation Problem

The Almanakken provide **annual snapshots** of organizational attributes:

- Year 1820: Owner = "J. Janssen", 50 enslaved persons
- Year 1830: Owner = "K. Kansen", 65 enslaved persons

These are **observations at a point in time**, not eternal truths.

**In the three-entity model:** Observations attach to **Organizations** (not Land Plots or Physical Sites) because they record ownership, administration, and population — organizational attributes.

---

## Step 4.2: OrganizationObservation Pattern

Following PICO's `PersonObservation` pattern, we create `stm:OrganizationObservation`:

```turtle
stm:OrganizationObservation
    a rdfs:Class ;
    rdfs:label "Organization Observation"@en ;
    rdfs:comment "A record of plantation organization attributes at a specific point in time, typically from Almanakken."@en .
```

**Structure:**

```turtle
@prefix stm: <https://suriname-timemachine.org/vocab/> .
@prefix wd: <http://www.wikidata.org/entity/> .
@prefix prov: <http://www.w3.org/ns/prov#> .

<obs:Q4392658_1820>
    a stm:OrganizationObservation ;
    stm:observationOf wd:Q4392658 ;         # The Organization (not Land Plot!)
    stm:observationYear 1820 ;               # When observed
    stm:observedName "Geijersvlijt" ;        # Name as recorded in source
    stm:hasOwner "J. Janssen" ;              # Owner at that time
    stm:hasAdministrator "P. Pieters" ;      # Administrator
    stm:hasDirector "A. Andersen" ;          # Director (on-site manager)
    stm:enslavedCount 50 ;                   # Total enslaved population
    stm:enslavedMale 25 ;                    # Male enslaved
    stm:enslavedFemale 20 ;                  # Female enslaved
    stm:enslavedChildren 5 ;                 # Children
    stm:hasProduct "sugar" ;                 # Crop type
    prov:hadPrimarySource <almanak:1820> .   # Source document
```

---

## Step 4.3: Linking Observations to Organization

**Inverse property (optional):**

```turtle
wd:Q4392658
    stm:hasObservation <obs:Q4392658_1820> ,
                       <obs:Q4392658_1830> .
```

This separates:

- **Time-invariant facts** (on Organization): type, Q-ID, canonical name
- **Time-varying facts** (on Observations): owners, administrators, population, crops
- **Spatial facts** (on Land Plots): geometry, mergers, splits

## Step 4.4: Observation URI Pattern

```
<obs:{QID}_{year}>     e.g., <obs:Q4392658_1820>
```

Or using Almanakken record ID:

```
<obs:{recordid}>       e.g., <obs:1820-28-1>
```

**Decision:** Use Q-ID + year for clarity when possible; fall back to recordid for complex cases.

---

# Part 5: Relationships Between Plantations

## Step 5.1: Split and Merge Problem

**In the three-entity model, we must distinguish:**

1. **Land Plot mergers/splits** — physical land being combined or divided
2. **Organization mergers/absorption** — legal entities being combined

These are related but not identical. Land can merge while organizations remain separate (or vice versa).

---

## Step 5.2: Land Plot Mergers and Splits

From Step 1.7, we use custom properties for land plot changes:

| Property         | Direction        | Meaning                                                |
| ---------------- | ---------------- | ------------------------------------------------------ |
| `stm:mergedFrom` | Result → Sources | "This plot was created by merging these earlier plots" |
| `stm:mergedInto` | Source → Result  | "This plot was merged into that later plot"            |
| `stm:splitFrom`  | Result → Source  | "This plot was split from that earlier plot"           |
| `stm:splitInto`  | Source → Results | "This plot was split into these later plots"           |

**Example: Geijersvlijt/Suzanna'sdal merger**

```turtle
# The 1930 merged plot
stm:landplot/1930/geijersvlijt
    a crm:E53_Place, stm:LandPlot ;
    stm:mergedFrom stm:landplot/1860/suzannasdal ,
                   stm:landplot/1860/geijersvlijt .

# The 1860 plots (now merged)
stm:landplot/1860/suzannasdal
    stm:mergedInto stm:landplot/1930/geijersvlijt .

stm:landplot/1860/geijersvlijt
    stm:mergedInto stm:landplot/1930/geijersvlijt .
```

---

## Step 5.3: Organization Absorption

When one plantation organization absorbs another:

```turtle
# Suzanna'sdal organization was absorbed into Geijersvlijt
wd:Q131349015  # Suzanna'sdal
    stm:absorbedInto wd:Q4392658 .  # Geijersvlijt
```

**Note:** `stm:absorbedInto` indicates the organization ceased to exist as a separate entity. The absorbing organization continues.

---

## Step 5.4: Organization Part-Whole (from Almanakken)

For the Almanakken `split` and `partof` columns describing organizational structure:

```turtle
# Organization A is composed of parts B and C (split column)
wd:Q59115309
    stm:hasParts wd:Q111111 , wd:Q222222 .

# Organization X is part of larger organization Y (partof column)
wd:Q333333
    stm:partOf wd:Q59115309 .
```

**Why not use CIDOC-CRM P46?** P46 is for physical composition (E18 Physical Thing). Organizations are not physical things in our model, so we use custom properties.

---

## Step 5.5: Organization Ownership by Another Organization

From Almanakken: `reference_std_id` — another plantation organization that **owns** this one.

```turtle
# In an observation, note that organization X is owned by organization Y
<obs:Q333333_1850>
    a stm:OrganizationObservation ;
    stm:observationOf wd:Q333333 ;
    stm:observationYear 1850 ;
    stm:ownedByOrganization wd:Q59115309 .  # Owned by this other plantation
```

**Why on Observation?** Ownership can change over time, so it belongs in the observation pattern, not as a permanent property on the Organization.

---

# Part 6: Identifiers

## Step 6.1: Identifier Strategy by Entity Type

**In the three-entity model, each entity type has different identifiers:**

### Land Plot Identifiers

| Identifier    | Purpose                             | Example                          |
| ------------- | ----------------------------------- | -------------------------------- |
| `stm:fid`     | QGIS feature ID (unique per map)    | `"1619"`                         |
| URI           | Constructed from year + name/fid    | `stm:landplot/1930/geijersvlijt` |
| `stm:mapYear` | Distinguishes same name across maps | `1930`                           |

### Organization Identifiers

| Identifier                   | Purpose                        | Example       |
| ---------------------------- | ------------------------------ | ------------- |
| Wikidata Q-ID                | Primary URI, global identifier | `wd:Q4392658` |
| (from QGIS CSV `qid` column) | Links polygon to organization  |               |

### Observation Identifiers

| Identifier                 | Purpose                                  | Example               |
| -------------------------- | ---------------------------------------- | --------------------- |
| URI                        | Constructed from Q-ID + year or recordid | `<obs:Q4392658_1818>` |
| Almanakken `recordid`      | Original source reference                | `"1818-28-6"`         |
| Almanakken `plantation_id` | Q-ID linking to organization             | `Q4392658`            |

---

## Step 6.2: Representing Identifiers

### Organization (Wikidata Q-ID as URI)

```turtle
# The Q-ID from QGIS CSV becomes the Organization URI
wd:Q4392658
    a sdo:Organization, stm:PlantationOrganization ;
    skos:prefLabel "Geijersvlijt"@nl .
```

### Land Plot (Constructed URI with fid)

```turtle
stm:landplot/1930/geijersvlijt
    a crm:E53_Place, stm:LandPlot ;
    stm:fid "1619" ;
    stm:mapYear 1930 .
```

### Observation (from Almanakken recordid)

```turtle
# Observation URI uses recordid from Almanakken
<obs:1818-28-6>
    a stm:OrganizationObservation ;
    stm:observationOf wd:Q4392658 ;  # Links to org via plantation_id column
    stm:observationYear 1818 .
```

**Decision:** Use Q-ID as the central linking key. It appears in both QGIS CSV (`qid`) and Almanakken (`plantation_id`).

---

# Part 7: Complete Example

## The Three-Entity Model in Turtle

This example shows the complete Geijersvlijt / Suzanna'sdal case with all three entities, links, and temporal changes:

```turtle
@prefix crm: <http://www.cidoc-crm.org/cidoc-crm/> .
@prefix geo: <http://www.opengis.net/ont/geosparql#> .
@prefix prov: <http://www.w3.org/ns/prov#> .
@prefix sdo: <https://schema.org/> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix stm: <https://suriname-timemachine.org/vocab/> .
@prefix wd: <http://www.wikidata.org/entity/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

# ══════════════════════════════════════════════════════════════════════════════
# LAND PLOTS (E53 Place) — from QGIS CSV
# ══════════════════════════════════════════════════════════════════════════════

# The 1930 merged land plot
stm:landplot/1930/geijersvlijt
    a crm:E53_Place, stm:LandPlot ;
    stm:fid "1619" ;
    stm:mapYear 1930 ;
    stm:observedLabel "Geijersvlijt"@nl ;
    skos:prefLabel "Geijersvlijt (1930 land plot)"@en ;
    geo:hasGeometry [
        a geo:Geometry ;
        geo:asWKT "POLYGON((563534.4 646616.5, 561412.9 647918.2, 561831.5 648651.8, 564047.8 647387.0, 563551.1 646710.6, 563534.4 646616.5))"^^geo:wktLiteral
    ] ;
    prov:wasDerivedFrom <map:1930_plantation_polygons> ;
    stm:mergedFrom stm:landplot/1860/suzannasdal ,
                   stm:landplot/1860/geijersvlijt .

# The 1860 Suzanna'sdal land plot (now merged)
stm:landplot/1860/suzannasdal
    a crm:E53_Place, stm:LandPlot ;
    stm:mapYear 1860 ;
    stm:observedLabel "Kl. Suzanna'sdal"@nl ;
    skos:prefLabel "Kl. Suzanna'sdal (1860 land plot)"@en ;
    prov:wasDerivedFrom <map:1860_plantation_map> ;
    stm:mergedInto stm:landplot/1930/geijersvlijt .

# The 1860 Geijersvlijt land plot (now merged)
stm:landplot/1860/geijersvlijt
    a crm:E53_Place, stm:LandPlot ;
    stm:mapYear 1860 ;
    stm:observedLabel "Geijersvlijt"@nl ;
    skos:prefLabel "Geijersvlijt (1860 land plot)"@en ;
    prov:wasDerivedFrom <map:1860_plantation_map> ;
    stm:mergedInto stm:landplot/1930/geijersvlijt .

# ══════════════════════════════════════════════════════════════════════════════
# PHYSICAL SITE (E24 Physical Human-Made Thing)
# ══════════════════════════════════════════════════════════════════════════════

stm:site/geijersvlijt
    a crm:E24_Physical_Human-Made_Thing, stm:PlantationSite ;
    skos:prefLabel "Geijersvlijt plantation site"@en ;
    crm:P2_has_type stm:PlantationStatus_Built ;
    crm:P156_occupies stm:landplot/1930/geijersvlijt .

# ══════════════════════════════════════════════════════════════════════════════
# ORGANIZATIONS (sdo:Organization)
# ══════════════════════════════════════════════════════════════════════════════

# Geijersvlijt organization (still exists)
wd:Q4392658
    a sdo:Organization, stm:PlantationOrganization ;
    sdo:additionalType wd:Q188913 ;
    skos:prefLabel "Geijersvlijt"@nl .

# Suzanna'sdal organization (absorbed into Geijersvlijt)
wd:Q131349015
    a sdo:Organization, stm:PlantationOrganization ;
    sdo:additionalType wd:Q188913 ;
    skos:prefLabel "Suzanna'sdal"@nl ;
    stm:absorbedInto wd:Q4392658 .

# ══════════════════════════════════════════════════════════════════════════════
# QUALIFIED LINKS (with certainty and evidence)
# ══════════════════════════════════════════════════════════════════════════════

# 1930: Geijersvlijt org operates on merged land plot
stm:link/1930/geijersvlijt_Q4392658
    a stm:LandOrganizationLink ;
    stm:landPlot stm:landplot/1930/geijersvlijt ;
    stm:organization wd:Q4392658 ;
    stm:linkType stm:LinkType_OperatedBy ;
    stm:linkCertainty stm:Certainty_Certain ;
    stm:observedInYear 1930 ;
    stm:linkEvidence "Label 'Geijersvlijt' on 1930 map matches Wikidata Q4392658" ;
    prov:wasDerivedFrom <map:1930_plantation_polygons> .

# 1860: Suzanna'sdal org operated on small plot
stm:link/1860/suzannasdal_Q131349015
    a stm:LandOrganizationLink ;
    stm:landPlot stm:landplot/1860/suzannasdal ;
    stm:organization wd:Q131349015 ;
    stm:linkType stm:LinkType_OperatedBy ;
    stm:linkCertainty stm:Certainty_Probable ;
    stm:observedInYear 1860 ;
    prov:wasDerivedFrom <map:1860_plantation_map> .

# ══════════════════════════════════════════════════════════════════════════════
# OBSERVATIONS (time-varying data from Almanakken)
# ══════════════════════════════════════════════════════════════════════════════

# From Almanakken record 1818-28-6 (year 1818, page 28, row 6)
<obs:1818-28-6>
    a stm:OrganizationObservation ;
    stm:observationOf wd:Q4392658 ;         # Links via plantation_id=Q4392658 in Almanakken
    stm:observationYear 1818 ;
    stm:observedName "Geyersvlijt" ;         # plantation_org column
    stm:hasOwner "J.C. Geyer." ;             # eigenaren column
    stm:hasDirector "J. Petsch" ;            # directeuren column
    stm:hasProduct "koffie" ;                # product_std column
    prov:hadPrimarySource <almanak:1818> .
```

---

# Decision Log

| #   | Decision                                           | Reasoning                                                                      | Alternatives Considered                                               |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| 1   | **Three separate entities** (Land, Site, Org)      | Enables plantation biographies, temporal changes, independent lifecycles       | Dual-typing single entity (rejected: can't model mergers/splits well) |
| 2   | E53 Place for Land Plots                           | Standard CIDOC-CRM for geographical extents; can have geometry                 | Custom class (less interoperable)                                     |
| 3   | E24 Physical Human-Made Thing for Physical Site    | Covers immovable human-made structures; occupies a place                       | E22 (movable only), E27 (too arbitrary)                               |
| 4   | sdo:Organization for legal entity                  | PICO compatibility for person links; has Wikidata Q-ID                         | crm:E74_Group (less Schema.org integration)                           |
| 5   | Qualified links with certainty                     | Capture confidence in land-organization relationships; enables provenance      | Simple direct properties (loses certainty/evidence)                   |
| 6   | E55 Type for status and certainty                  | CIDOC-CRM standard for classifications; definitions, multilingual, hierarchies | Simple strings (no validation, no definitions)                        |
| 7   | stm:mergedFrom / stm:mergedInto                    | Express land plot mergers over time; tells plantation biographies              | P46 is_composed_of (less clear temporal semantics)                    |
| 8   | stm:absorbedInto for organizations                 | Express organization mergers/acquisitions                                      | No link (loses historical continuity)                                 |
| 9   | URI pattern: `{year}/{name}` or `{year}/fid-{fid}` | Readable for labeled; fid fallback for unlabeled                               | fid only (less readable for labeled plots)                            |
| 10  | Wikidata Q-ID for Organization URI                 | Stable, globally unique, already assigned                                      | Custom URI (loses Wikidata linkage)                                   |
| 11  | SKOS for naming                                    | Preferred vs alternative labels, language tags                                 | rdfs:label (no preferred distinction)                                 |
| 12  | GeoSPARQL for geometry                             | OGC standard, wide tool support                                                | Custom properties (less interoperable)                                |
| 13  | OrganizationObservation pattern                    | Separates time-invariant from time-varying facts on organizations              | Direct properties (loses temporal context)                            |
| 14  | `stm:LabelStatus` vocabulary for land plots        | Explicitly marks labeled/unlabeled/illegible; enables filtering                | Infer from presence of `stm:observedLabel` (less explicit)            |
| 15  | Unlabeled plots have no Organization link          | Cannot identify organization without label; valid data, not an error           | Attempt uncertain links (rejected: too speculative)                   |
| 16  | Q-ID as the central linking key                    | QGIS CSV `qid` links to Org; Almanakken `plantation_id` is same Q-ID           | Name matching only (rejected: Q-ID already in data)                   |
| 17  | Plantation biography as combination of all sources | Unified narrative requires Land Plot + Organization + Observations             | Separate per-source views (rejected: loses holistic picture)          |
| 18  | Custom `stm:hasParts`/`stm:partOf` for orgs        | Organizations are not E18 Physical Thing, so P46 inappropriate                 | P46 is_composed_of (rejected: wrong domain)                           |
| 19  | Ownership-by-org in Observations                   | Ownership by another plantation can change over time                           | Direct property on Organization (rejected: loses temporal context)    |
| 20  | Geometry on Land Plot, not Organization            | Organizations don't have geometry; Land Plots do                               | Geometry on Organization (rejected: wrong entity type)                |
| 21  | **E22 Human-Made Object for physical sources**     | Maps, books, ledgers are physical artifacts that carry content                 | E73 Information Object (rejected: E73 is for abstract information)    |
| 22  | E38 Image -> P138 represents -> E22                | Digital scans represent the physical artifact they reproduce                   | P183i (rejected: not standard CIDOC-CRM property for this purpose)    |
| 23  | E12 Production + E52 Time-Span for creation        | Production events have time-spans; E22 doesn't directly have P4                | Direct P4 on E22 (rejected: wrong CIDOC-CRM domain)                   |
| 24  | E36 Visual Item -> E24/E26 -> E53 (not E36 -> E53) | "Maps depict things; things have locations" - visual content represents things | E36 -> E53 directly (rejected: conflates content with spatial extent) |
| 25  | **No emojis** in any files or diagrams             | Professional documentation; avoids encoding issues                             | Emojis for visual appeal (rejected: inconsistent rendering)           |
| 26  | erDiagram doesn't support %% comments              | Mermaid parser limitation; use YAML frontmatter instead                        | Keep comments (rejected: causes syntax errors)                        |

---

# Part 8: Universal Source Pattern

> **KEY INSIGHT:** All historical sources (maps, almanacs, slave registers, certificates) follow the same CIDOC-CRM pattern for connecting physical artifacts to the entities they document.

## Step 8.1: The Problem — How Do Sources Connect to Data?

When we extract data from a historical source, we need to model:

1. **The physical artifact** (the map, the book, the ledger)
2. **The content it carries** (cartography, tables, handwriting)
3. **What that content represents** (plantations, persons, organizations)
4. **Digital reproductions** (IIIF scans of the artifact)

### The Universal Pattern

```
E22 Human-Made Object ─── P128 carries ───> E36 Visual Item ─── P138 represents ───> E24/E26/E74/E21
(physical artifact)                         (content)                                (things depicted)
        ^
        |
E38 Image ─── P138 represents
(digital scan)
        |
        v
E12 Production ─── P4 has time-span ───> E52 Time-Span
(creation event)                         (when created)
```

See: [docs/models/universal-source-pattern.mmd](../../../docs/models/universal-source-pattern.mmd)

## Step 8.2: Why E22 Human-Made Object (NOT E73 Information Object)?

**Decision:** Use **E22 Human-Made Object** for maps, books, ledgers — NOT E73 Information Object.

### CIDOC-CRM Class Definitions

| Class                      | Definition                                           | Examples                                         |
| -------------------------- | ---------------------------------------------------- | ------------------------------------------------ |
| **E22 Human-Made Object**  | Physical objects purposely created by human activity | Maps, books, coins, paintings                    |
| **E73 Information Object** | Identifiable immaterial items (abstract content)     | A poem, a musical composition, a database schema |

### The Key Distinction

- **E22** = The physical thing you can touch (the paper map in the archive)
- **E73** = The abstract information (the idea/content independent of any carrier)

A historical map is primarily a **physical artifact**:

- It has a location (in an archive)
- It was produced at a specific time
- It can be damaged, restored, digitized
- It carries visual content (E36)

The **content** the map carries is modeled separately as E36 Visual Item.

## Step 8.3: The Source Chain

```turtle
# The physical artifact (map, book, ledger)
stm:source/map-1930
    a crm:E22_Human-Made_Object ;
    crm:P2_has_type stm:DocType_HistoricMap ;
    crm:P102_has_title "Kaart van Suriname 1930" ;
    crm:P50_has_current_keeper <archive:nationaal-archief> ;
    crm:P128_carries stm:visual/map-1930-content .

# The visual content the artifact carries
stm:visual/map-1930-content
    a crm:E36_Visual_Item ;
    crm:P138_represents stm:plantation/geijersvlijt ;  # depicts this plantation
    crm:P138_represents stm:feature/suriname-river .   # depicts this river

# Digital reproduction (IIIF scan)
stm:scan/map-1930-iiif
    a crm:E38_Image ;
    crm:P138_represents stm:source/map-1930 ;  # represents the physical map
    stm:iiifInfoUrl "https://example.org/iiif/map-1930/info.json" .

# Production event with time-span
stm:production/map-1930
    a crm:E12_Production ;
    crm:P108_has_produced stm:source/map-1930 ;
    crm:P14_carried_out_by stm:person/cartographer-xyz ;
    crm:P4_has_time-span stm:timespan/1930 .

stm:timespan/1930
    a crm:E52_Time-Span ;
    crm:P82a_begin_of_the_begin "1930-01-01"^^xsd:date ;
    crm:P82b_end_of_the_end "1930-12-31"^^xsd:date .
```

## Step 8.4: Location Principle — "Maps Depict Things; Things Have Locations"

**CRITICAL:** E36 Visual Item does NOT connect directly to E53 Place.

### Wrong Pattern (DO NOT USE)

```turtle
# WRONG: E36 directly to E53
stm:visual/map-1930-content
    crm:P138_represents stm:place/geijersvlijt .  # NO!
```

### Correct Pattern

```turtle
# CORRECT: E36 -> E24/E26 -> E53
stm:visual/map-1930-content
    crm:P138_represents stm:plantation/geijersvlijt .  # depicts the plantation

stm:plantation/geijersvlijt
    a crm:E24_Physical_Human-Made_Thing ;
    crm:P53_has_former_or_current_location stm:place/fid-1619 .  # plantation has location
```

### Why This Matters

1. **Semantic accuracy:** The map depicts a plantation, not a location. The plantation has a location.
2. **Query correctness:** "What plantations are depicted on this map?" vs "What locations?"
3. **Provenance chain:** We can trace: Map -> depicts -> Plantation -> located at -> Place

## Step 8.5: Applying to Different Source Types

| Source Type           | E22 Instance          | E36 Content          | P138 represents                    |
| --------------------- | --------------------- | -------------------- | ---------------------------------- |
| **Historic Map**      | Physical map sheet    | Cartographic content | E24 (plantations), E26 (rivers)    |
| **Almanac**           | Physical almanac book | Tabular data         | E74 (organizations)                |
| **Slave Register**    | Physical ledger       | Handwritten entries  | E21 (persons), E74 (organizations) |
| **Birth Certificate** | Physical document     | Handwritten text     | E21 (persons)                      |

---

# Part 9: Formatting and Technical Guidelines

## Step 9.1: No Emojis

**Rule:** Never use emojis in any files, diagrams, code, or documentation in this project.

**Reasoning:**

- Professional documentation standards
- Avoids encoding issues across different systems
- Consistent rendering in all environments
- Some tools (PDF generators, terminal outputs) handle emojis poorly

## Step 9.2: Mermaid Diagram Syntax

### erDiagram Limitations

**Issue:** Mermaid `erDiagram` does NOT support `%%` comments.

```mermaid
erDiagram
    %% This will cause a syntax error!
    ENTITY {
        string id PK
    }
```

**Solution:** Use YAML frontmatter for metadata, or remove comments entirely.

```mermaid
---
title: My ER Diagram
config:
  theme: base
---
erDiagram
    ENTITY {
        string id PK
    }
```

### flowchart Comments

`flowchart` diagrams DO support `%%` comments:

```mermaid
flowchart TB
    %% This comment is valid in flowcharts
    A --> B
```

## Step 9.3: Diagram File Conventions

| Diagram Type                    | File Location | Purpose                         |
| ------------------------------- | ------------- | ------------------------------- |
| `universal-source-pattern.mmd`  | docs/models/  | How sources connect to entities |
| `three-entity-model.mmd`        | docs/models/  | Main conceptual ER diagram      |
| `postgres-schema.mmd`           | docs/models/  | Database implementation         |
| `map-observation-pattern.mmd`   | docs/models/  | Map-specific observation flow   |
| `data-source-mapping.mmd`       | docs/models/  | CSV columns to entities         |
| `organization-pico-pattern.mmd` | docs/models/  | Organization to PICO connection |

---

# Future Extensions (Out of Scope for Now)

- **Person-Organization relationships** — `sdo:affiliation`, `isEnslavedBy`, `isEnslaverOf` on organizations
- **Lifecycle events** — E12 Production (site construction), E6 Destruction (abandonment)
- **Temporal name changes** — E41 Appellation with time-spans
- **Multiple map sources** — handling conflicting geometries from different maps
- **Product types** — coffee, sugar, etc. as E55 Types
- **LandPlotObservation** — for time-varying attributes of land plots
- **Unlabeled plot identification** — comparing geometry to earlier maps to identify organizations
- **Land use classification** — categorizing unlabeled plots (abandoned, government, forest, etc.)

---

# Validation Checklist

When creating or modifying plantation data:

## Land Plot (E53 Place)

- [ ] Has `crm:E53_Place` and `stm:LandPlot` types
- [ ] Has `stm:fid` from QGIS CSV
- [ ] Has `stm:mapYear` indicating source map year
- [ ] Has `stm:labelStatus` (`Labeled`, `Unlabeled`, or `Illegible`)
- [ ] If labeled: has `stm:observedLabel` with label from map
- [ ] If labeled: URI uses `stm:landplot/{year}/{name-slug}`
- [ ] If unlabeled: URI uses `stm:landplot/{year}/fid-{fid}`
- [ ] Has `geo:hasGeometry` with `geo:asWKT` polygon
- [ ] Has `prov:wasDerivedFrom` linking to source map
- [ ] Has `stm:mergedFrom`/`stm:mergedInto` if applicable

## Physical Site (E24)

- [ ] Has `crm:E24_Physical_Human-Made_Thing` and `stm:PlantationSite` types
- [ ] Has `crm:P2_has_type` with `stm:PlantationStatus_*` value
- [ ] Has `crm:P156_occupies` linking to a Land Plot

## Organization (sdo:Organization)

- [ ] Uses Wikidata Q-ID as URI (`wd:Qxxxxxxx`) — from QGIS CSV `qid` column
- [ ] Has `sdo:Organization` and `stm:PlantationOrganization` types
- [ ] Has `sdo:additionalType wd:Q188913`
- [ ] Has `skos:prefLabel` with `@nl` language tag — from Almanakken `plantation_std`
- [ ] Has `stm:absorbedInto` if organization was absorbed (from Almanakken `partof`)

## Qualified Links

- [ ] Has `stm:LandOrganizationLink` type
- [ ] Has `stm:landPlot` and `stm:organization` properties
- [ ] Has `stm:linkType` (OperatedBy, OwnedBy, ClaimedBy)
- [ ] Has `stm:linkCertainty` (Certain, Probable, Uncertain)
- [ ] Has `prov:wasDerivedFrom` indicating source
