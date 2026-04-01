/**
 * Seed script: generate the initial places-gazetteer.json from existing project data.
 *
 * Reads:
 *   - public/data/places.json        (E53 Place entities with geometry)
 *   - public/data/plantations.json   (E24 Plantations for Q-ID + labels)
 *   - ../data/07-gis-plantation-map-1930/plantation_polygons_1930.csv (PSUR IDs)
 *   - ../data/06-almanakken .../...  (CSV for districts, location refs, product)
 *
 * Writes:
 *   - ../data/places-gazetteer.json  (canonical gazetteer file)
 *   - public/data/places-gazetteer.json (app-accessible copy)
 *
 * Run with: pnpm seed-gazetteer
 */
import { parse } from 'csv-parse/sync';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

interface GazetteerPlace {
  id: string;
  type: 'plantation' | 'district' | 'river' | 'settlement';
  prefLabel: string;
  altLabels: string[];
  broader: string | null;
  description: string;
  location: {
    lat: number | null;
    lng: number | null;
    wkt: string | null;
    crs: string;
  };
  sources: string[];
  wikidataQid: string | null;
  fid: number | null;
  psurIds: string[];
  district: string | null;
  locationDescription: string | null;
  placeType: string | null;
  modifiedBy: string | null;
  modifiedAt: string | null;
}

// ── Paths ──────────────────────────────────────────────────────────

const PUBLIC_DIR = join(__dirname, '../public/data');
const DATA_DIR = join(__dirname, '../../data');
const ALMANAKKEN_CSV = join(
  DATA_DIR,
  '06-almanakken - Plantations Surinaamse Almanakken',
  'Plantations Surinaamse Almanakken v1.0.csv',
);
const QGIS_CSV = join(
  DATA_DIR,
  '07-gis-plantation-map-1930',
  'plantation_polygons_1930.csv',
);

// ── Load existing processed data ───────────────────────────────────

console.log('Loading places.json...');
const placesRaw: Record<string, Record<string, unknown>> = JSON.parse(
  readFileSync(join(PUBLIC_DIR, 'places.json'), 'utf-8'),
);

console.log('Loading plantations.json...');
const plantationsRaw: Record<string, Record<string, unknown>> = JSON.parse(
  readFileSync(join(PUBLIC_DIR, 'plantations.json'), 'utf-8'),
);

// Build plantation lookup: placeUri -> plantation data
const plantationByPlace = new Map<string, Record<string, unknown>>();
for (const p of Object.values(plantationsRaw)) {
  const placeUri = p['P53_has_location'] as string | undefined;
  if (placeUri) {
    plantationByPlace.set(placeUri, p);
  }
}

// ── Load QGIS CSV for PSUR IDs ────────────────────────────────────

console.log('Loading QGIS CSV for PSUR IDs...');
const qgisContent = readFileSync(QGIS_CSV, 'utf-8');
const qgisRows = parse(qgisContent, {
  columns: true,
  skip_empty_lines: true,
  delimiter: ';',
  trim: true,
});

// Map fid -> psur IDs
const psurByFid = new Map<number, string[]>();
for (const row of qgisRows as Record<string, string>[]) {
  const fid = parseInt(row['fid'], 10);
  if (isNaN(fid)) continue;
  const ids: string[] = [];
  for (const col of ['psur_id', 'psur_id2', 'psur_id3']) {
    const v = (row[col] || '').trim();
    if (v) ids.push(v);
  }
  psurByFid.set(fid, ids);
}
console.log(`  ${psurByFid.size} QGIS features with FIDs`);
const withPsur = Array.from(psurByFid.values()).filter(
  (ids) => ids.length > 0,
).length;
console.log(`  ${withPsur} have PSUR IDs`);

// ── Load almanakken CSV for district + location linking ────────────

console.log('Loading almanakken CSV...');
const almContent = readFileSync(ALMANAKKEN_CSV, 'latin1');
const almRows = parse(almContent, {
  columns: true,
  skip_empty_lines: true,
  trim: true,
});

