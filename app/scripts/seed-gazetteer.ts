/**
 * Seed script: generate the initial places-gazetteer.jsonld from existing project data.
 *
 * Reads:
 *   - public/data/places.json        (E53 Place entities with geometry)
 *   - public/data/plantations.json   (E25 Plantations for Q-ID + labels)
 *   - ../data/07-gis-plantation-map-1930/plantation_polygons_1930.csv (PSUR IDs)
 *   - ../data/07-gis-plantation-map-1930/places.csv           (named places)
 *   - ../data/07-gis-plantation-map-1930/military_posts_1882.csv (military posts)
 *   - ../data/07-gis-plantation-map-1930/roads_1930.csv       (road segments)
 *   - ../data/07-gis-plantation-map-1930/railroad_1930.csv    (railroad)
 *   - ../data/06-almanakken .../...  (CSV for districts, location refs, product)
 *
 * Writes:
 *   - ../data/places-gazetteer.jsonld  (canonical gazetteer file, JSON-LD)
 *   - public/data/places-gazetteer.jsonld (app-accessible copy)
 *
 * Run with: pnpm seed-gazetteer
 */
import { parse } from 'csv-parse/sync';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import proj4 from 'proj4';

import type { PlaceType } from '../lib/types';

// Load CRM mapping from the thesaurus file
const thesaurusPath = join(__dirname, '../../data/place-types-thesaurus.jsonld');
const thesaurusData = JSON.parse(readFileSync(thesaurusPath, 'utf-8'));
const PLACE_TYPE_CRM: Record<string, string> = Object.fromEntries(
  (thesaurusData['@graph'] || [])
    .filter((e: Record<string, unknown>) => e.typeId)
    .map((e: Record<string, unknown>) => [e.typeId, e.crmClass]),
);

// Register EPSG:31170 (Suriname Old TM / Zanderij datum)
proj4.defs(
  'EPSG:31170',
  '+proj=tmerc +lat_0=0 +lon_0=-55.68333333333 +k=0.9996 +x_0=500000 +y_0=0 +ellps=intl +towgs84=-265,120,-358,0,0,0,0 +units=m +no_defs',
);

/** Reproject a single X/Y point from EPSG:31170 to WGS84 */
function reprojectPoint(x: number, y: number): { lat: number; lng: number } {
  const [lng, lat] = proj4('EPSG:31170', 'EPSG:4326', [x, y]);
  return { lat, lng };
}

/** Reproject a WKT geometry string from EPSG:31170 to WGS84 */
function reprojectWkt(wktUtm: string): string {
  if (!wktUtm) return wktUtm;
  return wktUtm.replace(/\(([^()]+)\)/g, (_match, coordText: string) => {
    const pairs = coordText.split(',');
    const newPairs = pairs.map((pair: string) => {
      const parts = pair.trim().split(/\s+/);
      if (parts.length >= 2) {
        const x = parseFloat(parts[0]);
        const y = parseFloat(parts[1]);
        if (!isNaN(x) && !isNaN(y)) {
          const [lon, lat] = proj4('EPSG:31170', 'EPSG:4326', [x, y]);
          return `${lon.toFixed(8)} ${lat.toFixed(8)}`;
        }
      }
      return pair.trim();
    });
    return '(' + newPairs.join(', ') + ')';
  });
}

