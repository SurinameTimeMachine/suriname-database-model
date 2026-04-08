// Entity types matching the JSON-LD database structure
// JS property keys are kept for data pipeline compatibility.
// CRM mappings are documented in comments.

/** P138i has representation — maps depicting this plantation (via E22->P128->E36->P138->E25 chain) */
export interface MapDepiction {
  mapId: string; // P48 has preferred identifier -> E42 Identifier
  labelOnMap: string; // P1 is identified by -> E41 Appellation
  hasPolygon?: boolean;
  P70i_is_documented_in?: string;
}

export interface E25Plantation {
  '@id': string;
  '@type': string[];
  status: string;
  featureType: string;
  prefLabel: string; // rdfs:label
  P52_has_current_owner?: string;
  P51_has_former_or_current_owner?: string;
  P53_has_location?: string;
  P1_is_identified_by?: string | string[];
  depictedOnMap?: MapDepiction[]; // CRM: P138i has representation (via E36 Visual Item)
  wasDerivedFrom?: string; // prov:wasDerivedFrom
}

export interface E26PhysicalFeature {
  '@id': string;
  '@type': string[];
  featureType: string;
  prefLabel: string;
  P2_has_type?: string;
  P53_has_location?: string;
  P1_is_identified_by?: string | string[];
  mainBodyWater?: string;
  wasDerivedFrom?: string;
}

export interface E74Organization {
  '@id': string;
  '@type': string[];
  additionalType?: string; // sdo:additionalType -> wd:Q188913
  prefLabel: string; // rdfs:label
  psurId?: string; // CRM: P1 is identified by -> E42 Identifier (PSUR register ID)
  absorbedInto?: string; // CRM: P99i was dissolved by -> E68 Dissolution (successor E74)
  sameAs?: string;
  wasDerivedFrom?: string; // prov:wasDerivedFrom
}

export interface Geometry {
  '@type'?: string;
  asWKT: string;
  geometrySource?: string;
}

export interface E53Place {
  '@id': string;
  '@type': string[];
  fid: number; // CRM: P48 has preferred identifier -> E42 Identifier (QGIS feature ID)
  mapYear: string; // Derivable from E22 source -> E12 Production -> P4 has time-span -> E52
  observedLabel?: string; // CRM: P1 is identified by -> E41 Appellation (map label)
  hasGeometry?: Geometry; // geo:hasGeometry
  P70i_is_documented_in?: string;
  wasDerivedFrom?: string; // prov:wasDerivedFrom
}

export interface E41Appellation {
  '@id': string;
  '@type': string[];
  P190_has_symbolic_content: string;
  P72_has_language?: string;
  P128i_is_carried_by?: string;
  P1i_identifies?: string;
  P139_has_alternative_form?: string;
  mapYear?: string; // Derivable from E22 source -> E12 Production -> P4 has time-span
}

export interface E22Source {
  '@id': string;
  '@type': string[];
  prefLabel: string; // rdfs:label
  P2_has_type?: string;
  mapId?: string; // CRM: P48 has preferred identifier -> E42 Identifier
  mapYear?: string; // Derivable from P108i was produced by -> E12 -> P4 has time-span
  sameAs?: string;
}

/** E13 Attribute Assignment — annual observation from Almanakken */
export interface OrganizationObservation {
  '@id': string;
  '@type': string[];
  observationOf: string; // CRM: P140 assigned attribute to -> E74
  observationYear: string; // CRM: P4 has time-span -> E52
  observedName?: string; // CRM: P141 assigned -> E41 Appellation
  hasOwner?: string; // CRM: P14 carried out by (P14.1 picot:owner)
  hasAdministrator?: string; // CRM: P14 carried out by (P14.1 picot:administrator)
  hasDirector?: string; // CRM: P14 carried out by (P14.1 picot:director)
  product?: string; // CRM: P141 assigned -> E55 Type
  deserted?: boolean; // CRM: E17 Type Assignment (P41 classified E25, P42 assigned E55 abandoned)
  locationStd?: string; // CRM: P7 took place at -> E53 Place (text)
  sizeAkkers?: number; // CRM: P43 has dimension -> E54 Dimension (akkers)
  pageReference?: string; // CRM: P3 has note (almanac page reference)
  hadPrimarySource?: string; // prov:hadPrimarySource
  wasDerivedFrom?: string; // prov:wasDerivedFrom
}

