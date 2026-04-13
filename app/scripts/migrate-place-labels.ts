/**
 * One-time migration: convert GazetteerPlace prefLabel + altLabels
 * to the new structured PlaceName[] format on the names field.
 *
 * Migration rules:
 *   prefLabel  -> { text, language: 'nl', type: 'official', isPreferred: true }
 *   altLabel   -> { text, language: 'nl', type: 'historical', isPreferred: false }
 *
 * Run with:
 *   npx tsx app/scripts/migrate-place-labels.ts
 *
 * Migrates both:
 *   data/places-gazetteer.json           (source of truth)
 *   app/public/data/places-gazetteer.jsonld  (served to the browser)
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');

const FILES = [
  join(ROOT, 'data', 'places-gazetteer.json'),
  join(ROOT, 'app', 'public', 'data', 'places-gazetteer.jsonld'),
] as const;

interface LegacyPlace {
  id: string;
  prefLabel?: string;
  altLabels?: string[];
  names?: unknown;
  [key: string]: unknown;
}

interface PlaceName {
  text: string;
  language: 'nl' | 'en' | 'srn' | 'und';
  type: 'official' | 'historical' | 'vernacular' | 'variant';
  isPreferred: boolean;
  source?: string;
  sourceYear?: number;
}

function migratePlace(place: LegacyPlace): LegacyPlace {
  // Already migrated — skip
  if (Array.isArray(place.names) && !place.prefLabel) return place;

  const names: PlaceName[] = [];

  const pref =
    typeof place.prefLabel === 'string' ? place.prefLabel.trim() : '';
  if (pref) {
    names.push({
      text: pref,
      language: 'nl',
      type: 'official',
      isPreferred: true,
    });
  }

  const alts: string[] = Array.isArray(place.altLabels) ? place.altLabels : [];
  for (const alt of alts) {
    const t = typeof alt === 'string' ? alt.trim() : '';
    if (t) {
      names.push({
        text: t,
        language: 'nl',
        type: 'historical',
        isPreferred: false,
      });
    }
  }

  // If no preferred name was found but names exist, promote the first
  if (names.length > 0 && !names.some((n) => n.isPreferred)) {
    names[0].isPreferred = true;
  }

  const migrated = { ...place, names };
  delete migrated.prefLabel;
  delete migrated.altLabels;

  return migrated;
}

function migrateFile(filePath: string) {
  console.log(`Reading ${filePath}`);

  const raw = readFileSync(filePath, 'utf-8');
  const data: unknown = JSON.parse(raw);

  let places: LegacyPlace[];

  // Handle both bare array and @graph-wrapped formats
  const isWrapped =
    data !== null &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    '@graph' in (data as Record<string, unknown>);

  if (isWrapped) {
    places = (data as Record<string, unknown>)['@graph'] as LegacyPlace[];
  } else if (Array.isArray(data)) {
    places = data as LegacyPlace[];
  } else {
    console.error('Unexpected format: expected array or { @graph: [...] }');
    process.exit(1);
  }

  const before = places.length;
  const migrated = places.map(migratePlace);

  // Verify every entry now has at least one name
  const missing = migrated.filter(
    (p) => !Array.isArray(p.names) || (p.names as PlaceName[]).length === 0,
  );
  if (missing.length > 0) {
    console.warn(
      `Warning: ${missing.length} places have no names after migration (ids: ${missing.map((p) => p.id).join(', ')})`,
    );
  }

  const output = isWrapped
    ? { ...(data as Record<string, unknown>), '@graph': migrated }
    : migrated;

  writeFileSync(filePath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`  Migrated ${before} places -> names[] format.`);
  if (missing.length === 0) {
    console.log('  All places have at least one named form.');
  }
}

function main() {
  for (const filePath of FILES) {
    migrateFile(filePath);
  }
  console.log('\nMigration complete.');
}

main();
