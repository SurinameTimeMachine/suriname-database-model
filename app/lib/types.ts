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
  closeMatch?: string | string[];
  hasOrganizationalAssociation?: string;
  organizationAssociationStatus?: OrganizationAssociationStatus;
  psurId?: string | string[];
  /** @deprecated Legacy aggregate field; the current pipeline does not emit it. */
  P52_has_current_owner?: string;
  /** @deprecated Legacy aggregate field; the current pipeline does not emit it. */
  P51_has_former_or_current_owner?: string;
  P53_has_location?: string;
  P1_is_identified_by?: string | string[];
  depictedOnMap?: MapDepiction[]; // CRM: P138i has representation (via E36 Visual Item)
  lifecycleEvents?: string[]; // Event URIs: E12/E11/E6/E17/E81 etc.
  wasDerivedFrom?: string; // prov:wasDerivedFrom
}

export interface E26PhysicalFeature {
  '@id': string;
  '@type': string[];
  featureType: string;
  prefLabel: string;
  status?: string;
  gazetteerId?: string;
  P2_has_type?: string;
  P53_has_location?: string;
  P70i_is_documented_in?: string;
  P1_is_identified_by?: string | string[];
  mainBodyWater?: string;
  description?: string;
  hasOrganizationalAssociation?: string;
  organizationAssociationStatus?: OrganizationAssociationStatus;
  lifecycleEvents?: string[]; // Event URIs: E12/E11/E6/E17/E81 etc.
  wasDerivedFrom?: string;
}

export type OrganizationAssociationStatus =
  | 'linked'
  | 'needs-organization-link'
  | 'needs-physical-link-review'
  | 'needs-physical-plantation-link';

export interface E74Organization {
  '@id': string;
  '@type': string[];
  additionalType?: string; // sdo:additionalType -> wd:Q188913
  prefLabel: string; // rdfs:label
  associatedPhysicalPlantation?: string | string[];
  organizationAssociationStatus?: OrganizationAssociationStatus;
  psurId?: string | string[]; // source register identifiers
  absorbedInto?: string; // CRM: P99i was dissolved by -> E68 Dissolution (successor E74)
  exactMatch?: string;
  altLabel?: string | string[];
  editorialNote?: string;
  authorityReviewStatus?: 'unreviewed' | 'reviewed' | 'disputed';
  physicalLinkReviewStatus?: 'confirmed-multiple';
  reviewedPhysicalPlaceIds?: string[];
  modifiedAt?: string;
  modifiedBy?: string;
  P1_is_identified_by?: string | string[];
  wasDerivedFrom?: string; // prov:wasDerivedFrom
}

export interface OrganizationAuthorityOverride {
  '@id': string;
  '@type': 'OrganizationAuthorityOverride';
  qid: string;
  preferredLabel?: string;
  alternativeLabels?: string[];
  editorialNote?: string;
  reviewStatus: 'unreviewed' | 'reviewed' | 'disputed';
  physicalLinkReviewStatus?: 'confirmed-multiple';
  reviewedPhysicalPlaceIds?: string[];
  modifiedAt?: string;
  modifiedBy?: string;
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
  lifecycleEvents?: string[]; // Event URIs when this E53 is itself the modeled feature
  wasDerivedFrom?: string; // prov:wasDerivedFrom
}

