# Person search: places, map, patients and contributions (frontend notes)

Status: HackaLOD, 30 October 2026. Branch `feature/person-search-place-geo` (PR #81).
Built by `scripts/person_search/link_places.py` (runs at the end of `build_db.py`, or
standalone on an existing DB). All queries are Datasette canned queries: call
`/<database>/<query>.json?_shape=objects&<param>=<value>`. Every parameter is a string;
pass an empty string to switch an optional filter off.

Address data: **Concordans Paramaribo, M. Muntjewerff**. Show this attribution wherever
1885 address points or concordance-derived streets appear on screen.

## New tables

### `gazetteer`
One row per place: the live records of `places-gazetteer.jsonld` (plantations, 1885
address points, settlements, rivers, districts, Paramaribo) plus derived street records.

| column | meaning |
|---|---|
| `id` | `stm-…` (gazetteer) or `stm-street-<slug>` (derived street) |
| `uri` | `https://data.surinametijdmachine.org/place/<id>`; NULL for streets (no URI yet) |
| `prefLabel`, `altLabels` (JSON array) | names |
| `type` | plantation, historical-address, street, town, settlement, river, creek, district, … |
| `lat`, `lng` | point (polygon centroid for plantations); NULL for some records |
| `description`, `source` | |

```json
{"id": "stm-1885-address-0327", "uri": "https://data.surinametijdmachine.org/place/stm-1885-address-0327",
 "prefLabel": "Gravenstraat, B2", "altLabels": "[]", "type": "historical-address",
 "lat": 5.830053055211843, "lng": -55.15685854195079,
 "description": "1854: Militair hospitaal; 1885: Hospitaal; 1916: Militair hospitaal",
 "source": "places-gazetteer.jsonld"}
```

**'s Lands Hospitaal / Militair Hospitaal = `stm-1885-address-0327`** (Gravenstraat B2).
This is an address point, not a separate building record. The concordance links it with
certainty to 1921 house numbers Gravenstraat 62/64/66. On the public data, 213 different
spellings with 15,667 mentions point to it.

### `place_geo`
One row per distinct `locations.location_norm`: the single best guess. Nobody has checked
these by hand: treat them as probabilities. `locations.place_id` is filled from this table.

| column | meaning |
|---|---|
| `location_norm` | the normalised string (key) |
| `gazetteer_id`, `gazetteer_uri`, `lat`, `lng`, `label` | chosen place |
| `match_type` | `address1885` — a house address (1885 address point) via the concordance; `gazetteer` — a named place (plantation, Paramaribo, village …); `street-centroid` — only a street is known, so the point is the street's middle; `unplaced` — no place (context words such as "aldaar", "in deze kolonie", or no match) |
| `confidence` | 0–1. Already divided by the number of candidates when a string fits several places |
| `note` | how it was matched, e.g. `concordance, 1837 regime exact; 2 candidate places` |
| `mentions` | number of location rows with this string |

Suggested display: `confidence ≥ 0.8` solid marker; `0.5–0.8` hollow marker or "probably";
`< 0.5` "uncertain, one of several places".

Coverage on the public datasets (the laptop DB, which also holds 11/12/13, will differ):

| match_type | strings | share of strings | location rows | share of rows | avg confidence |
|---|---|---|---|---|---|
| gazetteer | 3,983 | 6.5% | 525,052 | 40.3% | 0.71 |
| street-centroid | 7,358 | 12.1% | 466,422 | 35.8% | 0.70 |
| address1885 | 25,127 | 41.2% | 154,771 | 11.9% | 0.57 |
| unplaced | 24,457 | 40.1% | 155,820 | 12.0% | — |

## New queries (database `suriname_person_search`)

### `person_places` — params: `id` (person_id)
The places on the person's own record plus those on the records of their same-name
candidates (same rule as `ui_same_name`). `relation` = `own` | `candidate`.
```json
{"relation": "own", "person_id": 653073, "obs_key": "03-birth/SR-NA_2.10.61_96_0160-r/child",
 "full_name": "Henri Corneille Jean Philips Renardus", "role": "child", "certificate_id": 112072,
 "source_dataset": "03-birth", "event_year": 1896, "field_origin": "inf_place",
 "raw_text": "Keizerstraat", "location_norm": "keizerstraat", "gazetteer_id": "stm-street-keizerstraat",
 "place_label": "Keizerstraat", "lat": 5.827807260939458, "lng": -55.15876357570578,
 "match_type": "street-centroid", "confidence": 0.9}
```

### `record_places_geo` — params: `cert` (certificate_id)
`ui_record_places` with coordinates.
```json
{"raw_text": "Keizerstraat", "location_norm": "keizerstraat", "field_origin": "inf_place",
 "precision": "street-centroid", "gazetteer_id": "stm-street-keizerstraat", "gazetteer_uri": null,
 "place_label": "Keizerstraat", "lat": 5.827807260939458, "lng": -55.15876357570578,
 "match_type": "street-centroid", "confidence": 0.9, "note": "street name (centroid from street layer 1916)"}
```

### `map_places` — no params (LIMIT 2000)
Place strings with coordinates, by number of records. Several spellings of one place
give several rows on the same spot; for markers use `map_points`.
```json
{"location_norm": "paramaribo", "label": "ParamAribo", "records": 150392,
 "datasets": "02-death,03-birth,04-ward-registers,05-slave-emancipation,10-volkstelling-1950",
 "gazetteer_id": "stm-06330", "gazetteer_uri": "https://data.surinametijdmachine.org/place/stm-06330",
 "lat": 5.82392031098937, "lng": -55.151778467090274, "match_type": "gazetteer", "confidence": 0.8}
```

### `map_points` — no params (LIMIT 2000, extra)
One row per point, all spellings added up. Best for the map overview.
```json
{"gazetteer_id": "stm-06330", "place_label": "Paramaribo", "type": "town",
 "lat": 5.82392031098937, "lng": -55.151778467090274, "records": 194039, "spellings": 77,
 "best_confidence": 0.8, "match_type": "gazetteer"}
```

### `place_wall` — params: `place_norm`, `dataset`, `role`, `year_from`, `year_to` (LIMIT 1000)
The names at one place string (like `ui_place_search`).
```json
{"person_id": 622612, "obs_key": "03-birth/SR-NA_2.10.61_77_0005-l/child", "full_name": "Salomon Levie",
 "role": "child", "source_dataset": "03-birth", "sex": "male", "age": null, "year": 1890, "status": null,
 "occupation": null, "plantation": null, "place": "paramaribo", "record_type": "birth_certificate",
 "collection": null, "certificate_id": 106232}
```

### `place_wall_point` — params: `gazetteer_id`, `year_from`, `year_to` (LIMIT 1000, extra)
The names at one point, over all spellings. For example, `gazetteer_id=stm-1885-address-0327`
gives everyone at the hospital.
```json
{"person_id": 152478, "obs_key": "02-death/SR-NA_2.10.61_1064_0003-r/informant",
 "full_name": "Johan Frederik Ludolph Clemen", "role": "informant", "source_dataset": "02-death",
 "sex": null, "age": "32", "year": 1890, "status": null, "occupation": "hospitaalmeester",
 "certificate_id": 24954}
```

### `patient_start` — params: `patient_id` (1–516)
One patient from the Militair Hospitaal 1921 list. It returns three kinds of rows,
told apart by `soort`:
- `patient` — the patient row;
- `vermelding` — the patient's entries in the 1921 census;
- `koppeling` — the patient's links into the other datasets.

Use `person_id` / `certificate_id` to continue with `ui_person`, `ui_relations`,
`person_places` and `record_places_geo`.

| column | patient | vermelding | koppeling |
|---|---|---|---|
| `id` | patient_id | vermelding_id | koppeling_id |
| `person_id`, `certificate_id`, `obs_key` | — | census person | target person/record |
| `naam` | surname + initials/contract no. | full name | full name in target |
| `dataset` | 09-volkstelling-1921 | 09-volkstelling-1921 | target dataset |
| `jaar` | birth year (text, can be "?") | record year | record year |
| `resultaat` | `beste_resultaat` | — | `resultaat` |
| `rol` | `groep` | role | `rol_in_doelrecord` |
| `methode` | `gevonden_in` | — | `methode` |
| `toelichting` | `aantal_vermeldingen` | birth year in census | `toelichting` |

```json
[{"soort": "patient", "id": 513, "person_id": null, "certificate_id": null, "obs_key": null,
  "naam": "Renardus H.C.", "dataset": "09-volkstelling-1921", "jaar": "1896", "resultaat": "zeker",
  "rol": "initialen", "methode": "03-birth, 10-volkstelling-1950, 13-civil", "toelichting": 2},
 {"soort": "vermelding", "id": 793, "person_id": 1535971, "certificate_id": 585772, "...": "..."},
 {"soort": "koppeling", "id": 330, "person_id": 653073, "certificate_id": 112072,
  "obs_key": "03-birth/SR-NA_2.10.61_96_0160-r/child", "naam": "Henri Corneille Jean Philips Renardus",
  "dataset": "03-birth", "jaar": 1896, "resultaat": "zeker", "rol": "child", "methode": "…", "toelichting": ""}]
```
(This example is put together from the tables. Free SQL is off on the team server, so
check it there once the new metadata is live.)

### Values in the mh1921 tables

`mh1921_patienten.groep`: how the patient is identified on the 1921 hospital list.
- `contractnummer` (152 patients): a contract labourer, identified by contract number
  (e.g. `681/VV`, or `z/v 1027/VV` = child of contract holder 1027/VV). These patients
  are linked through the migration registers (12, restricted dataset).
- `initialen` (364 patients): surname + initials. Linked by name and age through the
  civil registers.

`mh1921_patienten.beste_resultaat`: the best link found for the patient. The meanings
below are read off the `methode`/`toelichting` columns. The script that made these
tables is not in the repo, so check them with its author.

| value | meaning | patients |
|---|---|---|
| `zeker` | at least one link with a unique and consistent match (name, age, contract no.) | 165 |
| `waarschijnlijk` | a good match, with one element missing or uncertain (e.g. age range, spelling) | 74 |
| `meerdere kandidaten` | several people fit equally well; no choice was made | 19 |
| `geen` | nothing found | 258 |

`mh1921_koppelingen.resultaat`: per link, `zeker` (199), `waarschijnlijk` (106) or
`meerdere kandidaten` (46), with the same meanings. `geen` has no link rows.
By target dataset:

| target dataset | links |
|---|---|
| 12-migratie-datasets | 130 |
| 13-civil | 111 |
| 03-birth | 69 |
| 10-volkstelling-1950 | 41 |

**Access rules.** `13-civil` is under embargo: show only the minimum (name, year, role,
no full record). `12-migratie-datasets` must not be bulk-downloadable. These rules apply
to `patient_start`, `place_wall` and `map_*` output too.

## Demo patients

Chosen because their links lead furthest: relations, records, places and datasets,
following `ui_relations`, `ui_same_name` and `ui_record_places`. Same-name candidates
are not verified. Present them as leads, not as proof.

1. **patient 68, C. van Dillenburg (b. 1897)**: the most relations.
   - Birth records 1896 and 1897 (03-birth, `waarschijnlijk`): parents Richard Stephanus
     van Dillenburg and Josephina Christiana Zerp, born "op het erf van het
     Gouvernementshotel", Oranjestraat, Eerste Buitenwijk.
   - In 1921, Casimir Alexander van Dillenburg is a witness at a recognition
     (13-civil, `zeker`).
   - In 1950, family members live at Julianastraat 50 (10-volkstelling-1950).
   - Datasets: 1921 → 03 / 13 / 10.
2. **patient 513, H.C. Renardus (b. 1896)**: the full arc from birth to 1950.
   - Birth 1896, Keizerstraat D 9 (03-birth, `zeker`). Parents Henri Corneille Jean
     Philips Renardus and Francoise Mathilda Monsanto.
   - In 1950 he lives at Hofstraat 32 with his wife Betsy Estella Comvalius
     (10-volkstelling-1950, `zeker`).
   - Through same-name candidates the family reaches back into 02-death,
     04-ward-registers and 05-slave-emancipation (6 datasets).
3. **patient 416, Lempen (z/v 1027/VV, b. 1919)**: a child of a Javanese contract labourer.
   - The mother, Bok Senen (VV1027), arrived on the Rotti II and worked at plantation
     Jagtlust; her places of origin are Djocja, Keboemen and Prambanan
     (12-migratie-datasets, `waarschijnlijk`).
   - In the 1921 census she is a same-person link (Sewbani).
   - Birth record 1920 in Paramaribo (Gravenstraat B 15, 03-birth).
   - This one shows the line from Java to plantation to city. It uses restricted data
     (12), so take care in the demo.

Alternatives: 70 Dorder, 166 Malonie, 170 Marcet (all `zeker`), 391 de Barrios
(b. 1856, 10 places).

## Contributions (database `contributions`)

A separate file, `contributions.db`, next to the archive. It is writable; the archive
stays `--immutable`. `serve.sh` creates it if missing (`contributions.py`).

| query | params | notes |
|---|---|---|
| `add_contribution` | `person_id`, `obs_key`, `patient_id`, `kind`, `value`, `related_person_id`, `contributor`, `consent` | write. `created_at` = `datetime('now')`, `reviewed` = 0. Empty optional params → NULL. `consent` `1`/`true`/`yes`/`ja` → 1 |
| `contributions_since` | `since` (last id seen) | `id > since ORDER BY id LIMIT 1000`, for syncing |
| `contributions_for_person` | `person_id`, `include_unreviewed` (`1` to include) | reviewed only by default; no `contributor` column |

`kind` suggestions: `relation`, `same_person`, `story`, `correction`.

### Posting from a server script (Datasette 0.65.1)

- **URL:** `POST http://127.0.0.1:8001/contributions/add_contribution?_json=1`
  (or send `Accept: application/json`).
- **Body:** form-encoded (`application/x-www-form-urlencoded`) or a JSON object
  (`application/json`).
- **CSRF:** Datasette's CSRF check (asgi-csrf) only applies to requests that carry
  cookies. A server script that sends **no cookies** passes without a token (sending
  `Authorization: Bearer …` also bypasses it). Browsers can't do this, so let the
  browser talk to your own server and let that server post.
- **Permissions:** a writable canned query is allowed by default for any caller who can
  reach Datasette. Datasette must therefore only listen on localhost or Tailscale, never
  on the open internet. To lock it down further, add an `allow` block to the query
  (e.g. `allow: {id: "contrib-bot"}`) together with a token plugin such as
  `datasette-auth-tokens`, and send `Authorization: Bearer <token>`.
- **Cache:** `default_cache_ttl` is 3600 for the whole server in 0.65. Read contributions
  with `?_ttl=0` so new rows show up immediately.

```bash
curl -s -X POST 'http://127.0.0.1:8001/contributions/add_contribution?_json=1' \
  -H 'Content-Type: application/json' \
  -d '{"person_id":"653073","obs_key":"","patient_id":"513","kind":"story",
       "value":"Mijn opa vertelde …","related_person_id":"","contributor":"web-form",
       "consent":"ja"}'
# → {"ok": true, "message": "Query executed, 1 row affected", "redirect": null}

curl -s 'http://127.0.0.1:8001/contributions/contributions_since.json?_shape=objects&_ttl=0&since=0'
```

Not tested in the build container (Datasette could not be installed there). Test this
`curl` on the laptop first.

## Applying it to the laptop DB

```bash
# stop Datasette, then:
python3 scripts/person_search/link_places.py suriname_person_search.db   # ~20 s, keeps mh1921_* tables
python3 scripts/person_search/test_places.py
./scripts/person_search/serve.sh
```

A full `build_db.py` rebuild drops the mh1921 tables, because the script that makes them
is not in the repo yet.
