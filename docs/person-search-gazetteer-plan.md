# Linking place mentions in the person search to the gazetteer – first plan

Status: proposal (October 2026). Scope: the local person search database
(`scripts/person_search/`), not yet the Supabase model; the result should be
reusable there.

## Why

Place is a key concept in the Suriname Time Machine. The person search now
treats every spelling of a place as a separate place: "Rust en Werk",
"Pl. Rust & Werk (Ben.Commewijne)" and "plantage Rust en Werk" are three
places. Linking mentions to the gazetteer (`data/places-gazetteer.jsonld`)
would let the search show one place with all its spellings, its location on a
map, its hierarchy (plantation → river/district) and everyone connected to it
across sources. It also gives stable place URIs for the HackaLOD.

## What we have

**Mentions** (`locations` table in `suriname_person_search.db`)
- 1,525,272 place mentions, 106,715 distinct normalised strings, each with the
  field it comes from (birth place, residence, plantation, address, origin …)
  and the record it belongs to. `locations.place_id` exists but is empty.
- Highly concentrated: the top 100 strings cover 45% of all mentions, the top
  1,000 cover 71%, the top 5,000 cover 83%.
- The most frequent strings are **Paramaribo streets** (Zwartenhovenbrugstraat,
  Gravenstraat, Keizerstraat, …; ward registers, censuses, certificates),
  followed by Paramaribo itself, districts and plantations.
- Some strings only refer back or to the context: "alhier" (here, i.e. the
  place of the record, usually Paramaribo), "in deze kolonie", "gemelde
  plantage" (the latter are already resolved for folder 13 district births).

**Gazetteer** (`data/places-gazetteer.jsonld`, 5,997 non-deprecated places)
- 1,957 plantations, 3,141 historical address points (Paramaribo, 1885),
  307 creeks, 154 rivers, 143 settlements, 83 roads, 80 military posts,
  71 Maroon and 31 Indigenous villages, 12 districts.
- Most have coordinates (5,624) and many a `broader` place (1,057); 493 carry
  PSUR ids of the Suriname Plantation Dataset; some have Wikidata links.
- **Plantation names are not unique**: 199 names occur more than once
  (Libanon 8×, Aan Berlijn 7×, Charlottenburg, Waterloo, Welgelegen 5×).
- No street entities yet: streets exist as historical address points and in
  `data/07-gis-plantation-map-1930/streetsParamaribo1916map.geojson`.

**Concordance Paramaribo** (`data/concordans-paramaribo/`,
`data/paramaribo-address-concordance.json`): 5,391 rows linking addresses
across 1817, 1830, 1837, 1885, 1921 and 2022 (street renamings and
renumbering). Ward register addresses are already linked
(`data/paramaribo-ward-register-address-links.json`).

**A naive test** (exact match on the core name after removing "plantage",
"pl.", "houtgrond", articles and bracketed parts) links only 16% of mentions
to exactly one gazetteer place, 12% to several, and 72% to none – mostly
because streets are missing and spellings differ.

## Worked example: the Military Hospital

The Militair Hospitaal in Paramaribo is mentioned about **15,400 times in 226
spellings**: place of death on death certificates (11,638 mentions, 138
spellings), birth place (2,616, 99) and mother's residence (205, 52) on birth
certificates, address in the 1921 census (1,189, 27), and a few civil records
(folder 13). Examples:

- `militair hospitaal`, `Hospitaal`, `in het Militair Hospitaal`
- `Gravenstraat B 2 (militair hospitaal)`, `Gravenstraat B2/ Militair hospitaal`,
  `Paramaribo, Gravenstraat B 2, Militair Hospitaal`
- `Gravenstraat B 2 (militair hospitaal, kraaminrichting)` (maternity ward)
- typos: `Gravestraat`, `Gravensraat`, `Gtavenstraat`, `Hospotaal`,
  `Hospiaal`, `militairhospitaal`, `9Militair Hospitaal0`
