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
const DATA_DIR = join(__dirname, '../../data');
const DATA_BASE = 'https://data.suriname-timemachine.org/';
const ONTOLOGY_BASE = 'https://suriname-timemachine.org/ontology/';
const PIPELINE_TYPES = new Set(['plantation', 'river', 'creek']);

mkdirSync(OUT_DIR, { recursive: true });

const gazetteerSrc = join(DATA_DIR, 'places-gazetteer.jsonld');
const thesaurusSrc = join(DATA_DIR, 'place-types-thesaurus.jsonld');
const sourcesSrc = join(DATA_DIR, 'sources-registry.jsonld');

type GazetteerLocation = {
  lat?: number | null;
  lng?: number | null;
  wkt?: string | null;
  crs?: string | null;
};

type GazetteerName = {
  text?: string;
  language?: string;
  type?: string;
  isPreferred?: boolean;
  source?: string;
  sourceYear?: number;
};

type GazetteerEntry = Record<string, unknown> & {
  '@id'?: string;
  id?: string;
  type?: string;
  prefLabel?: string;
  altLabels?: string[];
  names?: GazetteerName[];
  location?: GazetteerLocation | null;
  sources?: string[];
  fid?: number | null;
  description?: string;
  deprecated?: true;
  mergedInto?: string;
};

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function readJsonIfExists(path: string): Record<string, unknown> | null {
  return existsSync(path)
    ? (JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>)
    : null;
}

function normalizeCrmClass(type: string | undefined): string {
  if (!type) return 'E53_Place';
  return type.replace('E25_Human-Made_Feature', 'E25_Human_Made_Feature');
}

function crmBadgeFromClass(type: string): 'E25' | 'E26' | 'E53' {
  if (type.includes('E25')) return 'E25';
  if (type.includes('E26')) return 'E26';
  return 'E53';
}

function preferredName(entry: GazetteerEntry): string {
  const names = Array.isArray(entry.names) ? entry.names : [];
  const preferred = names.find((n) => n.isPreferred === true);
  const first = names[0];
  return (
    preferred?.text ||
    first?.text ||
    (typeof entry.prefLabel === 'string' ? entry.prefLabel : '') ||
    ''
  );
}

function allNames(entry: GazetteerEntry): GazetteerName[] {
  if (Array.isArray(entry.names) && entry.names.length > 0) {
    return entry.names.filter((n) => typeof n.text === 'string' && n.text);
  }

  const names: GazetteerName[] = [];
  const pref = typeof entry.prefLabel === 'string' ? entry.prefLabel.trim() : '';
  if (pref) {
    names.push({
      text: pref,
      language: 'nl',
      type: 'official',
      isPreferred: true,
    });
  }

  for (const alt of Array.isArray(entry.altLabels) ? entry.altLabels : []) {
    const text = typeof alt === 'string' ? alt.trim() : '';
    if (text) {
      names.push({
        text,
        language: 'nl',
        type: 'historical',
        isPreferred: false,
      });
    }
  }

  return names;
}

function pointWkt(location: GazetteerLocation): string | null {
  if (location.lng == null || location.lat == null) return null;
  return `Point (${location.lng} ${location.lat})`;
}

function mapYearFromSources(
  sourceIds: string[],
  sourceRegistryById: Map<string, Record<string, unknown>>,
): string {
  const years = sourceIds
    .map((sourceId) => sourceRegistryById.get(sourceId)?.mapYear)
    .filter((year): year is string | number => year != null)
    .map(String);
  if (years.length > 0) return years[0];
  if (sourceIds.includes('paramaribo-street-map-1916')) return '1916';
  if (sourceIds.includes('map-1882')) return '1882';
  return '1930';
}

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

// Gazetteer integration: points and gazetteer-only lines are first-class CRM
// features too. The source transforms create plantation polygons and
// river/creek lines; this pass adds the gazetteer-maintained E25/E26/E53
// records to the same frontend indexes so Explore and the data panels resolve
// them through the same CIDOC-CRM shape.
const gazetteerRaw = readJsonIfExists(gazetteerSrc);
const gazetteerEntries = (gazetteerRaw?.['@graph'] || []) as GazetteerEntry[];

const thesaurusRaw = readJsonIfExists(thesaurusSrc);
const placeTypeConcepts = ((thesaurusRaw?.['@graph'] || []) as Record<
  string,
  unknown
>[]).filter((entry) => entry.typeId);
const crmClassByType = new Map<string, string>(
  placeTypeConcepts.map((entry) => [
    entry.typeId as string,
    normalizeCrmClass(entry.crmClass as string | undefined),
  ]),
);