// Build per-QID aggregates: most common district, loc_std, product
interface AlmAggregate {
  districts: Map<string, number>;
  locations: Map<string, number>;
  products: Map<string, number>;
}
const almByQid = new Map<string, AlmAggregate>();

const allDistricts = new Set<string>();
const allLocations = new Set<string>();

for (const row of almRows as Record<string, string>[]) {
  const qid = (row['plantation_id'] || '').trim();
  const d = (row['district_of_divisie'] || '').trim();
  const l = (row['loc_std'] || '').trim();
  const prod = (row['product_std'] || '').trim();

  if (d) allDistricts.add(d);
  if (l) allLocations.add(l);

  if (!qid) continue;

  let agg = almByQid.get(qid);
  if (!agg) {
    agg = { districts: new Map(), locations: new Map(), products: new Map() };
    almByQid.set(qid, agg);
  }
  if (d) agg.districts.set(d, (agg.districts.get(d) || 0) + 1);
  if (l) agg.locations.set(l, (agg.locations.get(l) || 0) + 1);
  if (prod) agg.products.set(prod, (agg.products.get(prod) || 0) + 1);
}

console.log(`  ${almByQid.size} unique Q-IDs in almanakken`);

/** Get the most frequent value from a frequency map */
function mostCommon(map: Map<string, number>): string | null {
  let best: string | null = null;
  let max = 0;
  for (const [k, v] of map) {
    if (v > max) {
      best = k;
      max = v;
    }
  }
  return best;
}

/** Build district slug for broader linking */
function districtSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+$/, '');
}

// ── Extract centroids from WKT polygons ────────────────────────────

function centroidFromWKT(wkt: string): { lat: number; lng: number } | null {
  const match = wkt.match(/\(\((.+)\)\)/);
  if (!match) return null;
  const coords = match[1].split(',').map((pair) => {
    const [lng, lat] = pair.trim().split(/\s+/).map(Number);
    return { lat, lng };
  });
  if (coords.length === 0) return null;
  const sumLat = coords.reduce((s, c) => s + c.lat, 0);
  const sumLng = coords.reduce((s, c) => s + c.lng, 0);
  return { lat: sumLat / coords.length, lng: sumLng / coords.length };
}

// ── Sequential ID counter ──────────────────────────────────────────

let nextSeq = 1;
function nextId(prefix: string): string {
  return `${prefix}-${String(nextSeq++).padStart(5, '0')}`;
}

// ── 1. District entries ────────────────────────────────────────────

console.log('Creating district entries...');
const gazetteer: GazetteerPlace[] = [];
const districtIdMap = new Map<string, string>(); // district name -> stable id

for (const name of Array.from(allDistricts).sort()) {
  const id = nextId('stm');
  districtIdMap.set(name, id);
  gazetteer.push({
    id,
    type: 'district',
    prefLabel: name,
    altLabels: [],
    broader: null,
    description: 'Administrative district/division from Surinaamse Almanakken',
    location: { lat: null, lng: null, wkt: null, crs: 'EPSG:4326' },
    sources: ['almanakken'],
    wikidataQid: null,
    fid: null,
    psurIds: [],
    district: null,
    locationDescription: null,
    placeType: null,
    modifiedBy: null,
    modifiedAt: null,
  });
}
console.log(`  ${allDistricts.size} districts`);

// ── 2. River/creek/road entries ────────────────────────────────────

console.log('Creating river/location entries...');
for (const name of Array.from(allLocations).sort()) {
  gazetteer.push({
    id: nextId('stm'),
    type: 'river',
    prefLabel: name,
    altLabels: [],
    broader: null,
    description:
      name.includes('Kreek') ||
      name.includes('rivier') ||
      name.includes('Kanaal') ||
      name.includes('kust')
        ? 'River, creek, or waterway from Surinaamse Almanakken'
        : 'Road or path from Surinaamse Almanakken',
    location: { lat: null, lng: null, wkt: null, crs: 'EPSG:4326' },
    sources: ['almanakken'],
    wikidataQid: null,
    fid: null,
    psurIds: [],
    district: null,
    locationDescription: null,
    placeType: null,
    modifiedBy: null,
    modifiedAt: null,
  });
}
console.log(`  ${allLocations.size} locations (rivers/creeks/roads)`);

