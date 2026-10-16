#!/usr/bin/env bash
# Start the local person search page on this computer only.
#
#   scripts/person_search/serve.sh            # uses suriname_person_search.db
#   scripts/person_search/serve.sh other.db
#
# Then open http://127.0.0.1:8001/ui/index.html in a browser.
# The full database contains restricted data: it is served on 127.0.0.1 only,
# with downloads switched off. Do not expose this server to a network.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB="${1:-suriname_person_search.db}"
if [ ! -f "$DB" ]; then
  echo "Database $DB not found; build it first: python3 scripts/person_search/build_db.py" >&2
  exit 1
fi
echo "Search page: http://127.0.0.1:8001/ui/index.html   (stop with Ctrl+C)"
# Datasette 0.65 needs pkg_resources (setuptools < 81) and does not run on Python 3.14.
exec uvx --python 3.12 --from 'datasette==0.65.1' --with 'setuptools<81' datasette serve --immutable "$DB" \
  -m scripts/person_search/metadata.yaml \
  --static ui:scripts/person_search/ui \
  --host 127.0.0.1 --port 8001 \
  --setting default_page_size 50 --setting sql_time_limit_ms 20000 \
  --setting allow_download off --setting allow_csv_stream off