- other numbering: `Gravenstraat 64 (Militair Hospitaal)`; also ~370 mentions
  of `Gravenstraat B 2` without the word hospital
- probable slips: `Keizerstraat B 2 (Militair Hospitaal)`, `Gravenstraat A 2`,
  `F 2`

What this needs, beyond exact matching:

1. **Named buildings inside address strings.** Recognise building names
   (militair hospitaal, kraaminrichting, …) and link the mention to one
   gazetteer place *Militair Hospitaal* (with the maternity ward as a part,
   if wanted), whatever the address part says.
2. **Address parsing and the concordance.** Split street, ward letter and
   number (`Gravenstraat` + `B 2`) and use the Paramaribo concordance to
   connect the old ward-letter numbering (B 2) with the later house number
   (64) and the address point.
3. **Tolerance for typos.** Compare street and building names with an edit
   distance or trigram similarity against the gazetteer labels, and accept
   only clear winners automatically.
4. **Flag inconsistencies for curators** (e.g. `Keizerstraat B 2` with the
   hospital name) rather than guessing.

## Principles

1. **Link mentions, never rewrite them.** The original string stays; a link
   table says which gazetteer place it refers to, how (method) and how sure
   (certain / probable / possible), and who decided (rule or curator).
2. **Context decides between same-named places.** A mention is linked to a
   plantation "Libanon" only when the record's district, river or division (or
   the plantation dataset's PSUR id) points to one of them. Otherwise it stays
   a list of candidates for a curator.
3. **Curate where it pays off.** Because of the concentration, a few thousand
   decisions cover most mentions. Start with the most frequent strings.
4. **One gazetteer.** Curation happens in the existing gazetteer / places
   editor of the app, not in a second tool; the person search only reads the
   results.

## Steps

**1. Street layer for Paramaribo (largest gain, low ambiguity).**
Add streets as gazetteer entities (from the 1916 street map and the street
names in the concordance), with historical name variants as altLabels
(e.g. Wagenwegstraat / Wagewegstraat). Link street mentions, and street +
number where the concordance allows, to address points. Expected to cover a
large share of all mentions on its own.

**2. Automatic rules with context (high precision only).**
- Normalise: lower case, accents, "&"/"en", prefixes (plantage, pl., houtgrond,
  kostgrond, grond, aan de …), bracketed district notes ("(Ben. Commewijne)"
  becomes context, not name).
- Exact core-name match to prefLabel/altLabels.
- Disambiguate with context from the same record: district/division fields
  (almanacs, ward registers, slave registers, censuses), the district in folder
  13 record places ("district Boven Cottica"), bracketed notes in migration
  plantation names, and PSUR ids where a dataset carries them.
- Resolve context words: "alhier" → place of the record; "in deze kolonie" →
  Suriname.
- Result per distinct (string, context): one place (auto, probable), several
  (candidates), none (unresolved).

**3. Curation of the remainder, most frequent first.**
Export the candidates and unresolved strings with their frequency, sources and
a few example records, and decide them in the gazetteer editor: pick the
right place, add an altLabel, add a missing place, or mark "not a place"
(e.g. "in garnizoen"). Combined names ("Marienburg & Zoelen") link to both or
to a combined entity, as the gazetteer prefers.

**4. Use it in the search.**
Fill `locations.place_id`; the place search groups all spellings under one
place (with its spellings, map point, broader place and sources); the person
card shows linked places; the location facet counts by place instead of by
string. Unlinked strings keep working as now.

**5. Publish.** Place URIs (`https://data.surinametijdmachine.org/place/…`) in
the LOD export for the HackaLOD.

## Open questions for the team

- Where should the link table live: in the gazetteer (as references per
  source string), in Supabase, or as a CSV next to the person search?
- Which editor do we use for curation (the places editor in the app)? Who
  curates, and how much time is available before the HackaLOD?
- How do we model plantations that merged or were renamed over time (period
  of validity per name)?
- Do we want streets as gazetteer places of their own, or only address points?
