# Data Model Evolution

Step-by-step record of every modeling decision, change, and planned extension. Each step explains _what_ changed, _why_, and _what it enables_.

---

## Phase 1: Foundation (completed)

### Step 1.1 -- E25 Plantation as central entity

**What:** E25 Human-Made Feature is the main entity. All sources ultimately depict plantations.

**Why:** A plantation is a physical thing in the world -- it has a location, it appears on maps, it has a name. This is the anchor that connects all datasets. CIDOC-CRM E25 is the correct class because plantations are human-made landscape features (subclass of both E24 and E26).

**Enables:** Every source (map, almanac, register) can connect to the same E25 instance.

### Step 1.2 -- E53 Place for location/geometry

**What:** E25 has location via `P53 has former or current location` to E53 Place, which carries GeoSPARQL geometry.

**Why:** "Maps depict things; things have locations." The map does NOT depict the location directly -- it depicts the plantation, and the plantation has a location. This prevents treating the map polygon as the "real" location.

**Enables:** Multiple geometries per plantation (from different map years). Answering: _where was plantation X?_ (L01), _what boundary did plantation X have in year Y?_ (L04).

### Step 1.3 -- E22 Human-Made Object for sources

**What:** Physical sources (maps, books, ledgers) are E22 Human-Made Object. They carry content via `P128 carries` E36 Visual Item. Digital scans are also E36 Visual Item that `P138 represents` the E22.

**Why:** A colonial map is a physical artifact, not just "information." Modeling it as E22 preserves its materiality (who made it, where it is kept, when it was produced). E36 is what the map _shows_ (the cartographic content), and that content represents E25 plantations.

**Enables:** Full provenance chain. Answering: _who created source X?_ (S02), _where is source X held?_ (S04), _what maps show place X?_ (L06).

---

## Phase 2: Entity separation (completed)

### Step 2.1 -- E74 Organization as separate entity from E25

**What:** The legal/social entity operating a plantation (E74 Group) is a separate entity from the physical plantation (E25). They are linked by `P52 has current owner` (E25 -> E74).

**Why:** "Geijersvlijt" the coffee plantation (physical thing with soil and buildings) is not the same as "Geijersvlijt" the organization (legal entity with owners, administrators, enslaved people). Organizations can be absorbed, merged, or transferred independently of the physical land. Keeping them separate allows tracking organizational changes (ownership transfers, mergers) independently of physical changes (boundary shifts, building construction).

**Alternative rejected:** Dual-typing a single entity as both E25 and E74. This conflates two distinct things and makes it impossible to say "the organization changed owners but the plantation stayed the same."

**Enables:** Tracking ownership transfers over time. Answering: _who owned plantation X in year Y?_ (L03), _trace organizational mergers_ (temporal changes section).

### Step 2.2 -- P52 has current owner (not custom operatedBy)

**What:** Use standard CIDOC-CRM `P52 has current owner` and `P51 has former or current owner` to connect E25 to E74, instead of a custom `operatedBy` property.

**Why:** P52 is the correct CIDOC-CRM property for this relationship (E18 Physical Thing -> E39 Actor). Using standard properties means interoperability with other CIDOC-CRM datasets and no need to maintain custom vocabulary documentation.

**Enables:** Standard CIDOC-CRM queries. Other projects can understand the relationship without reading our custom vocabulary.

### Step 2.3 -- Q-ID as linking key

**What:** Wikidata Q-IDs are the primary identifier for E74 organizations (`wd:Q4392658`). Both QGIS CSV (`qid` column) and Almanakken CSV (`plantation_id` column) use Q-IDs to refer to the same organization.

**Why:** Q-IDs are stable, globally unique, and already assigned for most Surinamese plantations. They provide a ready-made bridge between our two main datasets. Using `wd:` URIs directly means our data links to the broader Wikidata knowledge graph.

**Enables:** Joining QGIS polygons to Almanakken observations. Answering: cross-source linking queries (X06).

---

## Phase 3: Names as first-class entities (completed)

### Step 3.1 -- E41 Appellation for names

**What:** Plantation/organization names are modeled as E41 Appellation entities, not just string literals on `skos:prefLabel`. Each E41 has `P190 has symbolic content` (the actual text), `P72 has language`, and `P128i is carried by` (the source that records it).