// ── 3. Plantation places (from E53 + E24 + QGIS + almanakken) ─────

console.log('Processing plantation places...');
let linkedDistricts = 0;
let linkedLocDesc = 0;
let linkedProduct = 0;
let linkedPsur = 0;

for (const place of Object.values(placesRaw)) {
  const placeId = place['@id'] as string;
  const fid = place['fid'] as number;
  const label = (place['observedLabel'] as string) || `Place ${fid}`;
  const geom = place['hasGeometry'] as { asWKT?: string } | undefined;
  const wkt = geom?.asWKT || null;
  const centroid = wkt ? centroidFromWKT(wkt) : null;

  // Find linked plantation for Q-ID
  const plantation = plantationByPlace.get(placeId);
  const ownerUri = plantation?.['P52_has_current_owner'] as string | undefined;
  const qid = ownerUri?.startsWith('http://www.wikidata.org/entity/')
    ? ownerUri.replace('http://www.wikidata.org/entity/', '')
    : null;

  // Alt labels
  const altLabels: string[] = [];
  const prefLabel = (plantation?.['prefLabel'] as string) || label;
  if (prefLabel !== label && label) {
    altLabels.push(label);
  }

  // PSUR IDs from QGIS CSV
  const psurIds = psurByFid.get(fid) || [];
  if (psurIds.length > 0) linkedPsur++;

  // Almanakken enrichment via Q-ID
  let districtName: string | null = null;
  let districtId: string | null = null;
  let locationDescription: string | null = null;
  let placeType: string | null = null;

  if (qid) {
    const agg = almByQid.get(qid);
    if (agg) {
      districtName = mostCommon(agg.districts);
      if (districtName) {
        districtId = districtIdMap.get(districtName) || null;
        linkedDistricts++;
      }
      locationDescription = mostCommon(agg.locations);
      if (locationDescription) linkedLocDesc++;
      placeType = mostCommon(agg.products);
      if (placeType) linkedProduct++;
    }
  }

  const sources = ['map-1930'];
  if (qid && almByQid.has(qid)) sources.push('almanakken');
  if (psurIds.length > 0) sources.push('slave-registers');

  gazetteer.push({
    id: nextId('stm'),
    type: 'plantation',
    prefLabel,
    altLabels,
    broader: districtId,
    description: '',
    location: {
      lat: centroid?.lat ?? null,
      lng: centroid?.lng ?? null,
      wkt,
      crs: 'EPSG:4326',
    },
    sources,
    wikidataQid: qid,
    fid,
    psurIds,
    district: districtName,
    locationDescription,
    placeType,
    modifiedBy: null,
    modifiedAt: null,
  });
}

console.log(`  ${Object.keys(placesRaw).length} plantation places`);
console.log(`  ${linkedDistricts} linked to districts`);
console.log(`  ${linkedLocDesc} with location descriptions`);
console.log(`  ${linkedProduct} with product/place types`);
console.log(`  ${linkedPsur} with PSUR IDs`);

// ── Sort and write ─────────────────────────────────────────────────

gazetteer.sort((a, b) => {
  const typeOrder = { district: 0, river: 1, settlement: 2, plantation: 3 };
  const diff = typeOrder[a.type] - typeOrder[b.type];
  if (diff !== 0) return diff;
  return a.prefLabel.localeCompare(b.prefLabel);
});

console.log(`\nTotal: ${gazetteer.length} gazetteer entries`);

const json = JSON.stringify(gazetteer, null, 2);

// Write to data root (source of truth)
const dataPath = join(DATA_DIR, 'places-gazetteer.json');
writeFileSync(dataPath, json, 'utf-8');
console.log(`Wrote ${dataPath}`);

// Write to public/data (app-accessible)
const publicPath = join(PUBLIC_DIR, 'places-gazetteer.json');
writeFileSync(publicPath, json, 'utf-8');
console.log(`Wrote ${publicPath}`);
