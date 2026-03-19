# Archive: Conceptual Thinking and Design Rationale

> This document preserves the detailed reasoning and philosophical discussions from earlier iterations of the data model. Some concepts here (like the "three-entity model") have been superseded by the current E24-centric model. For the active reference, see [SKILL.md](SKILL.md).

> **SUPERSEDED**: The "three-entity model" (Land Plot, Physical Site, Organization) described in Parts A-E has been replaced. The current model uses **E24 Plantation as the main entity**, with E53 Place as its location property and E74/sdo:Organization as operator. See [universal-source-pattern.mmd](../../../docs/models/universal-source-pattern.mmd).

---

# Part A: What Is a Plantation? (Historical Discussion)

## The Conceptual Challenge

A "plantation" is surprisingly hard to define:

- Is it a piece of land? (geographical entity)
- Is it buildings and infrastructure? (physical structures)
- Is it a business or organization? (economic/legal entity)
- Is it all of the above?

Historical sources use "plantation" to mean different things:

| Source Type         | What "Plantation" Means                         |
| ------------------- | ----------------------------------------------- |
| **Historical map**  | A labeled polygon — the land itself             |
| **Almanakken**      | An organization with owners and administrators  |
| **Slave registers** | A location where enslaved persons were recorded |
| **Modern Wikidata** | An organizational entity (Q-ID)                 |

## The Key Insight: Separation of Concerns

These are three different things that happen to share a name:

1. **Land** — exists before, during, and after the plantation enterprise
2. **Physical structures** — built on the land, can be destroyed/abandoned
3. **Organization** — legal/economic entity that operates the plantation

### Why Dual-Typing Doesn't Work

Consider: "Kl. Suzanna'sdal" and "Geijersvlijt" were separate land plots in 1860, but merged into one "Geijersvlijt" by 1930.

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

---

# Part B: Why CIDOC-CRM?

**Why not just use Schema.org or a custom ontology?**

1. **Temporal sophistication:** CIDOC-CRM is designed for cultural heritage with complex temporal relationships. Properties like P2 has type, P156 occupies, and the E55 Type pattern let us express nuanced classifications.

2. **Provenance built-in:** CIDOC-CRM has native patterns for documenting where information comes from (E73 Information Object, P70 documents).

3. **Community adoption:** Archives, museums, and digital humanities projects worldwide use CIDOC-CRM. This makes our data more interoperable.

4. **PICO compatibility:** The PICO model for Dutch historical persons uses CIDOC-CRM. Since we link enslaved persons to plantations, alignment is essential.

**Why Schema.org for Organizations?**

PICO uses `sdo:Organization` for organizational entities. Using the same class allows direct linking of persons to organizations via `sdo:affiliation` and related properties. We don't lose CIDOC-CRM benefits — we just use Schema.org where PICO requires it.

---

# Part C: Why E53 Place for Land Plots?

From the CIDOC-CRM specification:

> **E53 Place** comprises extents in the natural space we live in, in particular on the surface of the Earth, in the pure sense of physics: independent from temporal phenomena and matter.

Key properties:

- Places are **immovable** — they are parts of the Earth's surface
- Places have **fuzzy boundaries** in reality, but we define them precisely from maps
- Places can **overlap** or be **contained within** other places

### E53 Place and Ownership

**E53 Place** is NOT a subclass of E72 Legal Object in CIDOC-CRM. However:

- Land plots CAN be subject to legal ownership in reality
- We can express this through **P52 has current owner** (domain: E18 Physical Thing)
- E53 Place is a subclass of E18 Physical Thing, so it inherits P52

**Resolution:** A land plot (E53 Place) can have owners via P52, even though it's not formally typed as E72 Legal Object.

---

# Part D: Why E24 for Physical Sites?

From the specification:

> **E24 Physical Human-Made Thing** comprises all persistent physical items of any size that are purposely created by human activity.

This class:

- Covers **immovable** things (unlike E22 which implies movable)
- Is created through an **E12 Production** event
- Can be destroyed through an **E6 Destruction** event
- **Occupies** a place via **P156 occupies**

---

# Part E: Why Qualified Links with Certainty?

We can't just say:

```turtle
wd:Q4392658 stm:operatesAt stm:landplot/1930/geijersvlijt .
```

Because:

1. **Certainty varies** — How sure are we that this organization owned this land?
2. **Temporal scope** — When did this relationship hold?
3. **Evidence** — What source tells us this?

The solution is to create a **separate entity** for the link itself, which can carry certainty, temporal scope, and provenance information.

---

# Part F: Why E55 Type for Classifications?

CIDOC-CRM's E55 Type pattern provides:

- Defined vocabularies with explicit definitions
- Multilingual labels
- Hierarchical structure (broader/narrower)
- Validation possibilities

**When to use E55 Type:**

| Use E55 Type for...                       | Use simple properties for... |
| ----------------------------------------- | ---------------------------- |
| Classifications with defined vocabularies | Free-text descriptions       |
| Status values that need definitions       | Numeric measurements         |
| Categories that might form hierarchies    | Unique identifiers           |
| Terms that need multilingual labels       | Boolean flags                |

---

# Part G: Why E22 Human-Made Object for Sources (NOT E73)?

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

---

# Part H: Why "Maps Depict Things; Things Have Locations"?

**CRITICAL:** E36 Visual Item does NOT connect directly to E53 Place.

### Why This Matters