**Why:** Names are not simple attributes -- they change over time, vary by source, have variant spellings, and come from specific documents. Modeling them as entities allows tracking name provenance: _this name comes from this map, that variant comes from that almanac_.

**Enables:** Answering: _what was plantation X called in year Y?_ (L02), _how did place name change over time?_ (L07), _find same person with different name spellings_ (X07).

### Step 3.2 -- Each source creates its own E41 (distinct per entity type)

**What:** A map label creates an E41 that identifies the plantation (E25). An almanac entry creates a different E41 that identifies the organization (E74). These are distinct E41 instances linked by `P139 has alternative form`.

```
E22 Map 1930 --P128 carries--> E41a "Geijersvlijt" --P1i identifies--> E25 Plantation
E22 Almanac 1818 --P128 carries--> E41b "Geyers-Vlijt" --P1i identifies--> E74 Organization
E41a --P139 has alternative form--> E41b
```

**Why:** A map label (printed cartography) and an almanac entry (handwritten table) are fundamentally different source contexts. The map label names the physical thing visible on the map. The almanac names the organization listed in an administrative record. They happen to refer to "the same plantation" in everyday language, but in CIDOC-CRM they identify different entity types. The P139 link makes the connection explicit without conflating the two.

**Alternative rejected:** Shared E41 instance with P1 pointing to both E25 and E74. This would lose the distinction between what the map names vs what the almanac names.

**Enables:** Precise provenance: you can ask _where did this name come from?_ and get "the 1930 map" vs "the 1818 almanac." Answering: name variant tracking across sources.

### Step 3.3 -- skos:prefLabel kept as display convenience

**What:** `skos:prefLabel` is retained on E25 and E74 as a simple display label alongside the formal E41 chain.

**Why:** Not every query needs to traverse E41 -> P190 just to show a name. For UI display, SPARQL result labels, and quick lookups, a simple `skos:prefLabel` is practical. The formal E41 chain is for provenance and name history; prefLabel is for convenience.

---

## Phase 4: Observations (completed)

### Step 4.1 -- OrganizationObservation for time-varying data

**What:** Each Almanakken row becomes an `E13 Attribute Assignment` with `P140 assigned attribute to` pointing to E74 (via Q-ID) and `P4 has time-span` from the `year` column.

**Why:** The Almanakken contain ~22,000 annual snapshots. Each row is an observation at a point in time, not a permanent fact. The plantation named "Geijersvlijt" had different owners, different numbers of enslaved people, and different products in different years. The observation pattern preserves this temporal dimension.

**Enables:** Answering: _count enslaved people at plantation X over time_ (A01), _who owned plantation X in year Y_ (L03), _track changes in products_ over time.

### Step 4.2 -- PICO PersonObservation for people

**What:** Person names from `eigenaren`, `administrateurs`, `directeuren` columns create PICO PersonObservations with roles (`picot:owner`, `picot:administrator`, `picot:director`).

**Why:** The same person appears across multiple almanac years, often with different spelling. PICO separates the raw observation ("J.C. Geyer" in the 1818 almanac) from the reconstructed identity (the historical person Johann Christian Geyer). This is the standard approach in historical person linking.

**Enables:** Answering: person queries (P01-P17), cross-source linking (X01-X08).

---

## Phase 5: Structural relationships (TO DO)

### Step 5.1 -- Plantation mergers and splits (has_parts / part_of)

**What:** Map Almanakken `split1_id`..`split5_id` and `part_of_id` columns to structural relationships between E74 organizations and/or E25 plantations.

**CSV columns involved:**

- `split1_lab`, `split1_id` .. `split5_lab`, `split5_id` -- plantations that have been merged into this one (this plantation "has parts")
- `partof_lab`, `part_of_id` -- this plantation is part of a larger merged combination

**Rationale:** These columns capture a critical part of Surinamese plantation history -- mergers, splits, and absorptions. The SKILL.md models `P99i was dissolved by` (E68 Dissolution) and `P124i was transformed by` (E81 Transformation) but doesn't map _which CSV columns_ drive this. Without this mapping, a significant part of the plantation network is invisible.

**Modeling approach (proposed):**

```
E74 (split1_id) --P99i was dissolved by--> E68 Dissolution --P14 carried out by--> E74 (plantation_id)   [has parts]
E74 (plantation_id) --P107i is member of--> E74 (part_of_id) [part of larger combination]
```

