import type {
  E22Source,
  E25Plantation,
  E26PhysicalFeature,
  E41Appellation,
  E53Place,
  E74Organization,
  FeatureLifecycleEvent,
  GeoJSONCollection,
  OrganizationObservation,
  ProvenanceRecord,
} from './types';

const DATA_BASE = '/data';

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${DATA_BASE}/${path}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${path}: ${res.status}`);
  }
  return res.json();
}

function createDataLoader<T>(path: string) {
  let value: T | null = null;
  let promise: Promise<T> | null = null;

  return async () => {
    if (value) return value;
    if (!promise) {
      promise = fetchJSON<T>(path)
        .then((data) => {
          value = data;
          return data;
        })
        .catch((error) => {
          promise = null;
          throw error;
        });
    }
    return promise;
  };
}

export const getPlantations = createDataLoader<Record<string, E25Plantation>>(
  'plantations.json',
);
export const getPhysicalFeatures = createDataLoader<
  Record<string, E26PhysicalFeature>
>('physical-features.json');
export const getOrganizations = createDataLoader<Record<string, E74Organization>>(
  'organizations.json',
);
export const getPlaces = createDataLoader<Record<string, E53Place>>(
  'places.json',
);
export const getSources = createDataLoader<Record<string, E22Source>>(
  'sources.json',
);
export const getAppellationsByEntity = createDataLoader<
  Record<string, E41Appellation[]>
>('appellations-by-entity.json');
export const getObservationsByOrg = createDataLoader<
  Record<string, OrganizationObservation[]>
>('observations-by-org.json');
export const getLifecycleEvents = createDataLoader<
  Record<string, FeatureLifecycleEvent[]>
>('lifecycle-events.json');
export const getProvenance = createDataLoader<Record<string, ProvenanceRecord>>(
  'provenance.json',
);
export const getGeoJSON =
  createDataLoader<GeoJSONCollection>('map-features.geojson');

/** Load all data stores in parallel */
export async function loadAllData() {
  const [
    plantations,
    physicalFeatures,
    organizations,
    places,
    sources,
    appellations,
    observations,
    lifecycleEvents,
    provenance,
    geojson,
  ] = await Promise.all([
    getPlantations(),
    getPhysicalFeatures(),
    getOrganizations(),
    getPlaces(),
    getSources(),
    getAppellationsByEntity(),
    getObservationsByOrg(),
    getLifecycleEvents(),
    getProvenance(),
    getGeoJSON(),
  ]);
  return {
    plantations,
    physicalFeatures,
    organizations,
    places,
    sources,
    appellations,
    observations,
    lifecycleEvents,
    provenance,
    geojson,
  };
}

export type AllData = Awaited<ReturnType<typeof loadAllData>>;

/** Get a short label for a URI */
export function uriLabel(uri: string): string {
  if (uri.includes('wikidata.org/entity/')) return uri.split('/').pop()!;
  if (uri.includes('suriname-timemachine.org/ontology/')) {
    return uri.replace('https://suriname-timemachine.org/ontology/', '');
  }
  if (uri.includes('data.suriname-timemachine.org/')) {
    return uri.replace('https://data.suriname-timemachine.org/', '');
  }
  return uri;
}

/**
 * CRITERIA / George Bruseker CIDOC-CRM colour scheme.
 * Matches the project's own Mermaid diagrams.
 * See: https://github.com/chin-rcip/CRITERIA
 */
export const CRM_COLORS: Record<string, string> = {
  E25: '#e6956b', // E25 Human-Made Feature (warm brown) -- plantation
  E26: '#5b9bd5', // E26 Physical Feature (blue) -- rivers/creeks
  E24: '#e6956b', // E24 Physical Human-Made Thing (warm brown) -- legacy alias
  E22: '#c78e66', // E22 Human-Made Object (brown) -- sources
  E36: '#d4a574', // E36 Visual Item (tan)
  E53: '#94cc7d', // E53 Place (green)
  E74: '#ffbdca', // E74 Group (pink)
  E41: '#fef3ba', // E41 Appellation (yellow)
  E13: '#82ddff', // E13 Attribute Assignment (blue)
  E39: '#ffe6eb', // E39 Actor -- person roles (light pink)
  E55: '#d4edda', // E55 Type (light green)
  E52: '#cce5ff', // E52 Time-Span (light blue)
  E54: '#e2d9f3', // E54 Dimension (light purple)
  E12: '#f0c87a', // E12 Production (warm gold)
  E17: '#f0a0a0', // E17 Type Assignment (muted red)
  E42: '#b8c9e0', // E42 Identifier (steel blue)
  E81: '#f0a0a0', // E81 Transformation (muted red)
  E11: '#c8a86e', // E11 Modification (warm tan) -- road/feature re-routing
  E6: '#b06060', // E6 Destruction (muted brick red) -- road removal
  E68: '#e0b0b0', // E68 Dissolution (dusty rose)
  PROV: '#d4c4fb', // Provenance (lavender)
  Provenance: '#d4c4fb',
};

/** Full CIDOC-CRM class names for tooltips */
export const CRM_CLASS_NAMES: Record<string, string> = {
  E25: 'E25 Human-Made Feature',
  E26: 'E26 Physical Feature',
  E24: 'E24 Physical Human-Made Thing',
  E22: 'E22 Human-Made Object',
  E36: 'E36 Visual Item',
  E53: 'E53 Place',
  E74: 'E74 Group / sdo:Organization',
  E41: 'E41 Appellation',
  E13: 'E13 Attribute Assignment',
  E39: 'E39 Actor',
  E55: 'E55 Type',
  E52: 'E52 Time-Span',
  E54: 'E54 Dimension',
  E12: 'E12 Production',
  E17: 'E17 Type Assignment',
  E42: 'E42 Identifier',
  E81: 'E81 Transformation',
  E68: 'E68 Dissolution',
  PROV: 'prov:ProvenanceRecord',
};

// Place-type metadata (colors, labels, CRM badges, colonial bias notes)
// is now sourced from the Geographical Features Thesaurus:
//   data/place-types-thesaurus.jsonld
// Use usePlaceTypes() from lib/thesaurus.ts to access these values.

/** Get entity type color using CRITERIA scheme */
export function entityTypeColor(typeStr: string): string {
  for (const [key, color] of Object.entries(CRM_COLORS)) {
    if (typeStr.includes(key)) return color;
  }
  return '#6b7280';
}

/** Get short type badge label */
export function typeBadge(types: string | string[]): string {
  const arr = Array.isArray(types) ? types : [types];
  if (arr.some((t) => t.includes('Plantation') || t.includes('E25')))
    return 'E25';
  if (arr.some((t) => t.includes('E26'))) return 'E26';
  if (arr.some((t) => t.includes('E74'))) return 'E74';
  if (arr.some((t) => t.includes('E53'))) return 'E53';
  if (arr.some((t) => t.includes('E41'))) return 'E41';
  if (arr.some((t) => t.includes('E22'))) return 'E22';
  if (arr.some((t) => t.includes('Observation') || t.includes('E13')))
    return 'E13';
  if (arr.some((t) => t.includes('Provenance'))) return 'PROV';
  return '?';
}