interface GazetteerPlace {
  id: string;
  type: PlaceType;
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
  locationDescriptionOriginal: string | null;
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
const PLACES_CSV = join(
  DATA_DIR,
  '07-gis-plantation-map-1930',
  'places.csv',
);
const MILITARY_CSV = join(
  DATA_DIR,
  '07-gis-plantation-map-1930',
  'military_posts_1882.csv',
);
const ROADS_CSV = join(
  DATA_DIR,
  '07-gis-plantation-map-1930',
  'roads_1930.csv',
);
const RAILROAD_CSV = join(
  DATA_DIR,
  '07-gis-plantation-map-1930',
  'railroad_1930.csv',
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

console.log('Loading physical-features.json...');
const physicalFeaturesRaw: Record<string, Record<string, unknown>> = JSON.parse(
  readFileSync(join(PUBLIC_DIR, 'physical-features.json'), 'utf-8'),
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

// Build per-QID aggregates: most common district, loc_std, loc_org, product, label, psur
interface AlmAggregate {
  districts: Map<string, number>;
  locations: Map<string, number>;
  locationsOriginal: Map<string, number>;
  products: Map<string, number>;
  labels: Map<string, number>;
  psurIds: Set<string>;
}
const almByQid = new Map<string, AlmAggregate>();

const allDistricts = new Set<string>();
const allLocations = new Set<string>();

for (const row of almRows as Record<string, string>[]) {
  const qid = (row['plantation_id'] || '').trim();
  const d = (row['district_of_divisie'] || '').trim();
  const l = (row['loc_std'] || '').trim();
  const lOrg = (row['loc_org'] || '').trim();
  const prod = (row['product_std'] || '').trim();
  const label = (row['plantation_std'] || '').trim();
  const psur = (row['psur_id'] || '').trim();

  if (d) allDistricts.add(d);
  if (l) allLocations.add(l);

  if (!qid) continue;

  let agg = almByQid.get(qid);
  if (!agg) {
    agg = {
      districts: new Map(),
      locations: new Map(),
      locationsOriginal: new Map(),
      products: new Map(),
      labels: new Map(),
      psurIds: new Set(),
    };
    almByQid.set(qid, agg);
  }
  if (d) agg.districts.set(d, (agg.districts.get(d) || 0) + 1);
  if (l) agg.locations.set(l, (agg.locations.get(l) || 0) + 1);
  if (lOrg)
    agg.locationsOriginal.set(lOrg, (agg.locationsOriginal.get(lOrg) || 0) + 1);
  if (prod) agg.products.set(prod, (agg.products.get(prod) || 0) + 1);
  if (label) agg.labels.set(label, (agg.labels.get(label) || 0) + 1);
  if (psur) agg.psurIds.add(psur);
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
  // Handle Polygon: POLYGON((...))
  const polyMatch = wkt.match(/\(\((.+)\)\)/);
  if (polyMatch) {
    const coords = polyMatch[1].split(',').map((pair) => {
      const [lng, lat] = pair.trim().split(/\s+/).map(Number);
      return { lat, lng };
    });
    if (coords.length === 0) return null;
    const sumLat = coords.reduce((s, c) => s + c.lat, 0);
    const sumLng = coords.reduce((s, c) => s + c.lng, 0);
    return { lat: sumLat / coords.length, lng: sumLng / coords.length };
  }
  // Handle LineString: LineString (...)
  const lineMatch = wkt.match(/\((.+)\)/);
  if (lineMatch) {
    const coords = lineMatch[1].split(',').map((pair) => {
      const [lng, lat] = pair.trim().split(/\s+/).map(Number);
      return { lat, lng };
    });
    if (coords.length === 0) return null;
    const sumLat = coords.reduce((s, c) => s + c.lat, 0);
    const sumLng = coords.reduce((s, c) => s + c.lng, 0);
    return { lat: sumLat / coords.length, lng: sumLng / coords.length };
  }
  return null;
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
    locationDescriptionOriginal: null,
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
    locationDescriptionOriginal: null,
    placeType: null,
    modifiedBy: null,
    modifiedAt: null,
  });
}
console.log(`  ${allLocations.size} locations (rivers/creeks/roads)`);

// ── 3. QGIS river/creek features (E26 Physical Features) ──────────

console.log('Processing QGIS river/creek features...');
let riverCount = 0;
let creekCount = 0;
const riverPlaceUris = new Set<string>();

for (const feature of Object.values(physicalFeaturesRaw)) {
  const featureUri = feature['@id'] as string;
  const prefLabel = (feature['prefLabel'] as string) || 'Unknown';
  const featureType = (feature['featureType'] as string) || 'river';
  const mainBodyWater = (feature['mainBodyWater'] as string) || '';
  const placeUri = feature['P53_has_location'] as string | undefined;
  if (placeUri) riverPlaceUris.add(placeUri);

  // Look up the E53 Place for geometry
  const placeEntity = placeUri ? placesRaw[placeUri] : undefined;
  const geom = placeEntity?.['hasGeometry'] as { asWKT?: string } | undefined;
  const wkt = geom?.asWKT || null;
  const centroid = wkt ? centroidFromWKT(wkt) : null;
  const fid = placeEntity?.['fid'] as number | undefined;

  const type: 'river' | 'creek' = featureType === 'creek' ? 'creek' : 'river';
  if (type === 'creek') creekCount++;
  else riverCount++;

  gazetteer.push({
    id: nextId('stm'),
    type,
    prefLabel,
    altLabels: [],
    broader: null,
    description: mainBodyWater
      ? `${type === 'creek' ? 'Creek' : 'River'} segment of ${mainBodyWater} (QGIS 1930 map)`
      : `${type === 'creek' ? 'Creek' : 'River'} feature from QGIS 1930 map`,
    location: {
      lat: centroid?.lat ?? null,
      lng: centroid?.lng ?? null,
      wkt,
      crs: 'EPSG:4326',
    },
    sources: ['map-1930'],
    wikidataQid: null,
    fid: fid ?? null,
    psurIds: [],
    district: null,
    locationDescription: mainBodyWater || null,
    locationDescriptionOriginal: null,
    placeType: type,
    modifiedBy: null,
    modifiedAt: null,
  });
}
console.log(`  ${riverCount} rivers, ${creekCount} creeks (from QGIS)`);

// ── 4. Plantation places (from E53 + E25 + QGIS + almanakken) ─────

console.log('Processing plantation places...');
let linkedDistricts = 0;
let linkedLocDesc = 0;
let linkedProduct = 0;
let linkedPsur = 0;

for (const place of Object.values(placesRaw)) {
  const placeId = place['@id'] as string;

  // Skip river/creek places — already handled in section 3
  if (riverPlaceUris.has(placeId)) continue;

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
  let locationDescriptionOriginal: string | null = null;
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
      locationDescriptionOriginal = mostCommon(agg.locationsOriginal);
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
    locationDescriptionOriginal,
    placeType,
    modifiedBy: null,
    modifiedAt: null,
  });
}