1. **Semantic accuracy:** The map depicts a plantation, not a location. The plantation has a location.
2. **Query correctness:** "What plantations are depicted on this map?" vs "What locations?"
3. **Provenance chain:** We can trace: Map -> depicts -> Plantation -> located at -> Place

### Wrong Pattern

```
E36 Visual Item -> P138 represents -> E53 Place  (NO!)
```

### Correct Pattern

```
E36 Visual Item -> P138 represents -> E24 Physical Thing -> P53 has location -> E53 Place
```

---

# Part I: Why SKOS for Naming?

Plantations have complex naming situations:

- **Multiple names over time** — "Meerzorg" might later be called "Jagtlust"
- **Multiple languages** — Dutch colonial names, Sranantongo names
- **Spelling variations** — "Tijgershol" vs "Tygerhol"
- **Current vs. historical** — Which name is "the" name?

**SKOS** (Simple Knowledge Organization System) provides:

- `skos:prefLabel` — the preferred label in a given language
- `skos:altLabel` — alternative labels (synonyms, historical variants)
- Language tags — `"Tygerhol"@nl`, `"..."@srn`

**Why not `rdfs:label` or `sdo:name`?**

- `rdfs:label` doesn't distinguish preferred vs. alternative
- `sdo:name` is fine for simple cases but SKOS provides richer semantics for historical name variants
- We CAN add `sdo:name` as well for Schema.org compatibility

---

# Part J: Why GeoSPARQL?

**GeoSPARQL** is the OGC standard for representing spatial data in RDF.

- Wide tool support across GIS and RDF platforms
- Standard properties: `geo:hasGeometry`, `geo:asWKT`
- Spatial query capabilities (intersection, contains, etc.)

Custom properties would be less interoperable with existing tools.

---

# Part K: Why OrganizationObservation Pattern?

The Almanakken provide **annual snapshots** of organizational attributes:

- Year 1820: Owner = "J. Janssen", 50 enslaved persons
- Year 1830: Owner = "K. Kansen", 65 enslaved persons

These are **observations at a point in time**, not eternal truths.

Following PICO's `PersonObservation` pattern, we separate:

- **Time-invariant facts** (on Organization): type, Q-ID, canonical name
- **Time-varying facts** (on Observations): owners, administrators, population, crops

This avoids losing temporal context when properties change over time.

---

# Part L: Why Custom Properties for Mergers (not P46)?

For organization part-whole relationships:

**Why not use CIDOC-CRM P46?** P46 is for physical composition (E18 Physical Thing). Organizations are not physical things in our model, so we use custom properties: `stm:hasParts`, `stm:partOf`, `stm:absorbedInto`.

---

# Part M: Unlabeled Land Plots — Why Valid, Not Error?

Not all land plots on the 1930 map have labels:

- **~1,598 total rows** in plantation_polygons_1930.csv
- **100+ rows** have only `fid` and `coords` — no `label_1930`, no `qid`

### This is Valid Data

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

---

# Part N: Why Q-ID as Central Linking Key?

The Q-ID appears in both primary data sources:

1. **QGIS CSV** — `qid` column directly identifies the Organization
2. **Almanakken** — `plantation_id` column is the same Q-ID

This provides a direct, unambiguous link between spatial data and historical observations without relying on fuzzy name matching.

---

# Part O: Plantation Biographies — The Goal

A **plantation biography** is the complete story of a plantation over time, combining:

1. **Spatial history** — how the land plot changed (mergers, splits)
2. **Organizational history** — ownership, management changes, absorption
3. **Demographic history** — enslaved population over time
4. **Agricultural history** — crops, production
5. **Physical history** — construction, abandonment (often unknown)

### Example Narrative

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

### Biography Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PLANTATION BIOGRAPHY                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                     ▲
                                     │ combines
        ┌────────────────────────────┼────────────────────────────────────────┐
        │                            │                                        │
        ▼                            ▼                                        ▼
┌───────────────┐          ┌─────────────────┐          ┌─────────────────────┐
│  LAND PLOT    │◄─────────│  ORGANIZATION   │◄─────────│    OBSERVATIONS     │
│  (geometry)   │   qid    │  (wd:Qxxxxx)    │   qid    │    (annual data)    │
└───────────────┘          └─────────────────┘          └─────────────────────┘
        ▲                            ▲                            ▲
        │                            │                            │
        │                      (Q-ID is the                       │
        │                       linking key)                      │
        │                            │                            │
┌───────┴────────────────────────────┴────────────────────────────┴───────────┐
│                              QGIS CSV                                       │
│         (fid, coords, label_1930, label_1860-79, qid, qid_alt)              │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                    Almanakken CSV   │
              (recordid, year, plantation_id=Q-ID, eigenaren, ...)
```

---

# Part P: Future Extensions (Out of Scope)

- **Person-Organization relationships** — `sdo:affiliation`, `isEnslavedBy`, `isEnslaverOf` on organizations
- **Lifecycle events** — E12 Production (site construction), E6 Destruction (abandonment)
- **Temporal name changes** — E41 Appellation with time-spans
- **Multiple map sources** — handling conflicting geometries from different maps
- **Product types** — coffee, sugar, etc. as E55 Types
- **LandPlotObservation** — for time-varying attributes of land plots
- **Unlabeled plot identification** — comparing geometry to earlier maps to identify organizations
- **Land use classification** — categorizing unlabeled plots (abandoned, government, forest, etc.)