Using `P107i is current or former member of` (CIDOC-CRM standard for group membership) rather than a custom `partOf` property. When a plantation organization becomes part of a larger merged combination, it is organizational membership -- one E74 group belongs to a larger E74 group.

**Enables:** Answering: plantation network reconstruction, understanding why PSUR IDs may link to a component plantation rather than the combined one.

### Step 5.2 -- Reference/ownership plantations

**What:** Map `reference_std_id` / `reference_std_lab` to a relationship showing that another plantation owns or references this one.

**CSV columns involved:**

- `reference_std_id` -- Q-ID of the owning/referencing plantation
- `reference_std_lab` -- label of that plantation
- `reference_org` -- raw original text (not priority)

**Rationale:** Some almanac entries say "see Plantation X" or indicate that plantation A is owned by plantation B. This is an inter-plantation reference network that can help in linking when direct matches are not available.

**Modeling approach (proposed):**

```
E74 (plantation_id) --crm:P67_refers_to--> E74 (reference_std_id)
```

**Enables:** Following reference chains for linking. If plantation A has no direct PSUR link, but its reference plantation B does, we can trace the path.

### Step 5.3 -- PSUR ID as cross-dataset link

**What:** Map `psur_id` from both QGIS CSV and Almanakken CSV as a linking identifier to the slave emancipation registers (dataset 05).

**CSV columns involved:**

- QGIS: `psur_id`, `psur_id2`, `psur_id3` (multiple PSUR IDs per polygon because of mergers)
- Almanakken: `psur_id`

**Rationale:** PSUR IDs are the bridge to the slave and emancipation register dataset (~35,000 records). Without this mapping, dataset 05 is disconnected. Multiple PSUR IDs per QGIS polygon exist because merged plantations retain the component plantations' PSUR IDs.

**Important caveats about PSUR IDs:**

- PSUR is a **modern identifier** created by researchers, not a historical one. It was not used by the people in the records.
- The assignment has **known flaws** -- some PSUR IDs are incorrectly matched, some plantations lack IDs, and merger/split histories create ambiguities about which component plantation a PSUR ID refers to.
- PSUR IDs alone are **not sufficient for reliable linking**. They should always be cross-checked against standardized plantation/organization names (`plantation_std` in Almanakken, `plantation_label` in QGIS) to validate the match.
- Think of PSUR as a **hint**, not a ground truth. The combination of PSUR ID + name matching + Q-ID provides a more robust link.

**Decision (resolved):** PSUR ID identifies the **E74 organization**, not E25. The slave registers list enslaved people under organizations (the legal entity that "owned" them). The fact that QGIS CSV also carries PSUR IDs on polygons is a convenience shortcut -- the PSUR conceptually points through E25 -> P52 -> E74.

**Modeling approach:**

```
E74 (organization) --skos:closeMatch--> psur:{PSUR_ID}
```

Using `skos:closeMatch` (not `owl:sameAs` or `skos:exactMatch`) because the match is approximate and researcher-assigned, not authoritative. The PSUR dataset is a different conceptualization of "plantation" that may not align perfectly with our E74 entities.

**Enables:** Answering: _who was enslaved at plantation X in year Y_ (P01), _link manumission record to slave register entry_ (X04).

### Step 5.4 -- qid_alt for merged/split identity

**What:** Map QGIS `qid_alt` column to capture alternative Q-IDs for the same polygon (typically from a merged or absorbed plantation).

**CSV columns involved:**

- QGIS: `qid_alt`

**Rationale:** Some QGIS polygons represent merged plantations. The main `qid` is the surviving entity, but `qid_alt` is the absorbed entity's Q-ID. Example: fid 1619 has `qid=Q4392658` (Geijersvlijt) and `qid_alt=Q131349015` (Kl. Suzanna'sdal), with `label_1860-79=Kl. Suzanna'sdal`.

**Modeling approach (proposed):**

```
E25 polygon --P52--> E74 (qid, primary org)
E25 polygon --P51--> E74 (qid_alt, former org, now absorbed)
E74 (qid_alt) --P99i was dissolved by--> E68 Dissolution --P14 carried out by--> E74 (qid)
```

**Enables:** Tracing plantation identity through mergers. Answering: _link plantation across maps from different years_ (X06).

---

## Phase 6: Observation enrichment (TO DO)