const sourcesRegistryRaw = readJsonIfExists(sourcesSrc);
const sourceRegistryEntries = ((sourcesRegistryRaw?.['@graph'] || []) as Record<
  string,
  unknown
>[]).filter((entry) => entry.sourceId);
const sourceRegistryById = new Map<string, Record<string, unknown>>(
  sourceRegistryEntries.map((entry) => [entry.sourceId as string, entry]),
);

function ensureSource(sourceId: string): string {
  const ontologyUri = `${ONTOLOGY_BASE}source/${sourceId}`;
  if (sourceIndex[ontologyUri]) return ontologyUri;

  const registryEntry = sourceRegistryById.get(sourceId);
  const uri =
    (registryEntry?.['@id'] as string | undefined) ||
    `${DATA_BASE}source/${sourceId}`;

  if (!sourceIndex[uri]) {
    sourceIndex[uri] = {
      '@id': uri,
      '@type': ['E22_Human_Made_Object'],
      sourceId,
      prefLabel: (registryEntry?.prefLabel as string | undefined) || sourceId,
      P2_has_type: registryEntry?.P2_has_type,
      mapYear:
        registryEntry?.mapYear != null ? String(registryEntry.mapYear) : null,
      sameAs:
        (registryEntry?.handleUrl as string | undefined) ||
        (registryEntry?.iiifManifest as string | undefined) ||
        undefined,
    };
  }

  return uri;
}

let indexedGazetteerFeatures = 0;
let indexedGazetteerPlaces = 0;
let indexedGazetteerAppellations = 0;

for (const entry of gazetteerEntries) {
  if (entry.deprecated || entry.mergedInto) continue;

  const type = entry.type;
  const id = entry.id;
  const entryUri = entry['@id'];
  if (!type || !id || !entryUri) continue;
  if (PIPELINE_TYPES.has(type)) continue;

  const location = entry.location || null;
  const sourceIds = Array.isArray(entry.sources) ? entry.sources : [];
  const sourceUris = sourceIds.map(ensureSource);
  const primarySourceUri = sourceUris[0] ?? null;
  const mapYear = mapYearFromSources(sourceIds, sourceRegistryById);
  const crmClass = crmClassByType.get(type) ?? 'E53_Place';
  const crmBadge = crmBadgeFromClass(crmClass);
  const displayName = preferredName(entry);
  const geometryWkt = location?.wkt || (location ? pointWkt(location) : null);
  const hasLocation = !!geometryWkt;
  const typeUri = `${DATA_BASE}vocabulary/place-type/${type}`;

  const featureUri = crmBadge === 'E53' ? null : entryUri;
  const placeUri = crmBadge === 'E53' ? entryUri : `${entryUri}/location`;

  if (crmBadge !== 'E53') {
    const targetFeatureUri = entryUri;
    const featureEntity: Record<string, unknown> = {
      '@id': targetFeatureUri,
      '@type': [crmClass],
      featureType: type,
      P2_has_type: typeUri,
      prefLabel: displayName,
      status: type === 'road' || type === 'railroad' ? 'infrastructure' : 'named',
      gazetteerId: id,
      P53_has_location: hasLocation ? placeUri : undefined,
    };
    if (primarySourceUri) featureEntity.P70i_is_documented_in = primarySourceUri;
    if (entry.description) featureEntity.description = entry.description;
    if (entry.wikidataQid) {
      featureEntity.sameAs = `http://www.wikidata.org/entity/${entry.wikidataQid}`;
    }

    const featureProvId = `${DATA_BASE}provenance/gazetteer-feature-${id}`;
    featureEntity.wasDerivedFrom = featureProvId;
    provenanceIndex[featureProvId] = {
      '@id': featureProvId,
      '@type': ['ProvenanceRecord'],
      sourceFile: 'data/places-gazetteer.jsonld',
      sourceColumn: 'type, names, sources, location',
      sourceRow: `id=${id}`,
      transformedBy: 'scripts/prepare-data.ts',
      modelEntity:
        crmBadge === 'E26' ? 'E26_Physical_Feature' : 'E25_Human_Made_Feature',
      schemaTable: 'gazetteer_features',
      linkedVia: `P2_has_type -> ${typeUri}`,
    };

    physicalFeatureIndex[targetFeatureUri] = featureEntity;
    indexedGazetteerFeatures++;
  }

  if (crmBadge === 'E53' || hasLocation) {
    const placeEntity: Record<string, unknown> = {
      '@id': placeUri,
      '@type': ['E53_Place'],
      fid: entry.fid ?? null,
      mapYear,
      observedLabel: displayName,
      featureType: type,
      gazetteerId: id,
    };
    if (primarySourceUri) {
      placeEntity.P70i_is_documented_in = primarySourceUri;
    }
    if (geometryWkt) {
      placeEntity.hasGeometry = {
        '@type': 'geo:Geometry',
        asWKT: geometryWkt,
        geometrySource: primarySourceUri,
      };
    }

    const locationProvId = `${DATA_BASE}provenance/gazetteer-location-${id}`;
    placeEntity.wasDerivedFrom = locationProvId;
    provenanceIndex[locationProvId] = {
      '@id': locationProvId,
      '@type': ['ProvenanceRecord'],
      sourceFile: 'data/places-gazetteer.jsonld',
      sourceColumn: 'location',
      sourceRow: `id=${id}`,
      transformedBy: 'scripts/prepare-data.ts',
      modelEntity: 'E53_Place',
      schemaTable: 'gazetteer_places',
      linkedVia:
        crmBadge === 'E53'
          ? `P2_has_type -> ${typeUri}`
          : `P53i_is_location_of -> ${featureUri}`,
    };

    placeIndex[placeUri] = placeEntity;
    indexedGazetteerPlaces++;
  }

  const appellationTarget = featureUri ?? placeUri;
  const nameEntries = allNames(entry);
  if (appellationTarget && nameEntries.length > 0) {
    const existing = appellationsByEntity[appellationTarget] ?? [];
    const created = nameEntries.map((name, index) => {
      const appSourceUri = name.source
        ? ensureSource(name.source)
        : primarySourceUri ?? undefined;
      return {
        '@id': `${entryUri}/appellation/${index + 1}`,
        '@type': ['E41_Appellation'],
        P190_has_symbolic_content: name.text,
        P72_has_language: name.language || 'nl',
        P2_has_type: `${DATA_BASE}type/name-type/${name.type || 'historical'}`,
        P128i_is_carried_by: appSourceUri,
        P1i_identifies: appellationTarget,
        mapYear:
          name.sourceYear != null ? String(name.sourceYear) : mapYear,
        isPreferred: name.isPreferred === true,
      };
    });
    appellationsByEntity[appellationTarget] = [...existing, ...created];
    indexedGazetteerAppellations += created.length;
  }
}

