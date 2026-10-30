#!/usr/bin/env python3
"""Create the (empty) contributions database next to the person search database.

Visitors add knowledge about deceased people (a relation, 'this is the same person',
a story, a correction). Their contributions go into a SEPARATE file,
contributions.db, served by the same Datasette; the archive database stays
read-only (--immutable).

    python3 scripts/person_search/contributions.py [path/to/contributions.db]

Existing contributions are never touched: the table is only created when missing.
Contributions can contain personal data of the contributor and of living relatives:
`reviewed` stays 0 until a team member has looked at it, and the public query
`contributions_for_person` only returns reviewed rows unless asked otherwise.
"""
import os
import sqlite3
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

SCHEMA = """
CREATE TABLE IF NOT EXISTS contributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER,
  obs_key TEXT,
  patient_id INTEGER,
  kind TEXT,                 -- 'relation', 'same_person', 'story', 'correction'
  value TEXT,
  related_person_id INTEGER,
  contributor TEXT,
  consent INTEGER,
  reviewed INTEGER DEFAULT 0,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_contrib_person ON contributions(person_id);
CREATE INDEX IF NOT EXISTS idx_contrib_patient ON contributions(patient_id);
"""


def init(path):
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA)
    conn.commit()
    n = conn.execute('SELECT COUNT(*) FROM contributions').fetchone()[0]
    conn.close()
    return n


if __name__ == '__main__':
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(REPO, 'contributions.db')
    n = init(path)
    print(f'{path}: contributions table ready ({n} rows)')
