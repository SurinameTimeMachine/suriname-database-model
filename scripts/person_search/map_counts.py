#!/usr/bin/env python3
"""Precompute the number of persons per mapped place for the map overview.

The map page needs, for every gazetteer place with coordinates, the number of distinct
persons on records that name that place. Computed live this takes ~20 s on the full
database (close to Datasette's time limit), so it is stored once in `map_place_counts`.

Runs at the end of build_db.py (after link_places.py), or standalone on an existing DB:

    python3 scripts/person_search/map_counts.py [suriname_person_search.db]

Rerun after link_places.py or fix_dates.py.
"""
import os
import sqlite3
import sys
import time

SQL = """
DROP TABLE IF EXISTS map_place_counts;
CREATE TABLE map_place_counts AS
WITH linked AS (
  SELECT DISTINCT g.gazetteer_id, l.certificate_id
  FROM place_geo g
  JOIN places pl ON pl.place_norm = g.location_norm
  JOIN locations l ON l.location_norm = g.location_norm
  WHERE g.gazetteer_id IS NOT NULL AND g.lat IS NOT NULL AND g.lng IS NOT NULL
)
SELECT l.gazetteer_id, COUNT(DISTINCT p.person_id) AS person_count
FROM linked l JOIN persons p ON p.certificate_id = l.certificate_id
GROUP BY l.gazetteer_id;
CREATE UNIQUE INDEX idx_map_place_counts ON map_place_counts(gazetteer_id);
"""


def run(conn, log=print):
    t = time.time()
    conn.executescript(SQL)
    conn.commit()
    n = conn.execute('SELECT COUNT(*) FROM map_place_counts').fetchone()[0]
    log(f'  map_place_counts: {n} places ({time.time() - t:.1f}s)')
    return n


if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    db = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, '..', '..', 'suriname_person_search.db')
    run(sqlite3.connect(db))
