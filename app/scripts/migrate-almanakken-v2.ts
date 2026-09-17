/**
 * Audit and migrate the Gazetteer to the canonical Almanakken v2 source.
 *
 * The only field changed here is the Almanakken source membership. Detailed
 * v2 observations and derived assertions are rebuilt by the following pipeline
 * stages. Run without --write for a non-mutating migration preview.
 */

import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { GazetteerPlace } from '../lib/types';
import { getPrimaryAuthorityLink } from '../lib/types';
import {
  ALMANAKKEN_V2_COLUMNS,
  almanakkenField,
  readAlmanakkenRows,
} from './almanakken';

const DATA_DIR = join(__dirname, '../../data');
const GAZETTEER_PATH = join(DATA_DIR, 'places-gazetteer.jsonld');
const PUBLIC_GAZETTEER = join(
  __dirname,
  '../public/data/places-gazetteer.jsonld',
);
const SOURCE_ID = 'almanakken';
const WRITE = process.argv.includes('--write');

type GazetteerDocument = {
  '@graph'?: GazetteerPlace[];
  [key: string]: unknown;
};

function editorialProjection(entry: GazetteerPlace): unknown {
  const clone = structuredClone(entry);
  clone.sources = clone.sources.filter((source) => source !== SOURCE_ID);
  clone.productAssertions = (clone.productAssertions ?? []).filter(
    (assertion) => assertion.source !== SOURCE_ID,
  );
  clone.statusAssertions = (clone.statusAssertions ?? []).filter(
    (assertion) => assertion.source !== SOURCE_ID,
  );
  delete clone.almanakkenObservations;
  return clone;
}

const { rows, path, version } = readAlmanakkenRows();
const recordIds = rows.map((row) => almanakkenField(row, 'recordid'));
const uniqueRecordIds = new Set(recordIds);
assert(recordIds.every(Boolean), 'Every Almanakken v2 row must have a recordid.');
assert.equal(
  uniqueRecordIds.size,
  rows.length,
  'Almanakken v2 recordid values must be unique.',
);

const qidValues = rows
  .map((row) => almanakkenField(row, 'plantation_id'))
  .filter(Boolean);
assert(
  qidValues.every((qid) => /^Q\d+$/.test(qid)),
  'Every non-empty plantation_id must be a Wikidata QID.',
);
const v2Qids = new Set(qidValues);

const original = JSON.parse(readFileSync(GAZETTEER_PATH, 'utf-8')) as GazetteerDocument;
const migrated = structuredClone(original);
const graph = migrated['@graph'] ?? [];
const editorialBefore = JSON.stringify(
  (original['@graph'] ?? []).map(editorialProjection),
);

let sourceLinksAdded = 0;
let staleSourceLinksRemoved = 0;
let matchedPlantations = 0;
for (const entry of graph) {
  if (entry.type !== 'plantation') continue;
  const qid = getPrimaryAuthorityLink(entry, 'wikidata')?.identifier;
  const hasV2Rows = Boolean(qid && v2Qids.has(qid));
  const currentSources = entry.sources;
  const withoutAlmanakken = currentSources.filter(
    (source) => source !== SOURCE_ID,
  );

  if (hasV2Rows) {
    matchedPlantations++;
    if (!currentSources.includes(SOURCE_ID)) {
      sourceLinksAdded++;
      entry.sources = [...currentSources, SOURCE_ID];
    }
  } else {
    if (currentSources.includes(SOURCE_ID)) staleSourceLinksRemoved++;
    entry.sources = withoutAlmanakken;
  }
}

const editorialAfter = JSON.stringify(graph.map(editorialProjection));
assert.equal(
  editorialAfter,
  editorialBefore,
  'Migration changed researcher-authored Gazetteer data.',
);

console.log(`Almanakken ${version} migration audit`);
console.log(`  Source: ${path}`);
console.log(`  Schema: ${ALMANAKKEN_V2_COLUMNS.length} columns`);
console.log(`  Rows: ${rows.length} (${uniqueRecordIds.size} unique record IDs)`);
console.log(
  `  QIDs: ${v2Qids.size} organizations; ${rows.length - qidValues.length} unlinked rows`,
);
console.log(`  Gazetteer plantations matched: ${matchedPlantations}`);
console.log(`  Source links to add: ${sourceLinksAdded}`);
console.log(`  Stale source links to remove: ${staleSourceLinksRemoved}`);
console.log('  Editorial data preservation: verified');

if (!WRITE) {
  console.log('  Dry run only; pass --write to update Gazetteer source links.');
  process.exit(0);
}

const output = JSON.stringify(migrated, null, 2);
writeFileSync(GAZETTEER_PATH, output, 'utf-8');
mkdirSync(dirname(PUBLIC_GAZETTEER), { recursive: true });
writeFileSync(PUBLIC_GAZETTEER, output, 'utf-8');
console.log(`  Wrote ${GAZETTEER_PATH}`);
console.log(`  Wrote ${PUBLIC_GAZETTEER}`);
