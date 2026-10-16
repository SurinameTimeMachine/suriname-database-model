#!/usr/bin/env bash
# Start the local person search page.
#
#   scripts/person_search/serve.sh                 # uses suriname_person_search.db
#   scripts/person_search/serve.sh /other/folder/suriname_person_search.db
#   scripts/person_search/serve.sh --team [db]     # for sharing with the team (see below)
#   scripts/person_search/serve.sh --port 8002     # a second, own instance next to the team one
#
# Then open http://127.0.0.1:8001/ui/index.html (or the --port given) in a browser.
#
# The full database contains restricted and embargoed data. The server listens on
# 127.0.0.1 only, with downloads switched off. Never expose it to the internet.
#
# --team: for sharing with team members over a private network such as
# Tailscale (`tailscale serve --bg 8001`; never `tailscale funnel`). It also
# switches off free SQL, so visitors can use the search page and browse tables
# but cannot run their own queries to pull out large parts of the data.
set -euo pipefail
cd "$(dirname "$0")/../.."

TEAM=0
PORT=8001
while [ $# -gt 0 ]; do
  case "$1" in
    --team) TEAM=1; shift ;;
    --port) PORT="$2"; shift 2 ;;
    *) break ;;
  esac
done
DB="${1:-suriname_person_search.db}"
# The page and metadata.yaml address the database as 'suriname_person_search',
# which Datasette derives from the file name.
if [ "$(basename "$DB")" != "suriname_person_search.db" ]; then
  echo "The database file must be named suriname_person_search.db (it may be in another folder)." >&2
  exit 1
fi
if [ ! -f "$DB" ]; then
  echo "Database $DB not found; build it first: python3 scripts/person_search/build_db.py" >&2
  exit 1
fi

EXTRA=()
if [ "$TEAM" = 1 ]; then
  EXTRA+=(--setting default_allow_sql off)
  echo "Team mode: free SQL is off."
fi

echo "Search page: http://127.0.0.1:$PORT/ui/index.html   (stop with Ctrl+C)"
# Datasette 0.65 needs pkg_resources (setuptools < 81) and does not run on Python 3.14.
exec uvx --python 3.12 --from 'datasette==0.65.1' --with 'setuptools<81' datasette serve --immutable "$DB" \
  -m scripts/person_search/metadata.yaml \
  --static ui:scripts/person_search/ui \
  --host 127.0.0.1 --port "$PORT" \
  --setting default_page_size 50 --setting sql_time_limit_ms 20000 \
  --setting allow_download off --setting allow_csv_stream off \
  "${EXTRA[@]}"