### Step 6.1 -- Product type on observations

**What:** Map `product_std` to `P141 assigned` (E55 Type) on E13 Attribute Assignment.

**Already in:** SKILL.md Observation properties. **Missing from:** CSV mapping table.

**Rationale:** Products (koffie, suiker, katoen, cacao, hout) change over time. This is already modeled conceptually but not mapped to the CSV column. Straightforward addition.

**Enables:** Answering: _what was produced at plantation X in year Y?_, tracking agricultural transitions.

### Step 6.2 -- Deserted flag

**What:** Map `deserted` to `P141 assigned` (E55 Type: deserted status) on E13 Attribute Assignment.

**Already in:** three-entity-model.mmd (`is_deserted` on OBSERVATION). **Missing from:** SKILL.md CSV mapping.

**Rationale:** Many almanac entries simply say "verlaten" (deserted). This is a key status indicator that tells us when plantations ceased operations.

**Enables:** Answering: _when was plantation X abandoned?_, filtering active vs abandoned plantations per year.

### Step 6.3 -- Location standardized

**What:** Map `loc_std` to a location attribute on OrganizationObservation or as a link to a future E53 Place for districts/rivers.

**Rationale:** `loc_std` is a standardized location description (e.g. "Boven-Commewijne", "Suriname"). This describes which river/district the plantation is on. It is separate from the QGIS polygon geometry but provides geographic context from the almanac perspective. Potentially connects to a future historical districts dataset.

**Decision needed:** Model as simple string attribute now, or create E53 Place entities for districts? Start simple (string attribute), extend later.

**Enables:** Filtering plantations by region. Answering: _what plantations were in district X?_

### Step 6.4 -- Plantation size

**What:** Map `size_std` to `P43 has dimension` (E54 Dimension) on E13 Attribute Assignment.

**Rationale:** Size in akkers is recorded per year. It changes when plantations merge or split. Useful for analysis but not critical for linking. Can help disambiguate plantations with similar names but different sizes.

### Step 6.5 -- Page provenance

**What:** Map `page` to provenance on the observation or source.

**Rationale:** The page number in the almanac is provenance metadata. Currently not critical, but becomes valuable if/when the DBNL provides IIIF access to almanac scans -- then page numbers become direct links to the source image.

**Modeling approach (proposed):**

```
Observation --prov:hadPrimarySource--> source/almanac-{year}
source/almanac-{year} --P3 has note--> "28"
```

### Step 6.6 -- Function and additional info

**What:** Map `function` and `additional_info` as annotation-level data on observations.

**Rationale:** These contain interesting contextual information (e.g. "chirurgisch etablissement", church, military post) but are free-text and not standardized. Model as simple string properties. Not priority for initial implementation but should not be lost.

---

## Phase 7: Enslaved population data (FUTURE)

### Step 7.1 -- Enslaved count (basic)

**What:** `slaven` column -> `P141 assigned` (E54 Dimension: enslaved count) on E13 Attribute Assignment. Already mapped in SKILL.md.

### Step 7.2 -- Detailed population breakdown (deferred)

**What:** Columns 39-63 contain detailed demographic breakdown:

- By gender: mannelijke/vrouwelijke niet-vrije bewoners
- By work status: geschikt/ongeschikt tot werken
- By plantation vs private: plantage vs prive
- Free persons: vrije personen (jongens, mannen, meisjes, vrouwen)
- Tools: werktuig stoom/water, soort van molen

**Rationale:** This is rich demographic data but complex to model. Each column needs a proper CIDOC-CRM or custom property. Deferring to a later phase when the core model is stable. The `slaven` (total count) column captures the headline number for now.

---

## Implementation priority order

| Priority | Step | What                     | Why first                                         |
| -------- | ---- | ------------------------ | ------------------------------------------------- |
| 1        | 5.3  | PSUR ID linking          | Connects to slave registers (dataset 05)          |
| 2        | 5.1  | Mergers/splits           | Critical for correct plantation identity          |
| 3        | 5.4  | qid_alt                  | Completes merger picture from QGIS side           |
| 4        | 6.1  | Product type             | Already modeled, just needs CSV mapping           |
| 5        | 6.2  | Deserted flag            | Already modeled, just needs CSV mapping           |
| 6        | 5.2  | Reference plantations    | Helps linking when direct matches fail            |
| 7        | 6.3  | Location std             | Useful for filtering, decision needed on modeling |
| 8        | 6.4  | Size                     | Useful but not critical                           |
| 9        | 6.5  | Page provenance          | Future IIIF linking                               |
| 10       | 6.6  | Function/additional info | Nice to have                                      |
| 11       | 7.2  | Population breakdown     | Complex, defer until core is stable               |