console.log(
  `  ${Object.keys(placesRaw).length - riverPlaceUris.size} plantation places (from QGIS)`,
);
console.log(`  ${linkedDistricts} linked to districts`);
console.log(`  ${linkedLocDesc} with location descriptions`);
console.log(`  ${linkedProduct} with product/place types`);
console.log(`  ${linkedPsur} with PSUR IDs`);

// ── 5. Almanakken-only plantations (Q-IDs not in QGIS) ─────────────

console.log('Processing almanakken-only plantations...');
const qidsInQgis = new Set<string>();
for (const place of Object.values(placesRaw)) {
  const plantation = plantationByPlace.get(place['@id'] as string);
  const ownerUri = plantation?.['P52_has_current_owner'] as string | undefined;
  const qid = ownerUri?.startsWith('http://www.wikidata.org/entity/')
    ? ownerUri.replace('http://www.wikidata.org/entity/', '')
    : null;
  if (qid) qidsInQgis.add(qid);
}

let almOnlyCount = 0;
let almOnlyWithPsur = 0;
for (const [qid, agg] of almByQid) {
  if (qidsInQgis.has(qid)) continue; // already covered by QGIS

  const prefLabel = mostCommon(agg.labels) || qid;
  const districtName = mostCommon(agg.districts);
  const districtId = districtName
    ? districtIdMap.get(districtName) || null
    : null;
  const locationDescription = mostCommon(agg.locations);
  const locationDescriptionOriginal = mostCommon(agg.locationsOriginal);
  const placeType = mostCommon(agg.products);
  const psurIds = Array.from(agg.psurIds);
  if (psurIds.length > 0) almOnlyWithPsur++;

  const sources = ['almanakken'];
  if (psurIds.length > 0) sources.push('slave-registers');

  gazetteer.push({
    id: nextId('stm'),
    type: 'plantation',
    prefLabel,
    altLabels: [],
    broader: districtId,
    description: 'Plantation from Surinaamse Almanakken (no QGIS geometry)',
    location: { lat: null, lng: null, wkt: null, crs: 'EPSG:4326' },
    sources,
    wikidataQid: qid,
    fid: null,
    psurIds,
    district: districtName,
    locationDescription,
    locationDescriptionOriginal,
    placeType,
    modifiedBy: null,
    modifiedAt: null,
  });
  almOnlyCount++;
}

