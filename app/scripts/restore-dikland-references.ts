/**
 * Restore researcher-entered Dikland references after the Gazetteer was
 * reseeded for Almanakken v2.
 *
 * The final pre-v2 Gazetteer revision is immutable migration evidence. Its
 * Dikland references are grouped by the primary Wikidata QID and copied to
 * every active current plantation with that QID. No Almanakken v1 rows or
 * derived fields are restored.
 *
 * Run without --write for a non-mutating preview.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DiklandRef, GazetteerPlace } from '../lib/types';
import { getPrimaryAuthorityLink } from '../lib/types';

const DATA_DIR = join(__dirname, '../../data');
const GAZETTEER_PATH = join(DATA_DIR, 'places-gazetteer.jsonld');
const LAST_PRE_V2_REVISION = '44941323c3033371b932e3aa63a87103e6df74bc';
const GAZETTEER_REPO_PATH = 'data/places-gazetteer.jsonld';
const WRITE = process.argv.includes('--write');

type GazetteerDocument = {
  '@graph'?: GazetteerEntry[];
  [key: string]: unknown;
};

type GazetteerEntry = Omit<GazetteerPlace, 'diklandRefs'> & {
  diklandRefs?: DiklandRef[];
};

function qidFor(entry: GazetteerEntry): string | null {
  const qid = getPrimaryAuthorityLink(entry, 'wikidata')?.identifier.trim();
  return qid && /^Q\d+$/.test(qid) ? qid : null;
}

function refKey(ref: DiklandRef): string {
  return JSON.stringify([
    ref.folderPath,
    ref.driveUrl,
    ref.author,
    ref.year,
    ref.notes,
  ]);
}

function withoutDiklandRefs(entry: GazetteerEntry): unknown {
  const clone = structuredClone(entry);
  clone.diklandRefs = [];
  return clone;
}

const historical = JSON.parse(
  execFileSync(
    'git',
    ['show', `${LAST_PRE_V2_REVISION}:${GAZETTEER_REPO_PATH}`],
    { encoding: 'utf-8', maxBuffer: 200 * 1024 * 1024 },
  ),
) as GazetteerDocument;
const current = JSON.parse(
  readFileSync(GAZETTEER_PATH, 'utf-8'),
) as GazetteerDocument;
const restored = structuredClone(current);

const refsByQid = new Map<string, Map<string, DiklandRef>>();
let historicalRecordsWithRefs = 0;
let historicalReferences = 0;
let historicalRecordsWithoutQid = 0;

for (const entry of historical['@graph'] ?? []) {
  const refs = entry.diklandRefs ?? [];
  if (refs.length === 0) continue;
  historicalRecordsWithRefs++;
  historicalReferences += refs.length;

  const qid = qidFor(entry);
  if (!qid) {
    historicalRecordsWithoutQid++;
    continue;
  }

  const refsForQid = refsByQid.get(qid) ?? new Map<string, DiklandRef>();
  for (const ref of refs) refsForQid.set(refKey(ref), ref);
  refsByQid.set(qid, refsForQid);
}

const before = JSON.stringify(
  (current['@graph'] ?? []).map(withoutDiklandRefs),
);
const matchedQids = new Set<string>();
let matchedPlantations = 0;
let referencesAdded = 0;

for (const entry of restored['@graph'] ?? []) {
  if (entry.type !== 'plantation' || entry.deprecated || entry.mergedInto) {
    continue;
  }
  const qid = qidFor(entry);
  const historicalRefs = qid ? refsByQid.get(qid) : undefined;
  if (!qid || !historicalRefs) continue;

  matchedQids.add(qid);
  matchedPlantations++;
  const combined = new Map<string, DiklandRef>();
  for (const ref of entry.diklandRefs ?? []) combined.set(refKey(ref), ref);
  const previousSize = combined.size;
  for (const [key, ref] of historicalRefs) combined.set(key, ref);
  referencesAdded += combined.size - previousSize;
  entry.diklandRefs = [...combined.values()];
}

const after = JSON.stringify(
  (restored['@graph'] ?? []).map(withoutDiklandRefs),
);
assert.equal(
  after,
  before,
  'Dikland restoration changed data outside diklandRefs.',
);
assert(matchedPlantations > 0, 'No current plantation matched a historical QID.');

const unmatchedQids = [...refsByQid.keys()].filter(
  (qid) => !matchedQids.has(qid),
);
const unmatchedReferences = unmatchedQids.reduce(
  (count, qid) => count + (refsByQid.get(qid)?.size ?? 0),
  0,
);

console.log('Dikland reference restoration audit');
console.log(`  Evidence revision: ${LAST_PRE_V2_REVISION}`);
console.log(
  `  Historical manual data: ${historicalRecordsWithRefs} records; ${historicalReferences} references`,
);
console.log(
  `  QID mapping: ${refsByQid.size} historical QIDs; ${matchedQids.size} matched; ${unmatchedQids.length} unmatched`,
);
console.log(
  `  Current targets: ${matchedPlantations} active plantations; ${referencesAdded} references to add`,
);
console.log(
  `  Not restored by QID: ${historicalRecordsWithoutQid} records without QID; ${unmatchedReferences} references on unmatched QIDs`,
);
console.log('  Non-Dikland data preservation: verified');

if (!WRITE) {
  console.log('  Dry run only; pass --write to update the Gazetteer.');
  process.exit(0);
}

writeFileSync(GAZETTEER_PATH, JSON.stringify(restored, null, 2), 'utf-8');
console.log(`  Wrote ${GAZETTEER_PATH}`);