---

## Diagram guide

### How to read data-source-mapping.mmd

The comprehensive flowchart in `data-source-mapping.mmd` shows how every CSV column from both primary datasets flows into the CIDOC-CRM entity model. It is structured in three vertical bands:

| Band   | Location | Contents                                                                                                               |
| ------ | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| Left   | QGIS     | 8 columns from `plantation_polygons_1930.csv`                                                                          |
| Right  | ALM      | 18 key columns from `Plantations Surinaamse Almanakken v1.0.csv`, grouped into core / people / enrichment / structural |
| Center | CIDOC    | 13 CIDOC-CRM entity nodes                                                                                              |

Every edge is annotated with:

1. The **CIDOC-CRM property** used
2. A parenthetical **rationale** explaining why that property was chosen

### Entity color key (CRITERIA / George Bruseker)

Colors follow the standard CIDOC-CRM visualization scheme proposed by George Bruseker and implemented in [chin-rcip/CRITERIA](https://github.com/chin-rcip/CRITERIA). Each CRM class inherits the color of its parent class in the hierarchy. All strokes are black (#000000).

| Fill       | CIDOC-CRM parent class | Our entities                    |
| ---------- | ---------------------- | ------------------------------- |
| #c78e66    | E18 Physical Thing     | E25 Plantation, E22 Source, E26 |
| #94cc7d    | E53 Place              | E53 Place (location geometry)   |
| #ffbdca    | E39 Actor              | E74 Group (organization)        |
| #fef3ba    | E41 Appellation        | E41 MAP / ALM / STD (names)     |
| #82ddff    | E2 Temporal Entity     | E12 Production, Observations    |
| #86bcc8    | E52 Time-Span          | E52 Time-Span                   |
| #fddc34    | E28 Conceptual Object  | E36 Visual Item                 |
| #fab565    | E55 Type               | E55 Type                        |
| #ffe6eb    | E39 Actor (instance)   | PersonObservation (PICO)        |
| #f8f9fa    | (non-CRM)              | CSV source columns              |
| #ffffff    | Literal                | Roles, type literals            |
| red border | (UI element)           | Q-ID bridge section             |

### Q-ID bridge

The red dashed box at the bottom shows how the two datasets connect. Both the QGIS `qid` column and the Almanakken `plantation_id` column contain Wikidata Q-IDs that resolve to the same E74 entity. This is the primary join key.

Example -- Geijersvlijt:

- QGIS: fid 1619, qid Q4392658, psur_id PSUR0118
- Almanakken: plantation_id Q4392658, 116 annual observations (1787-1920)
- Both point to: `wd:Q4392658` (the E74 organization)

### CIDOC-CRM property reference

| Property                           | Domain -> Range         | Why used                           |
| ---------------------------------- | ----------------------- | ---------------------------------- |
| P1 is identified by                | E1 -> E41               | Names assigned to entities         |
| P52 has current owner              | E18 -> E39              | Plantation owned by organization   |
| P51 has former or current owner    | E18 -> E39              | Historical ownership (qid_alt)     |
| P53 has former or current location | E18 -> E53              | Plantation at a place              |
| P107i is member of                 | E74 -> E74              | Sub-organization belongs to parent |
| P128 carries                       | E18 -> E90              | Physical source carries a name     |
| P138 represents                    | E36 -> E1               | Visual item depicts a thing        |
| P139 has alternative form          | E41 -> E41              | Variant spellings linked           |
| P190 has symbolic content          | E90 -> string           | Literal name string                |
| P70i is documented in              | E1 -> E31               | Provenance link to source          |
| geo:asWKT                          | geo:Geometry -> literal | GeoSPARQL spatial encoding         |
| skos:closeMatch                    | concept -> concept      | PSUR ID approximate link           |
| P140 assigned attribute to         | E13 -> E74              | Annual snapshot of org             |
| P99i was dissolved by              | E74 -> E68              | Plantation org dissolution         |