console.log(`  ${almOnlyCount} almanakken-only plantations added`);
console.log(`  ${almOnlyWithPsur} with PSUR IDs`);

// ── 6. Named places from places.csv ───────────────────────────────

console.log('Processing places.csv...');
const placesContent = readFileSync(PLACES_CSV, 'utf-8');
const placesRows = parse(placesContent, {
  columns: true,
  skip_empty_lines: true,
  trim: true,
});

/** Map type1930 code to PlaceType */
function mapPlaceType(type1930: string): PlaceType {
  switch (type1930) {
    case 'Astronomisch station':
    case 'Kabelstation':
      return 'station';
    case 'District Commissaris':
      return 'town';
    case 'B':
      return 'maroon-village';
    case 'I':
      return 'indigenous-village';
    case 'Jodensavanne':
    default:
      return 'settlement';
  }
}

/** Build colonial-era description fragments from type1882/remark1882 */
function colonial1882Note(
  type1882: string,
  remark1882: string,
): string | null {
  const parts: string[] = [];
  if (type1882) parts.push(type1882);
  if (remark1882) parts.push(remark1882);
  return parts.length > 0 ? `1882: ${parts.join(' -- ')}` : null;
}

// Track existing plantation labels to avoid duplicating places.csv entries
// that already exist from QGIS polygon plantations (stage 4)
const existingPlantationLabels = new Set(
  gazetteer
    .filter((g) => g.type === 'plantation')
    .map((g) => g.prefLabel.toLowerCase()),
);

let placesAdded = 0;
let placesSkippedDup = 0;
for (const row of placesRows as Record<string, string>[]) {
  const fid = parseInt(row['fid'], 10);
  const label1930 = (row['label1930'] || '').trim();
  const type1930 = (row['type1930'] || '').trim();
  const remark1930 = (row['remark1930'] || '').trim();
  const label1882 = (row['label1882'] || '').trim();
  const type1882 = (row['type1882'] || '').trim();
  const remark1882 = (row['remark1882'] || '').trim();
  const xCoord = parseFloat(row['X_coord']);
  const yCoord = parseFloat(row['Y_coord']);

  // Determine preferred label
  let prefLabel = label1930 || label1882;
  const placeType = mapPlaceType(type1930);

  // For unlabeled I/B features, use a type-based label with fid
  if (!prefLabel) {
    if (placeType === 'indigenous-village') {
      prefLabel = label1882 || `Indigenous village (fid-${fid})`;
    } else if (placeType === 'maroon-village') {
      prefLabel = `Maroon village (fid-${fid})`;
    } else {
      prefLabel = `Place (fid-${fid})`;
    }
  }

  // Skip if this is a plantation remark and already exists from QGIS
  if (
    remark1930 === 'plantation' &&
    existingPlantationLabels.has(prefLabel.toLowerCase())
  ) {
    placesSkippedDup++;
    continue;
  }

  // Reproject coordinates
  const coords =
    !isNaN(xCoord) && !isNaN(yCoord)
      ? reprojectPoint(xCoord, yCoord)
      : null;

  // Build alt labels
  const altLabels: string[] = [];
  if (label1882 && label1882 !== prefLabel) altLabels.push(label1882);
  if (label1930 && label1930 !== prefLabel) altLabels.push(label1930);

  // Build description
  const descParts: string[] = [];
  if (remark1930) descParts.push(remark1930);
  const note1882 = colonial1882Note(type1882, remark1882);
  if (note1882) descParts.push(note1882);

  // Source attribution
  const sources: string[] = [];
  if (label1930 || type1930) sources.push('map-1930');
  if (label1882 || type1882) sources.push('map-1882');
  if (sources.length === 0) sources.push('map-1930');

  gazetteer.push({
    id: nextId('stm'),
    type: placeType,
    prefLabel,
    altLabels,
    broader: null,
    description: descParts.join('; ') || '',
    location: {
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      wkt: null,
      crs: 'EPSG:4326',
    },
    sources,
    wikidataQid: null,
    fid,
    psurIds: [],
    district: null,
    locationDescription: null,
    locationDescriptionOriginal: null,
    placeType: null,
    modifiedBy: null,
    modifiedAt: null,
  });
  placesAdded++;
}