export interface E41Appellation {
  '@id': string;
  '@type': string[];
  P190_has_symbolic_content: string;
  P72_has_language?: string;
  P128i_is_carried_by?: string;
  P1i_identifies?: string | string[];
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

/** E13 Attribute Assignment - annual observation from Almanakken. */
export interface OrganizationObservation {
  '@id': string;
  '@type': string[];
  observationOf?: string; // CRM: P140 assigned attribute to -> local E74 organization
  sourcePlantationQid?: string; // Source matching key, retained even when unresolved
  observationYear: string; // CRM: P4 has time-span -> E52
  observedName?: string; // CRM: P141 assigned -> E41 Appellation
  sranantongoName?: string; // vernacular plantation name, if recorded
  hasOwner?: string; // CRM: P14 carried out by (P14.1 picot:owner)
  hasAdministrator?: string; // CRM: P14 carried out by (P14.1 picot:administrator)
  hasDirector?: string; // CRM: P14 carried out by (P14.1 picot:director)
  product?: string; // CRM: P141 assigned -> E55 Type
  enslavedCount?: number;
  privateEnslavedCount?: number;
  explicitPlantationEnslavedCount?: number;
  freeResidentsCount?: number;
  presenceInferenceStatus?: string;
  hasDerivedInference?: string;
  deserted?: boolean; // CRM: E17 Type Assignment (P41 classified E25, P42 assigned E55 abandoned)
  locationStd?: string; // CRM: P7 took place at -> E53 Place (text)
  sizeAkkers?: number; // CRM: P43 has dimension -> E54 Dimension (akkers)
  pageReference?: string; // CRM: P3 has note (almanac page reference)
  reportedComponentOrganization?: string | string[];
  reportedComponentOrganizationLabel?: string | string[];
  reportedCompositeOrganization?: string | string[];
  reportedCompositeOrganizationLabel?: string | string[];
  reportedOwnerOrganization?: string | string[];
  reportedOwnerOrganizationLabel?: string | string[];
  enslavedSharedWith?: string;
  hadPrimarySource?: string; // prov:hadPrimarySource
  wasDerivedFrom?: string; // prov:wasDerivedFrom
}

export interface PresenceInference {
  '@id': string;
  '@type': string[];
  inferredPopulationAssociatedWith: string;
  inferredPresenceAt: string;
  inferredPlace?: string;
  populationCategory: string;
  populationCount: number;
  certainty: string;
  inferenceRule: string;
  P4_has_time_span?: string;
  hadPrimarySource?: string;
  wasDerivedFrom: string;
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

export type FeatureLifecycleEventClass = 'E12' | 'E11' | 'E6' | 'E17' | 'E81';

export type FeatureLifecycleEventType =
  | 'production'
  | 'presence'
  | 'status-assignment'
  | 'function-assignment'
  | 'modification'
  | 'destruction'
  | 'transformation';

export interface FeatureLifecycleEvent {
  '@id': string;
  '@type': string[];
  crmClass: FeatureLifecycleEventClass;
  eventType: FeatureLifecycleEventType;
  prefLabel: string;
  featureUri: string;
  P4_has_time_span?: string;
  startYear?: number;
  endYear?: number;
  hadPrimarySource?: string;
  P41_classified?: string;
  P42_assigned?: string;
  P31_has_modified?: string;
  P13_destroyed?: string;
  P123_resulted_in?: string;
  P124_transformed?: string | string[];
  assignedType?: string;
  assignedLabel?: string;
  sourceLabel?: string;
  evidenceKind?: 'production' | 'recorded-function';
  status?: PlantationStatusType | string;
  note?: string | null;
}

export interface GeoJSONFeatureProperties {
  fid: number; // CRM: P48 has preferred identifier -> E42 Identifier
  name: string; // preferred display name (E41 isPreferred)
  allNames?: string[]; // all name texts for this feature (enables multi-name search)
  status: string;
  featureType: string; // PlaceType — granular place type
  mapYear: string; // Derivable from E22 source production date
  stmId?: string; // Gazetteer ID (e.g. "stm-00522") — canonical short ID for cross-linking
  plantationUri?: string;
  featureUri?: string;
  wikidataQid?: string;
  organizationAssociationStatus?: OrganizationAssociationStatus;
  mainBodyWater?: string;
  placeUri?: string;
}

export interface GeoJSONFeature {
  type: 'Feature';
  id: string;
  geometry: {
    type: 'Polygon' | 'LineString' | 'Point' | 'MultiLineString';
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

/** CRM: P72 has language — ISO 639-1/3 codes used in this project */
export type LanguageCode = 'nl' | 'en' | 'srn' | 'und';

/**
 * CRM: P2 has type — name-type vocabulary (type/name-type/*)
 * - official:   formal administrative or legal name
 * - historical: name used in a historical source or period
 * - vernacular: informal, folk, or community name (including volksname)
 * - variant:    alternative spelling or orthographic variant
 */
export type NameType = 'official' | 'historical' | 'vernacular' | 'variant';

/**
 * A named form of a place — corresponds to E41 Appellation in CIDOC-CRM.
 * CRM chain: E53 Place -> P1 is identified by -> E41 Appellation
 *   E41.P190 has symbolic content = text
 *   E41.P72  has language          = language
 *   E41.P2   has type              = type/name-type/{type}
 */
export interface PlaceName {
  text: string; // CRM: P190 has symbolic content
  language: LanguageCode; // CRM: P72 has language
  type: NameType; // CRM: P2 has type -> type/name-type/{type}
  isPreferred: boolean; // true for exactly one name per place (the display name)
  source?: string; // optional: source ID from sources registry
  sourceYear?: number; // optional: year of the source
}

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

export type AssertionCertainty = 'certain' | 'probable' | 'uncertain';

/** District membership assertion with source/time context (interim Gazetteer model). */
export interface DistrictAssertion {
  id: string;
  districtId: string | null;
  districtLabel?: string | null;
  source: string;
  sourceYear?: number;
  certainty?: AssertionCertainty;
  note?: string | null;
  isCurrent?: boolean;
}

/** Product/commodity observation per year/source — from Almanakken E13 assignments. */
export interface ProductAssertion {
  id: string;
  value: string; // e.g. "koffie", "suiker" (CRM: P141 assigned -> E55 Type)
  source: string; // registry sourceId
  startYear?: number;
  endYear?: number;
  note?: string | null;
}

/** Location observation (standardized + original) per year/source — from Almanakken. */
export interface LocationAssertion {
  id: string;
  standardized: string | null; // loc_std (CRM: P7 took place at -> E53 text)
  original: string | null; // loc_org (verbatim source text)
  source: string; // registry sourceId
  startYear?: number;
  endYear?: number;
  note?: string | null;
  /** Stable feature/row locator in the original source dataset. */
  sourceRow?: string;
}

/**
 * Plantation lifecycle status — vocabulary for E55 Type (type/plantation-status/*).
 * CRM: E17 Type Assignment (P41 classified E25 Plantation, P42 assigned E55 Type).
 */
export type PlantationStatusType =
  | 'planned'
  | 'built'
  | 'abandoned'
  | 'reactivated'
  | 'present' // attested by a source at a given year (maps, registers, etc.)
  | 'unknown';

/**
 * Lifecycle status event with source/time context.
 * CRM: E17 Type Assignment — subclass of E13 Attribute Assignment.
 *   P41 classified  → E25 Plantation (the physical thing)
 *   P42 assigned    → E55 Type (type/plantation-status/{status})
 *   P4 has time-span → E52 Time-Span (startYear / endYear)
 *   prov:hadPrimarySource → E22 Source
 */
export interface StatusAssertion {
  id: string;
  status: PlantationStatusType; // CRM: P42 assigned -> E55 Type
  source: string; // registry sourceId (prov:hadPrimarySource -> E22)
  startYear?: number; // CRM: P4 has time-span -> E52 (begin)
  endYear?: number; // CRM: P4 has time-span -> E52 (end)
  note?: string | null;
}

export interface AlmanakkenPlantationRelation {
  qid: string;
  label?: string;
}

export interface AlmanakkenPopulationObservation {
  enslavedCount?: number;
  enslavedOriginal?: string;
  enslavedSharedWith?: string;
  plantationMaleUnfreeResidents?: number;
  plantationFemaleUnfreeResidents?: number;
  plantationTotalUnfreeResidents?: number;
  privateMaleUnfreeResidents?: number;
  privateFemaleUnfreeResidents?: number;
  privateTotalUnfreeResidents?: number;
  freeResidents?: number;
  totalResidents?: number;
  generalTotalEnslaved?: number;
  enslavedFitForWorkPlantations?: number;
  enslavedFitForWorkPrivate?: number;
  enslavedUnfitForWorkPlantations?: number;
  enslavedUnfitForWorkPrivate?: number;
  enslavedOnPlantationsFitForWork?: number;
  enslavedOnPlantationsUnfitForWork?: number;
  freePlantationBoys?: number;
  freePlantationMen?: number;
  freePlantationGirls?: number;
  freePlantationWomen?: number;
  freePlantationTotal?: number;
}

export interface AlmanakkenPlantationObservation {
  recordId: string;
  source: 'almanakken';
  sourceVersion: 'v2';
  qid: string;
  year?: number;
  page?: string;
  littera?: string;
  districtOrDivision?: string;
  locationOriginal?: string;
  locationStandardized?: string;
  riverOrRoad?: string;
  direction?: string;
  plantationOriginal?: string;
  plantationStandardized?: string;
  psurIds?: string[];
  hasParts?: AlmanakkenPlantationRelation[];
  partOf?: AlmanakkenPlantationRelation[];
  referenceOriginal?: string;
  ownedBy?: AlmanakkenPlantationRelation[];
  sizeAkkers?: number;
  product?: string;
  function?: string;
  additionalInfo?: string;
  deserted?: boolean;
  lot?: string;
  sranantongoName?: string;
  population?: AlmanakkenPopulationObservation;
  mill?: {
    type?: string;
    steam?: string;
    water?: string;
  };
  rawManagement?: {
    administrators?: string;
    directors?: string;
    owners?: string;
    administratorsInEurope?: string;
    administratorsInSuriname?: string;
    blankOfficer?: string;
  };
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
  | 'transport-infrastructure'
  | 'road'
  | 'railroad'
  | 'historical-address';

// PLACE_TYPE_CRM and COLONIAL_BIAS_TYPES are now sourced from the
// Geographical Features Thesaurus: data/place-types-thesaurus.jsonld
// Use usePlaceTypes() from lib/thesaurus.ts to access these values.

/** Return the preferred display name for a place (the first PlaceName where isPreferred=true, or the first name text). */
export function getPreferredName(place: GazetteerPlace): string {
  const names = place.names;
  if (!names || names.length === 0) return '';
  return names.find((n) => n.isPreferred)?.text ?? names[0]?.text ?? '';
}
// For server-side / Node scripts, read the thesaurus file directly.

/** Tombstone fields present on deprecated (soft-deleted) entities. Added at deprecation time; omitted entirely on active entries. */
export interface TombstoneFields {
  /** Present and true when the entry has been deprecated (soft-deleted). */
  deprecated?: true;
  /** ISO date (YYYY-MM-DD) when the entry was deprecated. */
  deprecatedAt?: string;
  /** GitHub login of the user who deprecated the entry. */
  deprecatedBy?: string;
  /** URI of the entity that supersedes this one (optional). */
  replacedBy?: string;
  /** Free-text reason for deprecation (optional). */
  deprecationNote?: string;
}

/** Place gazetteer entry — authority record for a named place */
export interface GazetteerPlace extends TombstoneFields {
  id: string;
  type: PlaceType;
  /** All named forms for this place — replaces flat prefLabel + altLabels. */
  names: PlaceName[];
  /** Stable Sranan Tongo names preserved from source data for plantations. */
  sranantongoNames?: string[];
  broader: string | null;
  description: string;
  location: {
    lat: number | null;
    lng: number | null;
    wkt: string | null;
    crs: string;
  };
  sources: string[];
  externalLinks: ExternalLink[];
  fid: number | null;
  psurIds: string[];
  district: string | null;
  districtAssertions?: DistrictAssertion[];
  locationDescription: string | null;
  locationDescriptionOriginal: string | null;
  placeType: string | null;
  productAssertions?: ProductAssertion[];
  locationAssertions?: LocationAssertion[];
  statusAssertions?: StatusAssertion[];
  almanakkenObservations?: AlmanakkenPlantationObservation[];
  /** The E53 location is a persistent coordinate anchor for source observations. */
  locationPoint?: boolean;
  /** Immutable locator for a source-derived entry, preserved across edits. */
  sourceRecord?: {
    dataset: string;
    layer: string;
    featureIndex: number;
  };
  lifecycleEvents?: FeatureLifecycleEvent[];
  diklandRefs: DiklandRef[];
  modifiedBy: string | null;
  modifiedAt: string | null;
  /** Set when this entry has been merged into another place. The value is the surviving place ID. */
  mergedInto?: string;
  // TombstoneFields inherited: deprecated, deprecatedAt, deprecatedBy, replacedBy, deprecationNote
}

/** Return all authority links for an authority without flattening match semantics. */
export function getAuthorityLinks(
  place: Pick<GazetteerPlace, 'externalLinks'>,
  authority: string,
): ExternalLink[] {
  return place.externalLinks.filter((link) => link.authority === authority);
}

/**
 * Return the first authority link for integrations that can accept one identifier only.
 * New data should retain the complete externalLinks array.
 */
export function getPrimaryAuthorityLink(
  place: Pick<GazetteerPlace, 'externalLinks'>,
  authority: string,
): ExternalLink | null {
  return getAuthorityLinks(place, authority)[0] ?? null;
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
  | FeatureLifecycleEvent
  | ProvenanceRecord;

/** @deprecated Use E25Plantation instead */
export type E24Plantation = E25Plantation;

// ---------------------------------------------------------------------------
// Road lifecycle event types (CIDOC-CRM)
// ---------------------------------------------------------------------------

/** CRM E55 Type URI for road direction attributes */
export type RoadDirectionType =
  | 'stm:type/road-direction/bidirectional'
  | 'stm:type/road-direction/one-way';

/** CRM E55 Type URI for road functional class attributes */
export type RoadClassType =
  | 'stm:type/road-class/primary'
  | 'stm:type/road-class/secondary'
  | 'stm:type/road-class/path';

/** Base fields shared by all road lifecycle events */
interface RoadEventBase {
  /** URI of the road (E25 Human-Made Feature) that the event concerns */
  roadUri: string;
  /** URI of the CRM event entity */
  eventUri: string;
  /** Year or date-range the event took effect (E52 Time-Span) */
  timeSpan: string;
  /** URI of the E22 source that records this event */
  sourceUri: string;
}

/**
 * E11 Modification — records a change to the road's geometry (re-routing,
 * extension, or shortening). The new geometry is stored as a WKT string
 * on the resulting E53 Place entity.
 * E11 carries timing/provenance context only (e.g., P4 time-span, source links).
 * CRM chain: E11 -> P31 has modified -> E25; E25 -> P53 has location -> E53 (new geom)
 */
export interface RoadModification extends RoadEventBase {
  crmClass: 'E11';
  /** WKT geometry string of the road after modification (geo:asWKT on new E53) */
  newGeometryWkt: string;
  /** Human-readable note describing the physical change */
  note?: string;
}

/**
 * E81 Transformation — records the merging of two or more roads into one.
 * Parallels the plantation merger pattern: input E25 entities are ended,
 * a new E25 (or the surviving one) is produced.
 * CRM chain: E25+ -> P124 transformed -> E81 -> P123 resulted in -> E25
 */
export interface RoadTransformation extends RoadEventBase {
  crmClass: 'E81';
  /** URIs of all input road entities (E25) that were merged */
  inputRoadUris: string[];
  /** URI of the resulting merged road entity (E25) */
  outputRoadUri: string;
}

/**
 * E6 Destruction — records the permanent removal of a road.
 * Unlike E81 Transformation, no successor entity is produced.
 * CRM chain: E6 -> P13 destroyed -> E25; E6 -> P4 -> E52
 */
export interface RoadDestruction extends RoadEventBase {
  crmClass: 'E6';
  /** Reason or cause of removal, if known */
  note?: string;
}

/**
 * E17 Type Assignment — records a change to the road's direction or
 * functional class (e.g. becomes one-way, downgraded from primary to secondary).
 * Parallels plantation status classification.
 * CRM chain: E17 -> P41 classified -> E25; E17 -> P42 assigned -> E55
 */
export interface RoadAttributeAssignment extends RoadEventBase {
  crmClass: 'E17';
  /** The E55 Type assigned — either a RoadDirectionType or RoadClassType URI */
  assignedType: RoadDirectionType | RoadClassType;
}

/** Discriminated union of all CIDOC-CRM road lifecycle event types */
export type RoadEvent =
  | RoadModification
  | RoadTransformation
  | RoadDestruction
  | RoadAttributeAssignment;
