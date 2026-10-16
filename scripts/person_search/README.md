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

## 2. Open the search page

```bash
scripts/person_search/serve.sh
```

Then open <http://127.0.0.1:8001/ui/index.html>. Stop with Ctrl+C.

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

Searches and person cards are kept in the URL (`#q=…&person=…`), so they can
be bookmarked. The page is in Dutch with an English toggle.

The regular Datasette interface (tables, facets, the other canned queries)
stays available at <http://127.0.0.1:8001/>.

## Command line

```bash
python3 scripts/person_search/search.py Kartodikromo
python3 scripts/person_search/search.py --help
```
