/**
 * Build-time script to pre-process database.jsonld into smaller indexed JSON files.
 * Run with: pnpm prepare-data
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';

const LOD_DIR = join(__dirname, '../lod');
const OUT_DIR = join(__dirname, '../public/data');

mkdirSync(OUT_DIR, { recursive: true });

// Load the full database
console.log('Loading database.jsonld...');
const db = JSON.parse(readFileSync(join(LOD_DIR, 'database.jsonld'), 'utf-8'));
const graph: Record<string, unknown>[] = db['@graph'];
console.log(`  ${graph.length} entities loaded`);

// Classify entities by type
const plantations: Record<string, unknown>[] = [];
const organizations: Record<string, unknown>[] = [];
const places: Record<string, unknown>[] = [];
const appellations: Record<string, unknown>[] = [];
const sources: Record<string, unknown>[] = [];
const observations: Record<string, unknown>[] = [];
const provenance: Record<string, unknown>[] = [];

for (const entity of graph) {
  const types = Array.isArray(entity['@type'])
    ? entity['@type']
    : [entity['@type']];
  const typeSet = new Set(types as string[]);

  if (typeSet.has('Plantation')) {
    plantations.push(entity);
  } else if (typeSet.has('E74_Group')) {
    organizations.push(entity);
  } else if (typeSet.has('E53_Place')) {
    places.push(entity);
  } else if (typeSet.has('E41_Appellation')) {
    appellations.push(entity);
  } else if (typeSet.has('E22_Human_Made_Object')) {
    sources.push(entity);
  } else if (typeSet.has('OrganizationObservation')) {
    observations.push(entity);
  } else if (typeSet.has('ProvenanceRecord')) {
    provenance.push(entity);
  }
}

console.log(`  Plantations: ${plantations.length}`);
console.log(`  Organizations: ${organizations.length}`);
console.log(`  Places: ${places.length}`);
console.log(`  Appellations: ${appellations.length}`);
console.log(`  Sources: ${sources.length}`);
console.log(`  Observations: ${observations.length}`);
console.log(`  Provenance: ${provenance.length}`);

// Build indexes

// Plantation index: keyed by @id
const plantationIndex: Record<string, unknown> = {};
for (const p of plantations) {
  plantationIndex[p['@id'] as string] = p;
}

// Organization index: keyed by @id (wd:Q...)
const orgIndex: Record<string, unknown> = {};
for (const o of organizations) {
  orgIndex[o['@id'] as string] = o;
}

// Place index: keyed by @id
const placeIndex: Record<string, unknown> = {};
for (const p of places) {
  placeIndex[p['@id'] as string] = p;
}

// Source index: keyed by @id
const sourceIndex: Record<string, unknown> = {};
for (const s of sources) {
  sourceIndex[s['@id'] as string] = s;
}

// Appellation index: grouped by P1i_identifies
const appellationsByEntity: Record<string, unknown[]> = {};
for (const a of appellations) {
  const identifies = a['P1i_identifies'] as string;
  if (identifies) {
    if (!appellationsByEntity[identifies]) {
      appellationsByEntity[identifies] = [];
    }
    appellationsByEntity[identifies].push(a);
  }
}

// Observation index: grouped by observationOf (organization URI)
const observationsByOrg: Record<string, unknown[]> = {};
for (const o of observations) {
  const org = o['observationOf'] as string;
  if (org) {
    if (!observationsByOrg[org]) {
      observationsByOrg[org] = [];
    }
    observationsByOrg[org].push(o);
  }
}

// Provenance index: keyed by @id
const provenanceIndex: Record<string, unknown> = {};
for (const p of provenance) {
  provenanceIndex[p['@id'] as string] = p;
}

// Write output files
function writeJSON(filename: string, data: unknown) {
  const path = join(OUT_DIR, filename);
  writeFileSync(path, JSON.stringify(data));
  const sizeMB = (
    Buffer.byteLength(JSON.stringify(data)) /
    1024 /
    1024
  ).toFixed(2);
  console.log(`  Wrote ${filename} (${sizeMB} MB)`);
}

console.log('\nWriting indexed data files...');
writeJSON('plantations.json', plantationIndex);
writeJSON('organizations.json', orgIndex);
writeJSON('places.json', placeIndex);
writeJSON('sources.json', sourceIndex);
writeJSON('appellations-by-entity.json', appellationsByEntity);
writeJSON('observations-by-org.json', observationsByOrg);
writeJSON('provenance.json', provenanceIndex);

// Copy GeoJSON
const geojsonSrc = join(LOD_DIR, 'map-features.geojson');
if (existsSync(geojsonSrc)) {
  copyFileSync(geojsonSrc, join(OUT_DIR, 'map-features.geojson'));
  console.log('  Copied map-features.geojson');
}

// Copy places gazetteer (if it exists in data root)
const gazetteerSrc = join(__dirname, '../../data/places-gazetteer.json');
if (existsSync(gazetteerSrc)) {
  copyFileSync(gazetteerSrc, join(OUT_DIR, 'places-gazetteer.json'));
  console.log('  Copied places-gazetteer.json');
}

console.log('\nDone! Data files ready in public/data/');
