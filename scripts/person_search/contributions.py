#!/usr/bin/env python3
"""Create or upgrade the contributions database next to the person search database.

Visitors add knowledge about deceased people (a relation, 'this is the same person',
a story, a correction). Their contributions go into a SEPARATE file,
contributions.db, served by the same Datasette; the archive database stays
read-only (--immutable).

    python3 scripts/person_search/contributions.py [path/to/contributions.db]

Tables
  contributions   one row per fact a visitor adds (dataset rows); integer ids keep
                  the sync query (contributions_since) working
  stories         one spoken story about a person ("I was here" app)
  story_entities  every entity recognised in a story, with character offsets in the
                  transcript, and the archive key it is linked to

Existing data is never dropped: tables are created when missing and missing columns
are added to an older contributions table. Contributions can contain personal data of
the contributor and of living relatives: `reviewed` stays 0 until a team member has
looked at it, and the public read queries only return reviewed rows unless asked.
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
  kind TEXT,                 -- relation, same_person, story, correction, fact, place, date, narrator
  value TEXT,
  related_person_id INTEGER,
  contributor TEXT,
  consent INTEGER,
  reviewed INTEGER DEFAULT 0,
  created_at TEXT,
  uid TEXT,                  -- uuid, made by the app server
  story_id TEXT,             -- -> stories.id
  person_key TEXT,           -- patient:<id> / person:<id> / name:<uuid> the row is about
  relation_type TEXT,        -- parent | child | sibling | spouse | grandparent | grandchild | friend | colleague | other
  related_key TEXT,          -- patient:/person:/name: of the other person
  related_obs_key TEXT,      -- -> persons.obs_key
  related_patient_id INTEGER,-- -> mh1921_patienten.patient_id
  name_raw TEXT,             -- name as told, when not (yet) in the archive
  field TEXT,                -- occupation | birth_year | death_year | religion | address_text
  place_raw TEXT,            -- place as told
  place_norm TEXT,           -- -> places.place_norm
  year INTEGER,
  quote TEXT,                -- sentence from the story
  confirmed INTEGER,         -- 1 = the teller confirmed it
  contributor_key TEXT       -- name:<uuid> of the teller
);

CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,               -- uuid, made by the app server
  person_key TEXT,                   -- patient:<id> / person:<id> / name:<uuid> the story is about
  person_id INTEGER,                 -- -> persons.person_id   (if person:)
  obs_key TEXT,                      -- -> persons.obs_key     (stable across archive rebuilds)
  patient_id INTEGER,                -- -> mh1921_patienten.patient_id (if patient:)
  person_name TEXT,
  transcript TEXT,
  summary TEXT,
  narrator_key TEXT,                 -- name:<uuid>, the storyteller as a person of their own
  narrator_name TEXT,
  narrator_relation TEXT,            -- relation_type of the teller to the person
  narrator_relation_label TEXT,      -- as chosen in the app, e.g. "Achterkleinkind"
  narrator_about TEXT,
  consent INTEGER,
  created_at TEXT,
  reviewed INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS story_entities (
  id TEXT PRIMARY KEY,               -- uuid
  story_id TEXT,                     -- -> stories.id
  start INTEGER, "end" INTEGER,      -- character offsets in stories.transcript
  mention TEXT,                      -- the words as in the transcript
  type TEXT,                         -- person | place | date | occupation | relation | organisation | other
  category TEXT,                     -- per | pla | dat | rol | rel | oth (display colour)
  about TEXT,                        -- subject | narrator | another person's name
  is_subject INTEGER,                -- 1 = this is the story's person themselves
  confirmed INTEGER,                 -- 1 = the teller confirmed it
  quote TEXT,                        -- the sentence it comes from
  link TEXT,                         -- archive key it is linked to (patient:/person:/place:)
  link_label TEXT,
  link_person_id INTEGER,            -- -> persons.person_id
  link_obs_key TEXT,                 -- -> persons.obs_key
  link_patient_id INTEGER,           -- -> mh1921_patienten.patient_id
  link_place_norm TEXT,              -- -> places.place_norm
  contribution_uid TEXT              -- -> contributions.uid, if it became a dataset row
);
"""

# Columns added to contributions after the first version (for databases made before).
NEW_CONTRIBUTION_COLUMNS = [
    ('uid', 'TEXT'), ('story_id', 'TEXT'), ('person_key', 'TEXT'), ('relation_type', 'TEXT'),
    ('related_key', 'TEXT'), ('related_obs_key', 'TEXT'), ('related_patient_id', 'INTEGER'),
    ('name_raw', 'TEXT'), ('field', 'TEXT'), ('place_raw', 'TEXT'), ('place_norm', 'TEXT'),
    ('year', 'INTEGER'), ('quote', 'TEXT'), ('confirmed', 'INTEGER'), ('contributor_key', 'TEXT'),
]

INDEXES = """
CREATE INDEX IF NOT EXISTS idx_contrib_person ON contributions(person_id);
CREATE INDEX IF NOT EXISTS idx_contrib_patient ON contributions(patient_id);
CREATE UNIQUE INDEX IF NOT EXISTS contributions_uid ON contributions(uid);
CREATE INDEX IF NOT EXISTS contributions_story ON contributions(story_id);
CREATE INDEX IF NOT EXISTS contributions_person_key ON contributions(person_key);
CREATE INDEX IF NOT EXISTS stories_person_key ON stories(person_key);
CREATE INDEX IF NOT EXISTS story_entities_story ON story_entities(story_id);
CREATE INDEX IF NOT EXISTS story_entities_obs_key ON story_entities(link_obs_key);
CREATE INDEX IF NOT EXISTS story_entities_patient ON story_entities(link_patient_id);
CREATE INDEX IF NOT EXISTS story_entities_link ON story_entities(link);
"""


def init(path):
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA)
    have = {r[1] for r in conn.execute('PRAGMA table_info(contributions)')}
    for col, typ in NEW_CONTRIBUTION_COLUMNS:
        if col not in have:
            conn.execute(f'ALTER TABLE contributions ADD COLUMN {col} {typ}')
    conn.executescript(INDEXES)
    conn.commit()
    counts = {t: conn.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]
              for t in ('contributions', 'stories', 'story_entities')}
    conn.close()
    return counts


if __name__ == '__main__':
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(REPO, 'contributions.db')
    counts = init(path)
    print(f'{path}: tables ready (' + ', '.join(f'{k} {v} rows' for k, v in counts.items()) + ')')
