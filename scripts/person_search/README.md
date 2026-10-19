# Person search (local)

A temporary, pragmatic search engine over all person datasets of the Suriname
Time Machine, built for the HackaLOD (October 2026). It runs next to the
Supabase database; it does not replace it.

**The full database contains restricted and embargoed data (datasets 11, 12
and 13). It is for the project team only: never commit it, share it or serve
it on a network.**

## 1. Build the database

```bash
python3 scripts/person_search/build_db.py          # writes suriname_person_search.db (~1.6 GB, ~6 min)
```

Standard library only. Needs the raw data folders under `data/` (several are
not in git; see each folder's README).

Family notes in the migration registers (`Vrouw van 387`, `Man van 530 en vader
van 531/VI`) are turned into links by `parse_kinship()`; every rule and the
reason for it is described in
[docs/person-search-kinship-linking.md](../../docs/person-search-kinship-linking.md).
`python3 scripts/person_search/test_kinship.py` checks one real example per rule.
Notes that could not be linked can be exported for checking by hand with
`uv run --with openpyxl python scripts/person_search/export_kinship_review.py`
(restricted data: the spreadsheet is written outside the repository).

## 2. Open the search page

```bash
scripts/person_search/serve.sh
```

Then open <http://127.0.0.1:8001/ui/index.html>. Stop with Ctrl+C.

- `serve.sh --team`: free SQL off, for sharing with the team over a private
  network such as Tailscale (`tailscale serve --bg 8001`; never `funnel`).
- `serve.sh --port 8002`: a second, own instance (with free SQL) next to the
  team one.

The script starts [Datasette](https://datasette.io) 0.65.1 through `uvx`
(install [uv](https://docs.astral.sh/uv/) once). It listens on 127.0.0.1 only
and has downloads switched off.

The page (`ui/`) is plain HTML/CSS/JavaScript without external libraries. It
only calls the canned queries named `ui_*` in `metadata.yaml`:

| query | used for |
|---|---|
| `ui_search`, `ui_facets` | result list and filter counts (FTS5 match + dataset, role, year range, place/plantation) |
| `ui_person` | person card: the person and their record |
| `ui_record_persons` | everyone on the same record |
| `ui_relations` | relations of the person, including across records (e.g. migration kinship) |
| `ui_names` | alternative names, father's name, places of origin |
| `ui_notes` | memo and note fields of the record |
| `ui_same_name` | same (normalised) name or alternative name elsewhere: candidates, never merged |
| `ui_places` | place search: normalised place strings (table `places`) |
| `ui_place_search`, `ui_place_facets` | persons on records with one place |
| `ui_pair_search`, `ui_pair_facets` | two persons on the same record (each with an optional role) |
| `ui_record_places` | all places named on a record (clickable to the place search) |

### Searching

- **Persons**: all words must occur, in any order, in name, alias, former name,
  place or occupation (FTS5 `persons_fts`). Three modes:
  - *word start* (default): each word is a prefix (`jan` finds Jan, Janna, Jansen);
  - *exact*: whole words only;
  - *fuzzy*: spelling keys that fold common Dutch/Surinamese variants (ij/ei/y,
    oe/ou, dj/j, tj/ch, c/k, ph/f, sch/s, dt/d/t, double letters) but keep the
    vowels (`persons.name_phonetic`, FTS5 `persons_phonetic_fts`).
    `phonetic_key()` in `build_db.py` and `phoneticKey()` in `ui/app.js` must stay identical.
- **Places**: substring search over every normalised place string; a chosen
  place lists all persons on records with that place. Spelling variants are not
  merged yet (that needs the gazetteer).

### Permanent links

Every person observation has a stable key, `persons.obs_key`:
`<dataset>/<record id>/<role>`, e.g. `03-birth/12345/mother`. The record id is
the dataset's own id where it has one (02, 03, 04 rows; UUIDs of 09 and 12;
scan ids of 13) and otherwise the scan/item id; a counter (`-2`, `-3`) is added
only where that is not unique (in source order). Because the key comes from the
source and not from the row number, `…/ui/index.html#obs=<key>` keeps pointing
to the same observation after a rebuild, as long as the source files do not
change. Where a counter is needed, reordering the source can shift it.

Searches and person cards are kept in the URL, so they can be bookmarked; person
links open in a new tab with Ctrl/Cmd+click. The page is in Dutch with an
English toggle.

The regular Datasette interface (tables, facets, the other canned queries)
stays available at <http://127.0.0.1:8001/>.

## Command line

```bash
python3 scripts/person_search/search.py Kartodikromo
python3 scripts/person_search/search.py --help
```
