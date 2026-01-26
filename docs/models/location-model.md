# Location Model: Working Notes

> This is a working document. It's messy, has dead ends, and includes half-formed ideas. That's intentional - I'm trying to think through this problem, not present a finished solution.

---

## Starting Point (January 2025)

I keep coming back to the question: **what even is a "location" in this project?**

Looking at what we have:

- Historic maps from 1763, 1830, etc.
- Place names in death certificates ("Paramaribo", "plantation De Hoop")
- Coordinates in Wikidata
- Annotations from re:Charted (pixels on images)

These are all... locations? But they're so different. A pixel on a scanned map is not the same kind of thing as the city of Paramaribo.

I spent a while reading about how other projects handle this. The Time Machine projects (Venice, Amsterdam) seem to separate "the place" from "depictions of the place" - which makes sense but also adds complexity.

**Note to self:** Look at how Pelagios handles this. They deal with ancient place names and uncertain locations all the time. See: https://pelagios.org/

---

## The Problem, Simply

I have a polygon on a 1763 map labeled "De Hoop."

I have a death certificate from 1830 that says someone died at "De Hoop."

Are these the same place?

Probably? But:

- The plantation boundaries might have changed
- There might be multiple places called "De Hoop"
- The 1763 map might be wrong
- The death certificate clerk might have made a mistake

So I can't just say `polygon.name == certificate.place` and call it done.

---

## First Attempt: Everything in One Table

My first instinct was simple:

```sql
CREATE TABLE location (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    geometry GEOMETRY
);
```

This fell apart immediately because:

1. **What geometry do I use for "De Hoop"?** The 1763 boundary? The 1830 boundary? A modern point estimate?

2. **What about places I only know by name?** Some slave registers mention plantations I can't find on any map.

3. **The annotation coordinates aren't geographic.** They're pixels on a canvas. I'd be mixing meters with pixels.

Threw this out.

---

## Second Attempt: Separate Everything

Okay, so what if I have completely separate tables?

```sql
CREATE TABLE real_place (id, name, wikidata_id, ...);
CREATE TABLE map_feature (id, map_id, geometry, label, ...);
CREATE TABLE annotation (id, canvas_uri, x, y, ...);
```

This is... fine? But then how do I connect them?

If I want to ask "show me everything we know about De Hoop," I need to:

1. Query real_place for the concept
2. Query map_feature for things that might be De Hoop
3. Query annotation for annotations that might refer to De Hoop
4. Somehow join these together

I started building this and realized I need a linking table anyway. Which led to...

---

## Current Thinking: Places + Depictions + Interpretations

This is where I am now. Three layers:

**Layer 1: Places** - Real-world locations that exist (or existed). Abstract concepts.

**Layer 2: Depictions** - Things drawn on maps. These are historical artifacts.

**Layer 3: Interpretations** - Claims that a depiction represents a place.

```
           PLACE (abstract)
              ↑
              | interpretation (with certainty)
              ↑
        MAP_FEATURE (concrete)
              ↑
              | traced from
              ↑
           MAP (source)
```

I like this because:

- The same place can have multiple depictions (De Hoop on the 1763 map AND the 1830 map)
- Depictions can exist without interpretation (I traced this polygon but don't know what it is yet)
- Interpretations can be uncertain ("this is probably De Hoop, 70% sure")

**Worry:** Is this overengineered? Most of the time I'll just want to say "this is De Hoop" without all the layers. Am I making simple things complicated?

**Counter-argument:** The complexity is in the data, not my model. The sources genuinely are ambiguous. A simpler model would hide that ambiguity, not remove it.

---

## The Interpretation Problem

This is the part I'm least confident about.

When I trace a polygon on a map and label it "De Hoop," what am I actually doing?

1. **Recording what the map says** - There's text on the map that reads "De Hoop"
2. **Claiming it represents a place** - This polygon depicts the plantation called De Hoop
3. **Linking to a database record** - This polygon is about `place.id = 42`

These are three different things! The map might say "De Hoop" but actually depict something else (mapmaker error). Or I might link it to the wrong place in my database.

**How Enslaved.org handles this:** They have explicit "assertion" records with confidence levels. Every claim is attributed to a source or a researcher. See: https://enslaved.org/

**How CIDOC-CRM handles this:** They use E13 Attribute Assignment events. An interpretation is itself an event - someone, at some time, made a claim. See Doerr (2003) in references.

I think I need something like:

```sql
CREATE TABLE interpretation (
    id SERIAL PRIMARY KEY,
    map_feature_id INTEGER REFERENCES map_feature(id),
    place_id INTEGER REFERENCES place(id),
    certainty VARCHAR(20),  -- 'definite', 'probable', 'possible', 'uncertain'
    reasoning TEXT,         -- Why I think this
    made_by VARCHAR(100),   -- Who made this interpretation
    made_at TIMESTAMP       -- When
);
```

But I'm not sure about the certainty levels. Are four levels enough? Too many? Should it be a number (0.0 to 1.0) instead?

**Note:** Ask someone who does historical GIS professionally. Maybe the HISGIS project in the Netherlands?

---

## Dead End: Trying to Use Only W3C Annotations

I thought maybe I could skip the whole database and just use W3C annotations for everything. re:Charted already produces them, AnnoRepo stores them, it's all standards-based...

Tried to model a place entirely in JSON-LD:

```json
{
  "@context": "http://www.w3.org/ns/anno.jsonld",
  "type": "Annotation",
  "motivation": "identifying",
  "target": {
    "source": "some-map-canvas",
    "selector": { "type": "SvgSelector", "value": "..." }
  },
  "body": {
    "@id": "http://my-project.org/place/de-hoop",
    "name": "De Hoop",
    "type": "Plantation"
  }
}
```

**Problems:**

1. No good way to query "all plantations on the Commewijne river"
2. Can't do spatial queries (give me everything within 10km of this point)
3. Would need to sync with a database anyway for the other data sources

**What I learned:** W3C annotations are great for the annotation layer (linking features to canvas regions) but I still need a relational database for the actual data.

---

## The Geometry Precision Mess

This is driving me crazy.

A polygon traced from a 1763 map looks precise - it has exact coordinates. But that precision is fake. The original map was hand-drawn, my georeferencing has errors, the boundaries were probably fuzzy to begin with.

Meanwhile, Wikidata gives me coordinates for Paramaribo that are accurate to meters. But it's a city - using a point to represent a city is also "wrong."

Options I've considered:

**Option A: Just ignore it**
Store all geometries the same way, let the user figure it out.
→ This feels irresponsible. Users will assume my polygons are accurate.

**Option B: Precision field**

```sql
geometry GEOMETRY,
precision_meters INTEGER  -- Estimated accuracy
```

→ But what does "precision" mean for a polygon? The whole boundary? Each vertex?

**Option C: Buffer zones**
Store both the geometry AND a buffer representing uncertainty.
→ Complicated. Doubles storage. Queries become harder.

**Option D: Just document it**
Store geometries as-is but write good metadata about where they came from.
→ This is probably the practical answer?

**Current decision:** Option B + D. Store precision as a rough estimate, document sources carefully.

**Reference:** Goodchild (2010) discusses spatial data uncertainty. But I couldn't find anything specifically about historical GIS uncertainty.

---

## Place Hierarchy: I Don't Know What to Do

Places contain other places:

```
Suriname
  └── Commewijne (district)
        └── De Hoop (plantation)
              └── Main house (building)
```

Simple enough with `parent_id`:

```sql
CREATE TABLE place (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    parent_id INTEGER REFERENCES place(id)
);
```

But historical boundaries changed. Commewijne district in 1763 had different boundaries than Commewijne in 1900.

Do I:

- Create separate places for "Commewijne (1763 boundaries)" and "Commewijne (1900 boundaries)"?
- Have one Commewijne with multiple geometries attached to time periods?
- Just ignore it and use modern boundaries?

I asked on the HISGIS mailing list. No clear answer. Some projects use temporal validity on relationships:

```sql
CREATE TABLE place_containment (
    child_id INTEGER REFERENCES place(id),
    parent_id INTEGER REFERENCES place(id),
    valid_from DATE,
    valid_to DATE
);
```

This seems like overkill for my project. I probably won't have enough data to reconstruct historical administrative boundaries anyway.

**Current decision:** Simple `parent_id` for now. Add temporal table later if needed.

**Risk:** I might regret this when I try to analyze plantation locations by district over time.

---

## Coordinates: Canvas vs. Geographic

re:Charted annotations use canvas coordinates (pixels). My GIS layers use geographic coordinates (lat/long).

To convert: I need the georeferencing transformation from my QGIS project.

```
Canvas point (2307, 1693)
    → apply transformation matrix
    → Geographic point (-55.123, 5.456)
```

**Problem:** The transformation is stored in the QGIS project file. How do I:

1. Export it in a reusable format?
2. Store it in my database?
3. Apply it to incoming annotations?

QGIS uses GDAL for georeferencing. I can probably extract the transformation as a set of control points or a polynomial formula.

**To investigate:**

- GDAL GCP (ground control point) format
- Storing transformation in PostGIS
- Whether re:Charted can do this transformation itself

**For now:** Store both coordinates. Canvas coordinates are the "truth" (what was actually annotated). Geographic coordinates are derived (can be recalculated if georeferencing improves).

---

## Names: Way More Complicated Than I Thought

I assumed place names would be simple. They're not.

"De Hoop" appears as:

- "De Hoop" (standard Dutch)
- "d'Hoop" (1763 spelling)
- "Dehoop" (run together in some records)
- "The Hope" (English)
- "plantation De Hoop, on the Commewijne" (full description)

And that's just one plantation! Some places have:

- Indigenous names (mostly unrecorded, but some survive)
- Dutch colonial names
- Sranan Tongo names
- Multiple variants/spellings of each

I need a separate names table:

```sql
CREATE TABLE place_name (
    id SERIAL PRIMARY KEY,
    place_id INTEGER REFERENCES place(id),
    name VARCHAR(255),
    name_type VARCHAR(50),  -- 'official', 'historical', 'indigenous', 'variant'
    language VARCHAR(10),   -- 'nl', 'en', 'srn', etc.
    source_id INTEGER REFERENCES data_source(id)
);
```

**Open question:** How do I handle "primary" name? Is there always one? What if the "official" name is the colonial one, which feels wrong to privilege?

**Reference:** The ANPS (Australian National Placenames Survey) has good documentation on handling contested and Indigenous place names. See: https://www.anps.org.au/

---

## What I'm Avoiding (For Now)

Things I know I'll need eventually but am deliberately not solving yet:

1. **Temporal geometries** - Different boundaries at different times
2. **Uncertainty visualization** - How to show "I'm not sure about this" on a map
3. **Automated matching** - Using ML/NLP to suggest place matches
4. **Linked data export** - RDF/JSON-LD representations of places
5. **Versioning** - What happens when I change an interpretation?

I'm avoiding these because I need to get something working first. Premature generalization is a trap.

**Note:** Write these down somewhere so I don't forget them.

---

## Interesting Rabbit Hole: What Is a Plantation, Actually?

I went down a rabbit hole trying to define "plantation" for the `place_type` field.

Is it:

- A piece of land? (geographic)
- An agricultural operation? (economic)
- A social structure? (people who lived/worked there)
- A legal entity? (ownership)

The same name ("De Hoop") might refer to:

- The land itself (which existed before and after the plantation)
- The plantation as an enterprise (which had a start and end date)
- The community of people there (which changed constantly)

Most databases I've seen treat "plantation" as a location. But reading about similar projects, some treat it more like an organization that occupies a location.

**Maybe I need both?**

```
PLACE (De Hoop, the physical land)
ORGANIZATION (Plantation De Hoop, the enterprise)
→ ORGANIZATION occupied PLACE from 1700 to 1863
```

This matches what the Plantagen dataset seems to be doing - it's really about organizations (with owners, directors, production), not just locations.

**But:** This adds a lot of complexity. For now, I'm treating plantations as places. Revisit when I model organizations.

**See also:** The Slavery & Emancipation Registers data source doc, which has some notes on this.

---

## Current Schema (Draft)

This is what I'm working with now. It will change.

```sql
-- Places (abstract concepts)
CREATE TABLE place (
    id SERIAL PRIMARY KEY,
    code VARCHAR(20) UNIQUE NOT NULL,        -- LOC_0001
    display_name VARCHAR(255) NOT NULL,
    place_type VARCHAR(50),                  -- city, plantation, river, district
    parent_id INTEGER REFERENCES place(id),

    -- Best-known geometry (often NULL or approximate)
    geometry GEOMETRY(GEOMETRY, 4326),
    geometry_source VARCHAR(100),            -- where this geometry came from
    precision_meters INTEGER,                -- rough accuracy estimate

    -- External identifiers
    wikidata_id VARCHAR(20),
    geonames_id VARCHAR(20),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT                               -- researcher notes, uncertainties
);

-- Multiple names per place
CREATE TABLE place_name (
    id SERIAL PRIMARY KEY,
    place_id INTEGER REFERENCES place(id),
    name VARCHAR(255) NOT NULL,
    name_type VARCHAR(50),
    language VARCHAR(10),
    year_from INTEGER,
    year_to INTEGER,
    source_id INTEGER REFERENCES data_source(id)
);

-- Historic maps
CREATE TABLE map (
    id SERIAL PRIMARY KEY,
    code VARCHAR(20) UNIQUE NOT NULL,        -- MAP_1763_001
    title VARCHAR(500),
    year INTEGER,
    archive_reference VARCHAR(255),          -- where the original is
    iiif_manifest_uri TEXT,                  -- if digitized
    extent GEOMETRY(POLYGON, 4326),          -- area covered
    notes TEXT
);

-- Features traced from maps
CREATE TABLE map_feature (
    id SERIAL PRIMARY KEY,
    map_id INTEGER REFERENCES map(id),
    label_on_map VARCHAR(255),               -- exact text on the map
    feature_type VARCHAR(50),                -- boundary, symbol, label, river
    geometry GEOMETRY(GEOMETRY, 4326),
    digitized_by VARCHAR(100),
    digitized_at TIMESTAMP,
    notes TEXT
);

-- Interpretations linking features to places
CREATE TABLE interpretation (
    id SERIAL PRIMARY KEY,
    map_feature_id INTEGER REFERENCES map_feature(id),
    place_id INTEGER REFERENCES place(id),
    certainty VARCHAR(20),                   -- definite, probable, possible, uncertain
    reasoning TEXT,                          -- why I think this
    made_by VARCHAR(100),
    made_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    superseded_by INTEGER REFERENCES interpretation(id)  -- if revised
);
```

---

## Questions I Still Have

1. **Should `place` have geometry at all?** Maybe geometry only belongs on map_feature, and place is purely abstract?

2. **How do re:Charted annotations connect?** I haven't fully worked out the import pipeline.

3. **What about places that exist but have no map features?** Like a plantation mentioned in records but never mapped.

4. **Is four certainty levels right?** Maybe I need "verified" above "definite" for things cross-checked against multiple sources.

5. **How do I handle corrections?** If I realize an interpretation is wrong, do I delete it or mark it as superseded?

---

## References

I should actually read these properly at some point:

- Doerr, Martin. "The CIDOC CRM: An Ontological Approach to Semantic Interoperability of Metadata." _AI Magazine_ 24, no. 3 (2003).
- Goodchild, Michael F. "Twenty Years of Progress: GIScience in 2010." _Journal of Spatial Information Science_ 1 (2010): 3-20.
- Gregory, Ian N., and Paul S. Ell. _Historical GIS: Technologies, Methodologies, and Scholarship_. Cambridge University Press, 2007.
- Southall, Humphrey, et al. "On Historical Gazetteers." _International Journal of Humanities and Arts Computing_ 5, no. 2 (2011): 127-145.

**Projects to look at:**

- Pelagios: https://pelagios.org/ (ancient world gazetteer linking)
- World Historical Gazetteer: https://whgazetteer.org/
- HISGIS Netherlands: https://hisgis.nl/
- Enslaved.org: https://enslaved.org/ (person + place modeling)

---

## Notes for Next Session

- [ ] Try importing one W3C annotation and see what breaks
- [ ] Talk to Manjusha about how GAVOC handles uncertain place identifications
- [ ] Look up how Pelagios stores attestations (place mentions in texts)
- [ ] Sketch what the query "all plantations mentioned in 1830 death certificates" would look like
- [ ] Think about whether place_type should be a lookup table or enum