if (gazetteerEntries.length > 0) {
  console.log('\nIntegrated gazetteer entries into CRM indexes...');
  console.log(`  Gazetteer features:     ${indexedGazetteerFeatures}`);
  console.log(`  Gazetteer E53 places:   ${indexedGazetteerPlaces}`);
  console.log(`  Gazetteer appellations: ${indexedGazetteerAppellations}`);
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
  if (gazetteerEntries.length > 0) {
    const entries = gazetteerEntries.filter(
      (entry) => !entry.deprecated && !entry.mergedInto,
    );
    let added = 0;

    // Build lookups: fid -> stmId, placeUri -> stmId
    // Existing generated GeoJSON contains only these pipeline-backed types.
    // Do not let gazetteer-only road/point FIDs collide with polygon/river FIDs.
    const fidToStmId = new Map<number, string>();
    const uriToStmId = new Map<string, string>();
    for (const entry of entries) {
      if (!entry.type || !PIPELINE_TYPES.has(entry.type)) continue;
      const stmId = entry.id as string;
      if (entry.fid != null) fidToStmId.set(entry.fid as number, stmId);
      if (entry['@id']) uriToStmId.set(entry['@id'] as string, stmId);
    }

    // Inject stmId into existing features
    let enriched = 0;
    for (const feature of geojson.features) {
      const props = feature.properties;
      const stmId =
        fidToStmId.get(props.fid) ??
        uriToStmId.get(props.placeUri ?? '') ??
        null;
      if (stmId) {
        props.stmId = stmId;
        enriched++;
      }
    }
    console.log(`  Enriched ${enriched} existing features with stmId`);

    // Existing feature types in geojson are 'plantation', 'river', 'creek'
    // Add features for types NOT already in the pipeline
    for (const entry of entries) {
      const type = entry.type as string;
      if (PIPELINE_TYPES.has(type)) continue;

      const loc = entry.location || null;
      if (!loc) continue;

      const displayName = preferredName(entry);
      const entryNames = allNames(entry);
      const nameTexts = [
        ...new Set(entryNames.map((name) => name.text).filter(Boolean)),
      ];
      const entrySources = Array.isArray(entry.sources) ? entry.sources : [];
      const derivedMapYear = mapYearFromSources(
        entrySources,
        sourceRegistryById,
      );
      const crmClass = crmClassByType.get(type) ?? 'E53_Place';
      const crmBadge = crmBadgeFromClass(crmClass);
      const featureUri = crmBadge === 'E53' ? null : entry['@id'];
      const placeUri =
        crmBadge === 'E53' ? entry['@id'] : `${entry['@id']}/location`;
      const status =
        type === 'road' || type === 'railroad' ? 'infrastructure' : 'named';

      // LineString / MultiLineString features (road/railroad) — use WKT if available
      if (loc.wkt && (type === 'road' || type === 'railroad')) {
        const isMulti = /^MultiLineString\s*\(/i.test(loc.wkt);
        let geometry:
          | { type: 'LineString'; coordinates: number[][] }
          | { type: 'MultiLineString'; coordinates: number[][][] }
          | null = null;

        if (isMulti) {
          const inner = loc.wkt
            .replace(/^MultiLineString\s*\(/i, '')
            .replace(/\)\s*$/, '');
          const segmentMatches = [...inner.matchAll(/\(([^)]+)\)/g)];
          const allSegments: number[][][] = [];
          for (const segMatch of segmentMatches) {
            const coords: number[][] = [];
            for (const pair of segMatch[1].split(',')) {
              const pts = pair.trim().split(/\s+/);
              if (pts.length >= 2) {
                const lon = parseFloat(pts[0]);
                const lat = parseFloat(pts[1]);
                if (!isNaN(lon) && !isNaN(lat)) coords.push([lon, lat]);
              }
            }
            if (coords.length >= 2) allSegments.push(coords);
          }
          if (allSegments.length === 1) {
            geometry = { type: 'LineString', coordinates: allSegments[0] };
          } else if (allSegments.length > 1) {
            geometry = { type: 'MultiLineString', coordinates: allSegments };
          }
        } else {
          const match = loc.wkt.match(/LineString\s*\(([^)]+)\)/i);
          if (match) {
            const coords: number[][] = [];
            for (const pair of match[1].split(',')) {
              const pts = pair.trim().split(/\s+/);
              if (pts.length >= 2) {
                const lon = parseFloat(pts[0]);
                const lat = parseFloat(pts[1]);
                if (!isNaN(lon) && !isNaN(lat)) coords.push([lon, lat]);
              }
            }
            if (coords.length >= 2) {
              geometry = { type: 'LineString', coordinates: coords };
            }
          }
        }

        if (geometry) {
          geojson.features.push({
            type: 'Feature',
            id: `${type}-${entry.fid || entry.id}`,
            geometry,
            properties: {
              fid: entry.fid ?? null,
              name: displayName,
              allNames: nameTexts,
              stmId: entry.id as string,
              featureUri,
              placeUri,
              status,
              featureType: type,
              mapYear: derivedMapYear,
            },
          });
          added++;
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
            name: displayName,
            allNames: nameTexts,
            stmId: entry.id as string,
            featureUri,
            placeUri,
            status,
            featureType: type,
            mapYear: derivedMapYear,
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
// Applies inline migration: entries still using prefLabel instead of names[] are converted.
if (gazetteerRaw) {
  const gazetteerGraph: Record<string, unknown>[] =
    (gazetteerRaw['@graph'] as Record<string, unknown>[] | undefined) || [];
  let migrated = 0;
  const migratedGraph = gazetteerGraph.map((entry) => {
    if (Array.isArray(entry.names) && !entry.prefLabel) return entry;
    const names: Record<string, unknown>[] = [];
    const pref =
      typeof entry.prefLabel === 'string' ? entry.prefLabel.trim() : '';
    if (pref)
      names.push({
        text: pref,
        language: 'nl',
        type: 'official',
        isPreferred: true,
      });
    const alts: string[] = Array.isArray(entry.altLabels)
      ? (entry.altLabels as string[])
      : [];
    for (const alt of alts) {
      const t = typeof alt === 'string' ? alt.trim() : '';
      if (t)
        names.push({
          text: t,
          language: 'nl',
          type: 'historical',
          isPreferred: false,
        });
    }
    if (names.length > 0 && !names.some((n) => n.isPreferred))
      names[0].isPreferred = true;
    const {
      prefLabel: _pl,
      altLabels: _al,
      ...rest
    } = entry as Record<string, unknown> & {
      prefLabel?: unknown;
      altLabels?: unknown;
    };
    void _pl;
    void _al;
    migrated++;
    return { ...rest, names };
  });
  if (migrated > 0)
    console.log(`  Migrated ${migrated} gazetteer entries to names[] format`);
  writeFileSync(
    join(OUT_DIR, 'places-gazetteer.jsonld'),
    JSON.stringify({ ...gazetteerRaw, '@graph': migratedGraph }),
  );
  console.log('  Wrote places-gazetteer.jsonld');
}

// Copy place-types thesaurus
if (existsSync(thesaurusSrc)) {
  copyFileSync(thesaurusSrc, join(OUT_DIR, 'place-types-thesaurus.jsonld'));
  console.log('  Copied place-types-thesaurus.jsonld');
}

// Copy sources registry
if (existsSync(sourcesSrc)) {
  copyFileSync(sourcesSrc, join(OUT_DIR, 'sources-registry.jsonld'));
  console.log('  Copied sources-registry.jsonld');
}

console.log('\nDone! Data files ready in public/data/');
