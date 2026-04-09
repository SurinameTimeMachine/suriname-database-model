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
const physicalFeatures: Record<string, unknown>[] = [];
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
  } else if (typeSet.has('E26_Physical_Feature')) {
    physicalFeatures.push(entity);
  } else if (typeSet.has('E74_Group')) {
    organizations.push(entity);
  } else if (typeSet.has('E53_Place')) {
    places.push(entity);
  } else if (typeSet.has('E41_Appellation')) {
    appellations.push(entity);
  } else if (typeSet.has('E22_Human_Made_Object')) {
    sources.push(entity);
  } else if (typeSet.has('E13_Attribute_Assignment')) {
    observations.push(entity);
  } else if (typeSet.has('ProvenanceRecord')) {
    provenance.push(entity);
  }
}

console.log(`  Plantations: ${plantations.length}`);
console.log(`  Physical Features: ${physicalFeatures.length}`);
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

// Physical feature index: keyed by @id (E26 rivers/creeks)
const physicalFeatureIndex: Record<string, unknown> = {};
for (const f of physicalFeatures) {
  physicalFeatureIndex[f['@id'] as string] = f;
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
writeJSON('physical-features.json', physicalFeatureIndex);
writeJSON('organizations.json', orgIndex);
writeJSON('places.json', placeIndex);
writeJSON('sources.json', sourceIndex);
writeJSON('appellations-by-entity.json', appellationsByEntity);
writeJSON('observations-by-org.json', observationsByOrg);
writeJSON('provenance.json', provenanceIndex);

// Copy GeoJSON and merge gazetteer features
const geojsonSrc = join(LOD_DIR, 'map-features.geojson');
if (existsSync(geojsonSrc)) {
  const geojson = JSON.parse(readFileSync(geojsonSrc, 'utf-8'));

  // Merge additional features from gazetteer (places.csv, military posts, roads, railroad)
  const gazetteerPath = join(__dirname, '../../data/places-gazetteer.jsonld');
  if (existsSync(gazetteerPath)) {
    const gazetteerData = JSON.parse(readFileSync(gazetteerPath, 'utf-8'));
    const entries = gazetteerData['@graph'] || [];
    let added = 0;

    // Existing feature types in geojson are 'plantation', 'river', 'creek'
    // Add features for types NOT already in the pipeline
    const pipelineTypes = new Set(['plantation', 'river', 'creek']);

    for (const entry of entries as Record<string, unknown>[]) {
      const type = entry.type as string;
      if (pipelineTypes.has(type)) continue;

      const loc = entry.location as {
        lat: number | null;
        lng: number | null;
        wkt: string | null;
      } | null;
      if (!loc) continue;

      // LineString features (roads, railroad) — use WKT if available
      if (loc.wkt && (type === 'road' || type === 'railroad')) {
        const match = loc.wkt.match(/LineString\s*\((.+?)\)/i);
        if (match) {
          const coords: number[][] = [];
          for (const pair of match[1].split(',')) {
            const parts = pair.trim().split(/\s+/);
            if (parts.length >= 2) {
              const lon = parseFloat(parts[0]);
              const lat = parseFloat(parts[1]);
              if (!isNaN(lon) && !isNaN(lat)) coords.push([lon, lat]);
            }
          }
          if (coords.length >= 2) {
            geojson.features.push({
              type: 'Feature',
              id: `${type}-${entry.fid || entry.id}`,
              geometry: { type: 'LineString', coordinates: coords },
              properties: {
                fid: entry.fid ?? null,
                name: entry.prefLabel || '',
                placeUri: (entry['@id'] as string) || `stm:place/${entry.id}`,
                status: 'infrastructure',
                featureType: type,
                mapYear: '1930',
              },
            });
            added++;
          }
        }
        continue;
      }

      // Point features — use lat/lng
      if (loc.lat != null && loc.lng != null) {
        geojson.features.push({
          type: 'Feature',
          id: `${type}-${entry.fid || entry.id}`,
          geometry: {
            type: 'Point',
            coordinates: [loc.lng, loc.lat],
          },
          properties: {
            fid: entry.fid ?? null,
            name: entry.prefLabel || '',
            placeUri: (entry['@id'] as string) || `stm:place/${entry.id}`,
            status: 'named',
            featureType: type,
            mapYear: (entry.sources as string[])?.includes('map-1882')
              ? '1882'
              : '1930',
          },
        });
        added++;
      }
    }
    console.log(
      `  Merged ${added} gazetteer features into map-features.geojson`,
    );
  }

  writeFileSync(join(OUT_DIR, 'map-features.geojson'), JSON.stringify(geojson));
  console.log('  Wrote map-features.geojson');
}

// Copy places gazetteer (if it exists in data root)
const gazetteerSrc = join(__dirname, '../../data/places-gazetteer.jsonld');
if (existsSync(gazetteerSrc)) {
  copyFileSync(gazetteerSrc, join(OUT_DIR, 'places-gazetteer.jsonld'));
  console.log('  Copied places-gazetteer.jsonld');
} else {
  // Fallback: try old .json format
  const gazetteerSrcJson = join(__dirname, '../../data/places-gazetteer.json');
  if (existsSync(gazetteerSrcJson)) {
    copyFileSync(gazetteerSrcJson, join(OUT_DIR, 'places-gazetteer.json'));
    console.log('  Copied places-gazetteer.json (legacy format)');
  }
}

// Copy place-types thesaurus
const thesaurusSrc = join(__dirname, '../../data/place-types-thesaurus.jsonld');
if (existsSync(thesaurusSrc)) {
  copyFileSync(thesaurusSrc, join(OUT_DIR, 'place-types-thesaurus.jsonld'));
  console.log('  Copied place-types-thesaurus.jsonld');
}

// Copy sources registry
const sourcesSrc = join(__dirname, '../../data/sources-registry.jsonld');
if (existsSync(sourcesSrc)) {
  copyFileSync(sourcesSrc, join(OUT_DIR, 'sources-registry.jsonld'));
  console.log('  Copied sources-registry.jsonld');
}

console.log('\nDone! Data files ready in public/data/');
