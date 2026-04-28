/**
 * Derive 'present' StatusAssertions from sources that attest a plantation's
 * existence at a given point in time (maps, registers, etc.) and patch them
 * into places-gazetteer.jsonld.
 *
 * CRM alignment:
 *   StatusAssertion (present) → E17 Type Assignment
 *     P41 classified  → E25 Plantation
 *     P42 assigned    → E55 Type  type/plantation-status/present
 *     P4 has time-span → E52 Time-Span (startYear only — point in time)
 *     prov:hadPrimarySource → E22 <source>
 *
 * Design: each source is declared as a PresenceSource config. The script reads
 * every configured source, extracts Q-IDs, and adds one 'present' assertion
 * per source per plantation. Assertions from different sources stack up — a
 * plantation attested by both map-1930 and slave-registers gets two assertions.
 *
 * Adding a new source: add an entry to PRESENCE_SOURCES below. The source's
 * sourceId must exist in data/sources-registry.jsonld.
 *
 * Skips: existing 'present' assertions for the same source are not duplicated
 * unless --force is passed.
 *
 * Run with:
 *   pnpm derive-presence
 *   pnpm derive-presence -- --force
 */

import { parse } from 'csv-parse/sync';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type {
  GazetteerPlace,
  PlantationStatusType,
  StatusAssertion,
} from '../lib/types';

// ── Paths ──────────────────────────────────────────────────────────────────

const DATA_DIR = join(__dirname, '../../data');
const GAZETTEER_PATH = join(DATA_DIR, 'places-gazetteer.jsonld');
const PUBLIC_GAZETTEER = join(
  __dirname,
  '../public/data/places-gazetteer.jsonld',
);

// ── Config ─────────────────────────────────────────────────────────────────

const FORCE = process.argv.includes('--force');

interface PresenceSource {
  /** Registry sourceId — must exist in sources-registry.jsonld */
  sourceId: string;
  /** The year this source represents (used as startYear on the assertion) */
  year: number;
  /** Absolute path to the CSV file */
  csvPath: string;
  /** Column name containing Wikidata Q-IDs */
  qidColumn: string;
  /** CSV delimiter (default: ',') */
  delimiter?: string;
  /** CSV encoding (default: 'utf-8') */
  encoding?: string;
  /** Human-readable note attached to the assertion */
  note: string;
}

/**
 * Configured presence sources.
 *
 * To add a new source:
 *   1. Ensure its sourceId exists in data/sources-registry.jsonld
 *   2. Add an entry here with the CSV path and Q-ID column name
 *   3. Run `pnpm derive-presence -- --force`
 */
const PRESENCE_SOURCES: PresenceSource[] = [
  {
    sourceId: 'map-1930',
    year: 1930,
    csvPath: join(
      DATA_DIR,
      '07-gis-plantation-map-1930',
      'plantation_polygons_1930.csv',
    ),
    qidColumn: 'qid',
    delimiter: ';',
    note: 'Depicted on Kaart van Suriname (1930)',
  },
  // Future sources to add when Q-ID linkage is available:
  // {
  //   sourceId: 'slave-registers',
  //   year: 1863,
  //   csvPath: join(DATA_DIR, '05-slave-emancipation - .../...csv'),
  //   qidColumn: 'plantation_qid',  // not yet in dataset
  //   note: 'Plantation listed in Suriname Slave and Emancipation Registers',
  // },
  // {
  //   sourceId: 'plantagen-dataset',
  //   year: 1863,
  //   csvPath: join(DATA_DIR, '01-plantages-dataset - .../...csv'),
  //   qidColumn: 'wikidata_id',     // column exists but currently empty
  //   note: 'Listed in Suriname Plantation Dataset',
  // },
];

// ── Load Q-IDs per source ──────────────────────────────────────────────────

interface SourcePresence {
  config: PresenceSource;
  qids: Set<string>;
}

console.log('Reading presence sources...');
const sources: SourcePresence[] = [];

for (const config of PRESENCE_SOURCES) {
  const buf = readFileSync(config.csvPath);
  const text = new TextDecoder(config.encoding ?? 'utf-8').decode(buf);
  const rows: Record<string, string>[] = parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    delimiter: config.delimiter ?? ',',
  });

  const qids = new Set(
    rows
      .map((r) => (r[config.qidColumn] ?? '').trim())
      .filter((q) => q.startsWith('Q')),
  );

  console.log(
    `  ${config.sourceId} (${config.year}): ${qids.size} Q-IDs from ${rows.length} rows`,
  );
  sources.push({ config, qids });
}

// ── Read gazetteer and patch ───────────────────────────────────────────────

console.log('Reading gazetteer...');
const gazetteerRaw = readFileSync(GAZETTEER_PATH, 'utf-8');
const gazetteerJsonld = JSON.parse(gazetteerRaw);
const graph: GazetteerPlace[] = gazetteerJsonld['@graph'] || [];

let totalPatched = 0;
let totalSkipped = 0;
let totalNoMatch = 0;

for (const source of sources) {
  const { config, qids } = source;
  let patched = 0;
  let skipped = 0;
  let noMatch = 0;

  for (const entry of graph) {
    if (entry.type !== 'plantation') continue;

    const qid = entry.wikidataQid;
    if (!qid || !qids.has(qid)) {
      noMatch++;
      continue;
    }

    const existing = entry.statusAssertions ?? [];

    // Check if this source's presence assertion already exists
    const alreadyHas = existing.some(
      (a) => a.status === 'present' && a.source === config.sourceId,
    );
    if (alreadyHas && !FORCE) {
      skipped++;
      continue;
    }

    // Remove any existing presence assertion from this source (for --force)
    const filtered = FORCE
      ? existing.filter(
          (a) => !(a.status === 'present' && a.source === config.sourceId),
        )
      : existing;

    const assertion: StatusAssertion = {
      id: `status-${config.sourceId}-present-${config.year}`,
      status: 'present' as PlantationStatusType,
      source: config.sourceId,
      startYear: config.year,
      note: config.note,
    };

    // Insert in chronological order by startYear
    const next = [...filtered, assertion].sort(
      (a, b) => (a.startYear ?? 0) - (b.startYear ?? 0),
    );

    entry.statusAssertions = next;
    patched++;
  }

  console.log(
    `  ${config.sourceId}: Patched ${patched}, Skipped ${skipped}, No match ${noMatch}`,
  );
  totalPatched += patched;
  totalSkipped += skipped;
  totalNoMatch += noMatch;
}

if (totalPatched === 0) {
  console.log(
    '  Nothing to write. Run with --force to overwrite existing assertions.',
  );
  process.exit(0);
}

// ── Write out ──────────────────────────────────────────────────────────────

const outStr = JSON.stringify(gazetteerJsonld, null, 2);
writeFileSync(GAZETTEER_PATH, outStr, 'utf-8');
console.log(`Wrote ${GAZETTEER_PATH}`);

try {
  writeFileSync(PUBLIC_GAZETTEER, outStr, 'utf-8');
  console.log(`Wrote public copy: ${PUBLIC_GAZETTEER}`);
} catch (err) {
  console.error(
    `Error: could not write public copy at ${PUBLIC_GAZETTEER}`,
    err,
  );
  process.exit(1);
}

console.log(`Done. Total: Patched ${totalPatched}, Skipped ${totalSkipped}`);
