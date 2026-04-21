import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

type RawGeometry = {
  type: 'LineString' | 'MultiLineString';
  coordinates: number[][] | number[][][];
};

type RawFeature = {
  type: 'Feature';
  properties?: {
    Name?: string;
    ID?: number;
  };
  geometry?: RawGeometry | null;
};

type RawFeatureCollection = {
  type: 'FeatureCollection';
  features: RawFeature[];
};

type GazetteerEntry = {
  '@id': string;
  '@type': string[];
  id: string;
  type: string;
  prefLabel?: string;
  altLabels?: string[];
  names?: unknown[];
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
  externalLinks?: unknown[];
  diklandRefs?: unknown[];
};

type GazetteerDocument = {
  '@context': Record<string, unknown>;
  '@id': string;
  '@type': string;
  '@graph': GazetteerEntry[];
};

type StreetAggregate = {
  key: string;
  label: string;
  featureIds: number[];
  segments: number[][][];
};

type CliOptions = {
  geojsonPath: string;
  gazetteerPath: string;
  write: boolean;
};

const ROOT_DIR = join(__dirname, '..', '..');
const DEFAULT_GEOJSON = join(
  ROOT_DIR,
  'data',
  '07-gis-plantation-map-1930',
  'streetsParamaribo1916map.geojson',
);
const DEFAULT_GAZETTEER = join(ROOT_DIR, 'data', 'places-gazetteer.jsonld');
const SOURCE_TAG = 'paramaribo-street-map-1916';
const UNNAMED_LABEL_PREFIX = 'Unnamed road (Paramaribo 1916)';

function parseArgs(argv: string[]): CliOptions {
  let geojsonPath = DEFAULT_GEOJSON;
  let gazetteerPath = DEFAULT_GAZETTEER;
  let write = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--write') {
      write = true;
      continue;
    }
    if (arg === '--geojson') {
      geojsonPath = argv[i + 1] || geojsonPath;
      i++;
      continue;
    }
    if (arg === '--gazetteer') {
      gazetteerPath = argv[i + 1] || gazetteerPath;
      i++;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log(
        [
          'Usage: tsx scripts/import-streets-paramaribo-1916.ts [options]',
          '',
          'Options:',
          '  --write                 Persist updates to the gazetteer file',
          '  --geojson <path>        Input streets GeoJSON path',
          '  --gazetteer <path>      Gazetteer JSON-LD path',
          '  --help, -h              Show this help',
        ].join('\n'),
      );
      process.exit(0);
    }
  }

  return { geojsonPath, gazetteerPath, write };
}

function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function getEntryLabel(entry: GazetteerEntry): string {
  if (typeof entry.prefLabel === 'string' && entry.prefLabel.trim()) {
    return entry.prefLabel.trim();
  }
  if (Array.isArray(entry.names)) {
    const names = entry.names as Array<Record<string, unknown>>;
    const preferred = names.find((n) => n.isPreferred === true);
    if (
      preferred &&
      typeof preferred.text === 'string' &&
      preferred.text.trim()
    ) {
      return preferred.text.trim();
    }
    const first = names.find(
      (n) => typeof n.text === 'string' && String(n.text).trim(),
    );
    if (first) return String(first.text).trim();
  }
  return '';
}

function geometryToSegments(geometry: RawGeometry): number[][][] {
  if (geometry.type === 'LineString') {
    return [geometry.coordinates as number[][]];
  }
  return geometry.coordinates as number[][][];
}

function segmentsToMultiLineStringWkt(segments: number[][][]): string | null {
  const parts: string[] = [];

  for (const segment of segments) {
    const pts: string[] = [];
    for (const coord of segment) {
      if (!Array.isArray(coord) || coord.length < 2) continue;
      const lng = Number(coord[0]);
      const lat = Number(coord[1]);
      if (Number.isNaN(lng) || Number.isNaN(lat)) continue;
      pts.push(`${lng.toFixed(8)} ${lat.toFixed(8)}`);
    }
    if (pts.length >= 2) parts.push(`(${pts.join(', ')})`);
  }

  if (parts.length === 0) return null;
  if (parts.length === 1) return `LineString ${parts[0]}`;
  return `MultiLineString (${parts.join(', ')})`;
}

function centroidFromSegments(
  segments: number[][][],
): { lat: number; lng: number } | null {
  let latSum = 0;
  let lngSum = 0;
  let count = 0;

  for (const segment of segments) {
    for (const coord of segment) {
      if (!Array.isArray(coord) || coord.length < 2) continue;
      const lng = Number(coord[0]);
      const lat = Number(coord[1]);
      if (Number.isNaN(lng) || Number.isNaN(lat)) continue;
      latSum += lat;
      lngSum += lng;
      count++;
    }
  }

  if (count === 0) return null;
  return {
    lat: latSum / count,
    lng: lngSum / count,
  };
}