export interface ProvenanceRecord {
  '@id': string;
  '@type': string[];
  sourceFile: string;
  sourceColumn?: string;
  sourceRow?: string;
  transformedBy?: string;
  modelEntity?: string;
  schemaTable?: string;
  linkedVia?: string;
}

export interface GeoJSONFeatureProperties {
  fid: number; // CRM: P48 has preferred identifier -> E42 Identifier
  name: string;
  status: string;
  featureType: string; // PlaceType — granular place type
  mapYear: string; // Derivable from E22 source production date
  plantationUri?: string;
  featureUri?: string;
  organizationQid?: string;
  mainBodyWater?: string;
  placeUri?: string;
}

export interface GeoJSONFeature {
  type: 'Feature';
  id: string;
  geometry: {
    type: 'Polygon' | 'LineString' | 'Point';
    coordinates: number[][][] | number[][] | number[];
  };
  properties: GeoJSONFeatureProperties;
}

export interface GeoJSONCollection {
  type: 'FeatureCollection';
  name: string;
  crs?: unknown;
  features: GeoJSONFeature[];
}

/** SKOS match types for external authority links */
export type SkosMatchType =
  | 'exactMatch'
  | 'closeMatch'
  | 'broadMatch'
  | 'narrowMatch'
  | 'relatedMatch';

/** External authority link with match closeness */
export interface ExternalLink {
  authority: string; // "wikidata" | "tgn" | "geonames" | custom prefix
  identifier: string; // e.g. "Q59132846", "7005564"
  matchType: SkosMatchType;
}

/** Reference to a plantation description PDF in the Dikland (Suriname Heritage Guide) collection */
export interface DiklandRef {
  folderPath: string; // path within the Drive collection, e.g. "erfgoed - geschiedenis/.../Voorburg 2004-01 geschiedenis.pdf"
  driveUrl: string; // direct link (Drive folder or PDF URL)
  author: string | null;
  year: string | null;
  notes: string | null;
}

/** All valid gazetteer place types */
export type PlaceType =
  | 'plantation'
  | 'district'
  | 'river'
  | 'creek'
  | 'settlement'
  | 'military-post'
  | 'station'
  | 'indigenous-village'
  | 'maroon-village'
  | 'town'
  | 'road'
  | 'railroad';

// PLACE_TYPE_CRM and COLONIAL_BIAS_TYPES are now sourced from the
// Geographical Features Thesaurus: data/place-types-thesaurus.jsonld
// Use usePlaceTypes() from lib/thesaurus.ts to access these values.
// For server-side / Node scripts, read the thesaurus file directly.

/** Place gazetteer entry — authority record for a named place */
export interface GazetteerPlace {
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
  wikidataQid: string | null; // backward compat — derived from externalLinks
  externalLinks: ExternalLink[];
  fid: number | null;
  psurIds: string[];
  district: string | null;
  locationDescription: string | null;
  locationDescriptionOriginal: string | null;
  placeType: string | null;
  diklandRefs: DiklandRef[];
  modifiedBy: string | null;
  modifiedAt: string | null;
}

// Union type for entity lookups
export type Entity =
  | E25Plantation
  | E26PhysicalFeature
  | E74Organization
  | E53Place
  | E41Appellation
  | E22Source
  | OrganizationObservation
  | ProvenanceRecord;

/** @deprecated Use E25Plantation instead */
export type E24Plantation = E25Plantation;