console.log(
  `  ${placesAdded} places added, ${placesSkippedDup} skipped (duplicate plantation)`,
);

// ── 7. Military posts from military_posts_1882.csv ─────────────────

console.log('Processing military_posts_1882.csv...');
const militaryContent = readFileSync(MILITARY_CSV, 'utf-8');
const militaryRows = parse(militaryContent, {
  columns: true,
  skip_empty_lines: true,
  trim: true,
});

let militaryAdded = 0;
for (const row of militaryRows as Record<string, string>[]) {
  const fid = parseInt(row['fid'], 10);
  const label = (row['label1882'] || '').trim();
  const xCoord = parseFloat(row['X_coord']);
  const yCoord = parseFloat(row['Y_coord']);

  if (!label) continue;

  const coords =
    !isNaN(xCoord) && !isNaN(yCoord)
      ? reprojectPoint(xCoord, yCoord)
      : null;

  gazetteer.push({
    id: nextId('stm'),
    type: 'military-post',
    prefLabel: label,
    altLabels: [],
    broader: null,
    description: 'Military post from 1882 map',
    location: {
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      wkt: null,
      crs: 'EPSG:4326',
    },
    sources: ['map-1882'],
    wikidataQid: null,
    fid,
    psurIds: [],
    district: null,
    locationDescription: null,
    locationDescriptionOriginal: null,
    placeType: null,
    modifiedBy: null,
    modifiedAt: null,
  });
  militaryAdded++;
}

console.log(`  ${militaryAdded} military posts added`);

// ── 8. Roads from roads_1930.csv ───────────────────────────────────

console.log('Processing roads_1930.csv...');
const roadsContent = readFileSync(ROADS_CSV, 'utf-8');
const roadsRows = parse(roadsContent, {
  columns: true,
  skip_empty_lines: true,
  trim: true,
});

let roadsAdded = 0;
for (const row of roadsRows as Record<string, string>[]) {
  const fid = parseInt(row['fid'], 10);
  // Handle both WKT_geometry (uppercase) and wkt_geometry (lowercase)
  const wktRaw = (row['WKT_geometry'] || row['wkt_geometry'] || '').trim();
  if (!wktRaw) continue;

  const wktReprojected = reprojectWkt(wktRaw);
  const centroid = centroidFromWKT(wktReprojected);

  gazetteer.push({
    id: nextId('stm'),
    type: 'road',
    prefLabel: `Road segment ${fid}`,
    altLabels: [],
    broader: null,
    description: 'Road segment from 1930 plantation map',
    location: {
      lat: centroid?.lat ?? null,
      lng: centroid?.lng ?? null,
      wkt: wktReprojected,
      crs: 'EPSG:4326',
    },
    sources: ['map-1930'],
    wikidataQid: null,
    fid,
    psurIds: [],
    district: null,
    locationDescription: null,
    locationDescriptionOriginal: null,
    placeType: null,
    modifiedBy: null,
    modifiedAt: null,
  });
  roadsAdded++;
}

console.log(`  ${roadsAdded} road segments added`);

// ── 9. Railroad from railroad_1930.csv ─────────────────────────────

console.log('Processing railroad_1930.csv...');
const railroadContent = readFileSync(RAILROAD_CSV, 'utf-8');
const railroadRows = parse(railroadContent, {
  columns: true,
  skip_empty_lines: true,
  trim: true,
});

let railroadAdded = 0;
for (const row of railroadRows as Record<string, string>[]) {
  const fid = parseInt(row['fid'], 10);
  const wktRaw = (row['wkt_geometry'] || row['WKT_geometry'] || '').trim();
  if (!wktRaw) continue;

  const wktReprojected = reprojectWkt(wktRaw);
  const centroid = centroidFromWKT(wktReprojected);

  gazetteer.push({
    id: nextId('stm'),
    type: 'railroad',
    prefLabel: `Lawa Railroad (segment ${fid})`,
    altLabels: ['Lawaspoorweg'],
    broader: null,
    description:
      'Railroad segment from 1930 plantation map (Lawa Railroad / Lawaspoorweg)',
    location: {
      lat: centroid?.lat ?? null,
      lng: centroid?.lng ?? null,
      wkt: wktReprojected,
      crs: 'EPSG:4326',
    },
    sources: ['map-1930'],
    wikidataQid: null,
    fid,
    psurIds: [],
    district: null,
    locationDescription: null,
    locationDescriptionOriginal: null,
    placeType: null,
    modifiedBy: null,
    modifiedAt: null,
  });
  railroadAdded++;
}