function determineCrmType(
  typeId: string,
  context: Record<string, unknown>,
): string[] {
  const human = context['E25_Human-Made_Feature'];
  const natural = context['E26_Physical_Feature'];
  const place = context['E53_Place'];

  if (typeId === 'river' || typeId === 'creek') {
    return [
      typeof natural === 'string'
        ? 'E26_Physical_Feature'
        : 'E26_Physical_Feature',
    ];
  }
  if (typeId === 'district') {
    return [typeof place === 'string' ? 'E53_Place' : 'E53_Place'];
  }
  return [
    typeof human === 'string'
      ? 'E25_Human-Made_Feature'
      : 'E25_Human-Made_Feature',
  ];
}

function nextStmId(entries: GazetteerEntry[]): string {
  let max = 0;
  for (const entry of entries) {
    const match = entry.id?.match(/^stm-(\d{5})$/);
    if (!match) continue;
    const n = Number(match[1]);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return `stm-${String(max + 1).padStart(5, '0')}`;
}

function buildStreetAggregates(features: RawFeature[]): {
  aggregates: StreetAggregate[];
  skippedNoGeometry: number;
  unnamedFeatures: number;
} {
  const byKey = new Map<string, StreetAggregate>();
  let skippedNoGeometry = 0;
  let unnamedFeatures = 0;

  for (const feature of features) {
    if (!feature.geometry) {
      skippedNoGeometry++;
      continue;
    }

    if (
      feature.geometry.type !== 'LineString' &&
      feature.geometry.type !== 'MultiLineString'
    ) {
      skippedNoGeometry++;
      continue;
    }

    const segments = geometryToSegments(feature.geometry);
    const rawName = (feature.properties?.Name || '').trim();
    const featureId = Number(feature.properties?.ID ?? NaN);
    const safeId = Number.isNaN(featureId) ? -1 : featureId;

    const isUnnamed = !rawName || rawName === '[naamloos]';
    if (isUnnamed) unnamedFeatures++;

    const label = isUnnamed ? `${UNNAMED_LABEL_PREFIX} #${safeId}` : rawName;
    const key = isUnnamed ? `unnamed:${safeId}` : normalizeLabel(rawName);

    const existing = byKey.get(key);
    if (existing) {
      if (safeId >= 0) existing.featureIds.push(safeId);
      existing.segments.push(...segments);
      continue;
    }

    byKey.set(key, {
      key,
      label,
      featureIds: safeId >= 0 ? [safeId] : [],
      segments: [...segments],
    });
  }

  return {
    aggregates: Array.from(byKey.values()),
    skippedNoGeometry,
    unnamedFeatures,
  };
}

function ensureSource(
  existing: string[] | undefined,
  sourceTag: string,
): string[] {
  const list = Array.isArray(existing) ? [...existing] : [];
  if (!list.includes(sourceTag)) list.push(sourceTag);
  return list;
}

function hasSource(entry: GazetteerEntry, sourceTag: string): boolean {
  return Array.isArray(entry.sources) && entry.sources.includes(sourceTag);
}

function stmNumericId(entry: GazetteerEntry): number {
  const match = entry.id?.match(/^stm-(\d{5})$/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const value = Number(match[1]);
  return Number.isNaN(value) ? Number.MAX_SAFE_INTEGER : value;
}

function dedupeSourceEntriesByFid(
  entries: GazetteerEntry[],
  sourceTag: string,
): number {
  const byFid = new Map<number, GazetteerEntry[]>();

  for (const entry of entries) {
    if (!hasSource(entry, sourceTag) || entry.fid == null) continue;
    const list = byFid.get(entry.fid) || [];
    list.push(entry);
    byFid.set(entry.fid, list);
  }

  const duplicatesToRemove = new Set<GazetteerEntry>();

  for (const group of byFid.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort(
      (left, right) => stmNumericId(left) - stmNumericId(right),
    );
    for (const duplicate of sorted.slice(1)) {
      duplicatesToRemove.add(duplicate);
    }
  }

  if (duplicatesToRemove.size === 0) return 0;

  let removed = 0;
  for (let index = entries.length - 1; index >= 0; index--) {
    if (!duplicatesToRemove.has(entries[index])) continue;
    entries.splice(index, 1);
    removed++;
  }

  return removed;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  console.log('Loading street GeoJSON...');
  const rawGeojson = JSON.parse(
    readFileSync(options.geojsonPath, 'utf-8'),
  ) as RawFeatureCollection;
  if (
    rawGeojson.type !== 'FeatureCollection' ||
    !Array.isArray(rawGeojson.features)
  ) {
    throw new Error(
      'Input GeoJSON must be a FeatureCollection with features[]',
    );
  }

  console.log('Loading gazetteer...');
  const gazetteer = JSON.parse(
    readFileSync(options.gazetteerPath, 'utf-8'),
  ) as GazetteerDocument;
  if (!Array.isArray(gazetteer['@graph'])) {
    throw new Error('Gazetteer file must contain @graph array');
  }

  const { aggregates, skippedNoGeometry, unnamedFeatures } =
    buildStreetAggregates(rawGeojson.features);

  const dedupedEntries = dedupeSourceEntriesByFid(
    gazetteer['@graph'],
    SOURCE_TAG,
  );

  const existingRoadCandidates = gazetteer['@graph'].filter((entry) => {
    const name = getEntryLabel(entry);
    return Boolean(name);
  });

  const byNormalizedName = new Map<string, GazetteerEntry[]>();
  for (const entry of existingRoadCandidates) {
    const label = getEntryLabel(entry);
    const key = normalizeLabel(label);
    if (!key) continue;
    const list = byNormalizedName.get(key) || [];
    list.push(entry);
    byNormalizedName.set(key, list);
  }

  const bySourceFid = new Map<number, GazetteerEntry[]>();
  for (const entry of existingRoadCandidates) {
    if (!hasSource(entry, SOURCE_TAG) || entry.fid == null) continue;
    const list = bySourceFid.get(entry.fid) || [];
    list.push(entry);
    bySourceFid.set(entry.fid, list);
  }

  let inserted = 0;
  let updated = 0;
  let conflicts = 0;
  let skippedNoWkt = 0;

  for (const aggregate of aggregates) {
    const wkt = segmentsToMultiLineStringWkt(aggregate.segments);
    const centroid = centroidFromSegments(aggregate.segments);

    if (!wkt || !centroid) {
      skippedNoWkt++;
      continue;
    }

    const key = normalizeLabel(aggregate.label);
    const matchingByName = byNormalizedName.get(key) || [];
    const primaryFid = aggregate.featureIds.find((fid) => fid >= 0);
    const matchingByFid =
      primaryFid == null ? [] : bySourceFid.get(primaryFid) || [];
    const matching =
      matchingByName.length === 1
        ? matchingByName
        : matchingByFid.length === 1
          ? matchingByFid
          : matchingByName;

    if (matching.length > 1) {
      conflicts++;
      continue;
    }

    if (matching.length === 1) {
      const entry = matching[0];
      entry.type = 'road';
      entry['@type'] = determineCrmType('road', gazetteer['@context']);
      entry.altLabels = Array.isArray(entry.altLabels) ? entry.altLabels : [];
      if (Array.isArray(entry.names) && entry.names.length > 0) {
        const names = entry.names as Array<Record<string, unknown>>;
        const prefIdx = names.findIndex((n) => n.isPreferred === true);
        const nameEntry = {
          text: aggregate.label,
          language: 'nl',
          type: 'official',
          isPreferred: true,
        };
        if (prefIdx >= 0) {
          names[prefIdx] = nameEntry;
        } else {
          names.unshift(nameEntry);
        }
        delete (entry as Record<string, unknown>).prefLabel;
      } else {
        entry.prefLabel = aggregate.label;
      }
      entry.location = {
        lat: centroid.lat,
        lng: centroid.lng,
        wkt,
        crs: 'EPSG:4326',
      };
      entry.sources = ensureSource(entry.sources, SOURCE_TAG);
      entry.fid = aggregate.featureIds.find((fid) => fid >= 0) ?? null;
      entry.modifiedBy = SOURCE_TAG;
      entry.modifiedAt = new Date().toISOString();
      if (!Array.isArray(entry.externalLinks)) entry.externalLinks = [];
      updated++;
      continue;
    }

    const id = nextStmId(gazetteer['@graph']);
    const entry: GazetteerEntry = {
      '@id': `https://data.suriname-timemachine.org/place/${id}`,
      '@type': determineCrmType('road', gazetteer['@context']),
      id,
      type: 'road',
      prefLabel: aggregate.label,
      altLabels: [],
      broader: null,
      description: 'Road line from the Paramaribo 1916 map.',
      location: {
        lat: centroid.lat,
        lng: centroid.lng,
        wkt,
        crs: 'EPSG:4326',
      },
      sources: [SOURCE_TAG],
      wikidataQid: null,
      fid: aggregate.featureIds.find((fid) => fid >= 0) ?? null,
      psurIds: [],
      district: 'Paramaribo',
      locationDescription: null,
      locationDescriptionOriginal: null,
      placeType: null,
      modifiedBy: null,
      modifiedAt: null,
      externalLinks: [],
      diklandRefs: [],
    };

    gazetteer['@graph'].push(entry);
    byNormalizedName.set(key, [entry]);
    inserted++;
  }

  const summary = [
    `Features read: ${rawGeojson.features.length}`,
    `Street groups after merge by normalized label: ${aggregates.length}`,
    `Duplicate source-tagged fid entries removed: ${dedupedEntries}`,
    `Unnamed source features: ${unnamedFeatures}`,
    `Skipped (missing/unsupported geometry): ${skippedNoGeometry}`,
    `Skipped (invalid WKT/centroid): ${skippedNoWkt}`,
    `Conflicts (multiple existing matches): ${conflicts}`,
    `Updated existing entries: ${updated}`,
    `Inserted new entries: ${inserted}`,
    `Mode: ${options.write ? 'write' : 'dry-run'}`,
  ];

  console.log('\nStreet import summary');
  for (const line of summary) console.log(`  - ${line}`);

  if (!options.write) {
    console.log('\nDry-run complete. Re-run with --write to persist changes.');
    return;
  }

  writeFileSync(options.gazetteerPath, JSON.stringify(gazetteer, null, 2));
  console.log(`\nGazetteer updated: ${options.gazetteerPath}`);
}

main();
