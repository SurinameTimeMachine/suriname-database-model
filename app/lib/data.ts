import type {
  E22Source,
  E25Plantation,
  E26PhysicalFeature,
  E41Appellation,
  E53Place,
  E74Organization,
  GeoJSONCollection,
  OrganizationObservation,
  ProvenanceRecord,
} from './types';

const DATA_BASE = '/data';

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${DATA_BASE}/${path}`);
  return res.json();
}

let _plantations: Record<string, E25Plantation> | null = null;
let _physicalFeatures: Record<string, E26PhysicalFeature> | null = null;
let _organizations: Record<string, E74Organization> | null = null;
let _places: Record<string, E53Place> | null = null;
let _sources: Record<string, E22Source> | null = null;
let _appellationsByEntity: Record<string, E41Appellation[]> | null = null;
let _observationsByOrg: Record<string, OrganizationObservation[]> | null = null;
let _provenance: Record<string, ProvenanceRecord> | null = null;
let _geojson: GeoJSONCollection | null = null;

export async function getPlantations() {
  if (!_plantations) _plantations = await fetchJSON('plantations.json');
  return _plantations!;
}

export async function getPhysicalFeatures() {
  if (!_physicalFeatures)
    _physicalFeatures = await fetchJSON('physical-features.json');
  return _physicalFeatures!;
}

export async function getOrganizations() {
  if (!_organizations) _organizations = await fetchJSON('organizations.json');
  return _organizations!;
}

export async function getPlaces() {
  if (!_places) _places = await fetchJSON('places.json');
  return _places!;
}

export async function getSources() {
  if (!_sources) _sources = await fetchJSON('sources.json');
  return _sources!;
}

export async function getAppellationsByEntity() {
  if (!_appellationsByEntity)
    _appellationsByEntity = await fetchJSON('appellations-by-entity.json');
  return _appellationsByEntity!;
}

export async function getObservationsByOrg() {
  if (!_observationsByOrg)
    _observationsByOrg = await fetchJSON('observations-by-org.json');
  return _observationsByOrg!;
}

export async function getProvenance() {
  if (!_provenance) _provenance = await fetchJSON('provenance.json');
  return _provenance!;
}

export async function getGeoJSON() {
  if (!_geojson) _geojson = await fetchJSON('map-features.geojson');
  return _geojson!;
}

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