console.log(`  ${railroadAdded} railroad segments added`);

// ── Sort and write as JSON-LD ──────────────────────────────────────

// Derive sort order from thesaurus
const typeOrder: Record<string, number> = Object.fromEntries(
  (thesaurusData['@graph'] || [])
    .filter((e: Record<string, unknown>) => e.typeId && typeof e.sortOrder === 'number')
    .map((e: Record<string, unknown>) => [e.typeId, e.sortOrder as number]),
);

gazetteer.sort((a, b) => {
  const diff = (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99);
  if (diff !== 0) return diff;
  return a.prefLabel.localeCompare(b.prefLabel);
});

console.log(`\nTotal: ${gazetteer.length} gazetteer entries`);

// Print per-type counts
const typeCounts = new Map<string, number>();
for (const entry of gazetteer) {
  typeCounts.set(entry.type, (typeCounts.get(entry.type) || 0) + 1);
}
for (const [type, count] of Array.from(typeCounts).sort(
  (a, b) => (typeOrder[a[0]] ?? 99) - (typeOrder[b[0]] ?? 99),
)) {
  console.log(`  ${type}: ${count}`);
}

const STM_BASE = 'https://data.suriname-timemachine.org/';

// Build JSON-LD graph entries
const graph = gazetteer.map((entry) => {
  const crmClass = PLACE_TYPE_CRM[entry.type] || 'E53_Place';
  const jsonldEntry: Record<string, unknown> = {
    '@id': `${STM_BASE}place/${entry.id}`,
    '@type': [crmClass],
    id: entry.id,
    type: entry.type,
    prefLabel: entry.prefLabel,
    altLabels: entry.altLabels,
    broader: entry.broader,
    description: entry.description,
    location: entry.location,
    sources: entry.sources,
    wikidataQid: entry.wikidataQid,
    fid: entry.fid,
    psurIds: entry.psurIds,
    district: entry.district,
    locationDescription: entry.locationDescription,
    locationDescriptionOriginal: entry.locationDescriptionOriginal,
    placeType: entry.placeType,
    modifiedBy: entry.modifiedBy,
    modifiedAt: entry.modifiedAt,
  };
  return jsonldEntry;
});

const jsonld = {
  '@context': {
    crm: 'http://www.cidoc-crm.org/cidoc-crm/',
    skos: 'http://www.w3.org/2004/02/skos/core#',
    geo: 'http://www.opengis.net/ont/geosparql#',
    dct: 'http://purl.org/dc/terms/',
    stm: STM_BASE,
    prefLabel: 'skos:prefLabel',
    altLabels: 'skos:altLabel',
    E25_Human_Made_Feature: 'crm:E25_Human-Made_Feature',
    'E25_Human-Made_Feature': 'crm:E25_Human-Made_Feature',
    E26_Physical_Feature: 'crm:E26_Physical_Feature',
    E53_Place: 'crm:E53_Place',
  },
  '@id': `${STM_BASE}gazetteer`,
  '@type': 'dct:Dataset',
  'dct:title': 'Suriname Time Machine -- Places Gazetteer',
  'dct:description':
    'Authority records for named places in Suriname. Preferred labels use modern, non-colonial terminology. Alternative labels preserve original source terms for scholarly reference.',
  '@graph': graph,
};

const json = JSON.stringify(jsonld, null, 2);

// Write to data root (source of truth)
const dataPath = join(DATA_DIR, 'places-gazetteer.jsonld');
writeFileSync(dataPath, json, 'utf-8');
console.log(`Wrote ${dataPath}`);

// Write to public/data (app-accessible)
const publicPath = join(PUBLIC_DIR, 'places-gazetteer.jsonld');
writeFileSync(publicPath, json, 'utf-8');
console.log(`Wrote ${publicPath}`);
