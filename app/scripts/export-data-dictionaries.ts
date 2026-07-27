/**
 * Export one field-level CSV data dictionary for every tracked JSON,
 * JSON-LD, and GeoJSON table under data/.
 *
 * The dictionaries describe current storage, not a target ontology. Curated
 * descriptions are used where the field semantics are known; safe generated
 * descriptions make undocumented source columns visible without guessing.
 */
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';

type JsonObject = Record<string, unknown>;

interface TableMetadata {
  tableId: string;
  sourceFile: string;
  recordScope: '@graph[]' | 'features[]' | 'document';
  recordCount: number;
  role: 'editorial-authority' | 'source-snapshot';
  editability: 'editor-managed' | 'immutable-source';
}

interface FieldProfile {
  path: string;
  seenInRecords: Set<number>;
  valueCount: number;
  nullCount: number;
  types: Set<string>;
  examples: string[];
}

const APP_DIR = join(__dirname, '..');
const REPO_DIR = join(APP_DIR, '..');
const DATA_DIR = join(REPO_DIR, 'data');
const OUTPUT_DIR = join(REPO_DIR, 'docs', 'data-dictionary');

const EDITORIAL_TABLES = new Set([
  'data/dikland-collection.jsonld',
  'data/organization-authority-overrides.jsonld',
  'data/place-types-thesaurus.jsonld',
  'data/places-gazetteer.jsonld',
  'data/sources-registry.jsonld',
]);

const DESCRIPTIONS: Record<string, string> = {
  '@id': 'Canonical or compact identifier for the described entity.',
  '@type': 'One or more semantic classes assigned to the entity.',
  id: 'Stable identifier used to address this record.',
  type: 'Record or feature type used by the current application model.',
  ID: 'Identifier supplied by the original GIS source feature.',
  Name: 'Label supplied by the original GIS source feature.',
  content: 'Literal textual or geometric content carried by this node.',
  prefLabel: 'Preferred human-readable label for the entity or concept.',
  altLabel: 'Alternative human-readable label retained for discovery.',
  altLabels: 'Alternative human-readable labels retained for discovery.',
  definition: 'Normative explanation of the meaning of a vocabulary concept.',
  description: 'Human-readable description of the record.',
  editorialNote: 'Editorial guidance or contextual note maintained by reviewers.',
  scopeNote: 'Guidance defining when a vocabulary concept should be applied.',
  historyNote: 'Note documenting the history of a vocabulary concept.',
  names: 'Source-qualified and editorial names associated with the place record.',
  text: 'Literal form of a name or source transcription.',
  language: 'Language code for the associated textual value.',
  isPreferred: 'Whether this name is the current preferred display name.',
  nameType: 'Editorial classification of the role of a name.',
  source: 'Identifier of the source registry entry supporting this value.',
  sources: 'Source registry identifiers associated with the record.',
  sourceId: 'Stable local identifier for a registered source.',
  sourceYear: 'Year in which the supporting source carries this value.',
  sourceRow: 'Stable row or record locator within the supporting source dataset.',
  sourceVersion: 'Version label of the dataset structure from which the row came.',
  sourceRecord: 'Immutable locator for the original source-derived feature.',
  dataset: 'Dataset identifier used by an immutable source locator.',
  layer: 'Layer identifier used by an immutable source locator.',
  featureIndex: 'Zero-based source feature position used as an immutable locator.',
  recordId: 'Stable identifier of a source observation.',
  qid: 'Wikidata Q identifier used to reconcile a plantation organization.',
  wikidataQid: 'Wikidata Q identifier used for authority reconciliation.',
  psurIds: 'Identifiers assigned by the Suriname Plantation Dataset.',
  fid: 'Identifier inherited from a GIS source feature.',
  externalLinks: 'Typed links to identifiers or records in external authorities.',
  authority: 'Name of the external authority that issued an identifier.',
  identifier: 'Identifier value issued by an authority.',
  matchType: 'SKOS mapping relation describing the strength of an external match.',
  exactMatch: 'External concept or entity judged to have equivalent identity.',
  closeMatch: 'External concept or entity judged to be sufficiently similar for linking.',
  broader: 'Identifier of the broader place or vocabulary concept.',
  narrower: 'Identifiers of more specific vocabulary concepts.',
  related: 'Identifiers of associatively related vocabulary concepts.',
  inScheme: 'Identifier of the vocabulary concept scheme containing this concept.',
  topConceptOf: 'Vocabulary scheme for which this concept is a top concept.',
  hasTopConcept: 'Top-level concepts contained by a vocabulary scheme.',
  typeId: 'Stable application identifier for a place-type concept.',
  crmClass: 'CIDOC CRM class selected for records using this place type.',
  crmBadge: 'Short CIDOC CRM class label used in the interface.',
  color: 'Presentation color assigned to a place-type concept.',
  sortOrder: 'Numeric order used to display vocabulary concepts.',
  classified_as: 'Vocabulary concepts classifying this node.',
  location: 'Current editorial geometry and coordinate representation.',
  locationPoint: 'Whether this record represents a source-derived location point.',
  locationDescription: 'Standardized textual description of the location.',
  locationDescriptionOriginal: 'Original source wording describing the location.',
  lat: 'Latitude in WGS84 decimal degrees.',
  lng: 'Longitude in WGS84 decimal degrees.',
  wkt: 'Geometry serialized as Well-Known Text in longitude/latitude order.',
  geometry: 'GeoJSON geometry associated with this source feature.',
  coordinates: 'Coordinate array following the GeoJSON geometry type.',
  properties: 'Source attributes attached to a GeoJSON feature.',
  broaderPlace: 'Broader geographic entity containing this place.',
  district: 'Current editorial district identifier.',
  districtAssertions: 'Source-qualified statements assigning a district over time.',
  districtId: 'Gazetteer identifier of the asserted district.',
  locationAssertions: 'Source-qualified statements about location wording or position.',
  statusAssertions: 'Source-qualified operational status statements over time.',
  productAssertions: 'Source-qualified product statements over time.',
  status: 'Operational or editorial status value.',
  product: 'Product or production category reported by a source.',
  value: 'Literal value assigned by the enclosing assertion.',
  standardized: 'Editorially standardized form of a source value.',
  original: 'Unchanged transcription of a source value.',
  startYear: 'First year covered by the statement or interval.',
  endYear: 'Last year covered by the statement or interval.',
  certainty: 'Editorial certainty assigned to an interpretation.',
  note: 'Optional explanatory note about this value or assertion.',
  notes: 'Human-readable notes supplied by a source or editor.',
  lifecycleEvents: 'Source-qualified events affecting a physical feature over time.',
  eventType: 'Application event category used for a lifecycle statement.',
  crmClassEvent: 'CIDOC CRM class used for a lifecycle event.',
  almanakkenObservations: 'Materialized Almanakken rows retained as source evidence.',
  year: 'Calendar year associated with this source value.',
  page: 'Page reference within the historical source.',
  littera: 'Source section or letter marker retained from the Almanakken.',
  plantationOriginal: 'Plantation name exactly as transcribed from the source row.',
  plantationStandardized: 'Standardized plantation name supplied by the dataset.',
  districtOrDivision: 'District or division wording recorded by the source.',
  locationOriginal: 'Location wording exactly as transcribed from the source.',
  locationStandardized: 'Standardized location wording supplied by the dataset.',
  riverOrRoad: 'River or road associated with the plantation in the source.',
  direction: 'Direction or river-bank wording supplied by the source.',
  hasParts: 'Source-reported component plantation organizations.',
  partOf: 'Source-reported composite plantation organizations.',
  ownedBy: 'Source-reported owning organizations.',
  label: 'Human-readable label supplied for a referenced entity.',
  referenceOriginal: 'Unchanged source wording for a relationship reference.',
  sizeAkkers: 'Plantation area reported by the source in akkers.',
  function: 'Function or production activity reported by the source.',
  additionalInfo: 'Additional source text not represented by a narrower field.',
  deserted: 'Whether the source explicitly reports the plantation as deserted.',
  lot: 'Lot identifier or wording reported by the source.',
  sranantongoName: 'Sranantongo name reported by the source.',
  population: 'Structured population counts retained from the source row.',
  mill: 'Structured mill information retained from the source row.',
  rawManagement: 'Unchanged management and ownership text from the source row.',
  administrators: 'Administrator names exactly as represented in the source.',
  directors: 'Director names exactly as represented in the source.',
  owners: 'Owner names exactly as represented in the source.',
  deprecated: 'Whether the record has been retired without deleting its history.',
  deprecatedAt: 'Date on which the record was retired.',
  deprecatedBy: 'Editor or process responsible for retiring the record.',
  replacedBy: 'Identifier of the record replacing this retired record.',
  deprecationNote: 'Explanation for retiring or replacing the record.',
  mergedInto: 'Surviving Gazetteer identifier after editorial duplicate reconciliation.',
  modifiedAt: 'Date of the latest saved editorial change.',
  modifiedBy: 'GitHub account responsible for the latest saved editorial change.',
  reviewStatus: 'Editorial review state of an authority record.',
  physicalLinkReviewStatus: 'Review state of E25-to-E74 plantation links.',
  reviewedPhysicalPlaceIds: 'Complete set of physical place records reviewed together.',
  associatedPhysicalPlaceIds: 'Reviewed physical places selected for organization association.',
  diklandRefs: 'References from the place record to items in the Dikland collection.',
  folderPath: 'Path of the referenced item within the source collection.',
  driveUrl: 'URL resolving to the referenced source file or folder.',
  author: 'Person or organization responsible for the source item.',
  collectionUrl: 'Landing page or folder URL for the source collection.',
  holdingArchive: 'Archive or institution holding the source.',
  handleUrl: 'Persistent or archival landing-page URL for the source.',
  iiifManifest: 'IIIF Presentation manifest describing the source.',
  iiifInfoUrl: 'IIIF Image API information URL for the source image.',
  linkedToGazetteer: 'Whether this source currently participates in Gazetteer derivation.',
  mapYear: 'Year represented by a historical map.',
  timeSpan: 'Textual coverage period currently recorded for a source.',
  maker: 'Maker or creator transcribed for the source.',
  publisher: 'Publisher transcribed for the source.',
  publicationPlace: 'Publication place transcribed for the source.',
  sameAs: 'External URI asserted to identify the same source entity.',
  formsPartOf: 'Larger collection or source of which this item forms part.',
  sourcePath: 'Repository-relative path of the source file used by a transformation.',
  geometryType: 'GeoJSON geometry type used by the source feature.',
  P2_has_type: 'CIDOC CRM type assigned to this source registry entity.',
  created: 'Date on which this vocabulary record was created.',
  modified: 'Date of the latest change to this vocabulary record.',
  placeType: 'Vocabulary identifier classifying the structural type of this place.',
  crs: 'Coordinate reference system used by the stored location.',
  districtLabel: 'Human-readable label of the district assigned by this assertion.',
  isCurrent: 'Whether this district assertion is selected as the current editorial view.',
  wijk: 'Ward label transcribed from the original GIS source.',
  Wijk: 'Ward label transcribed from the original GIS source.',
  buurt: 'Neighbourhood label transcribed from the original GIS source.',
  wijk_buurt: 'Combined ward and neighbourhood label transcribed from the original GIS source.',
  'gebBS28-68': 'Building or area code retained unchanged from the original GIS source.',
  adres1885: 'Address wording recorded for 1885 in the original GIS source.',
  beschrijving1854: 'Description for 1854 retained from the original GIS source.',
  beschrijving1885: 'Description for 1885 retained from the original GIS source.',
  beschrijving1916: 'Description for 1916 retained from the original GIS source.',
  bioscoopnaam: 'Cinema name retained from the original GIS source.',
  huisnummer1885: 'House number recorded for 1885 in the original GIS source.',
  legenda1885: 'Map legend value recorded for 1885 in the original GIS source.',
  legenda1916: 'Map legend value recorded for 1916 in the original GIS source.',
  red_commentaar: 'Editorial comment retained from the original GIS source.',
  straatnaam1885: 'Street name recorded for 1885 in the original GIS source.',
  toevoeging1837: 'Additional description for 1837 retained from the original GIS source.',
  toevoeging1885: 'Additional description for 1885 retained from the original GIS source.',
  wijk1885: 'Ward recorded for 1885 in the original GIS source.',
  steam: 'Source value for steam-powered machinery recorded in the Almanakken row.',
  water: 'Source value for water-powered machinery recorded in the Almanakken row.',
  enslavedCount: 'Normalized count of enslaved people reported by the source row.',
  enslavedOriginal: 'Original source transcription of the reported enslaved population.',
  enslavedSharedWith: 'Source reference to another plantation with which the reported enslaved population was shared.',
  plantationMaleUnfreeResidents: 'Count of male unfree residents on plantations reported by the source.',
  plantationFemaleUnfreeResidents: 'Count of female unfree residents on plantations reported by the source.',
  plantationTotalUnfreeResidents: 'Total count of unfree residents on plantations reported by the source.',
  privateMaleUnfreeResidents: 'Count of male unfree residents in private service reported by the source.',
  privateFemaleUnfreeResidents: 'Count of female unfree residents in private service reported by the source.',
  privateTotalUnfreeResidents: 'Total count of unfree residents in private service reported by the source.',
  freeResidents: 'Count of free residents reported by the source.',
  totalResidents: 'General total count of residents reported by the source.',
  generalTotalEnslaved: 'General total count of enslaved people reported by the source.',
  enslavedFitForWorkPlantations: 'Count of enslaved people on plantations classified by the source as fit for work.',
  enslavedFitForWorkPrivate: 'Count of enslaved people in private service classified by the source as fit for work.',
  enslavedUnfitForWorkPlantations: 'Count of enslaved people on plantations classified by the source as unfit for work.',
  enslavedUnfitForWorkPrivate: 'Count of enslaved people in private service classified by the source as unfit for work.',
  enslavedOnPlantationsFitForWork: 'Count of enslaved people present on plantations and classified by the source as fit for work.',
  enslavedOnPlantationsUnfitForWork: 'Count of enslaved people present on plantations and classified by the source as unfit for work.',
  freePlantationBoys: 'Count of free boys on plantations reported by the source.',
  freePlantationMen: 'Count of free men on plantations reported by the source.',
  freePlantationGirls: 'Count of free girls on plantations reported by the source.',
  freePlantationWomen: 'Count of free women on plantations reported by the source.',
  freePlantationTotal: 'Total count of free people on plantations reported by the source.',
  administratorsInEurope: 'Administrators in Europe transcribed from the source row.',
  administratorsInSuriname: 'Administrators in Suriname transcribed from the source row.',
  blankOfficer: 'Historical “blank-officier” value transcribed unchanged from the source row.',
};

const LINKED_ART_PATTERNS: Record<string, string> = {
  '@id': 'id',
  id: 'id / identified_by (Identifier)',
  identifier: 'identified_by (Identifier)',
  sourceId: 'identified_by (Identifier)',
  typeId: 'identified_by (Identifier)',
  fid: 'identified_by (Identifier)',
  psurIds: 'identified_by (Identifier)',
  '@type': 'type',
  type: 'type / classified_as',
  crmClass: 'type',
  placeType: 'classified_as',
  prefLabel: '_label + identified_by (Name)',
  names: 'identified_by (Name) or AppellativeStatus',
  text: 'identified_by[].content',
  altLabel: 'identified_by (Name)',
  altLabels: 'identified_by (Name)',
  definition: 'referred_to_by (LinguisticObject)',
  description: 'referred_to_by (LinguisticObject)',
  note: 'referred_to_by (LinguisticObject)',
  notes: 'referred_to_by (LinguisticObject)',
  location: 'is_approximated_by / defined_by',
  lat: 'defined_by (GeometricPlaceExpression)',
  lng: 'defined_by (GeometricPlaceExpression)',
  wkt: 'defined_by (GeometricPlaceExpression)',
  geometry: 'defined_by (GeometricPlaceExpression)',
  coordinates: 'defined_by (GeometricPlaceExpression)',
  broader: 'TopographicalStatus / part_of',
  district: 'TopographicalStatus / part_of',
  externalLinks: 'SimilarityStatus / equivalent',
  exactMatch: 'equivalent',
  closeMatch: 'SimilarityStatus',
  lifecycleEvents: 'Event with timespan',
  source: 'referred_to_by + assertion provenance',
  sources: 'referred_to_by + assertion provenance',
  sourceRow: 'referred_to_by (source record locator)',
  modifiedAt: 'prov:Activity (editorial extension)',
  modifiedBy: 'prov:Activity carried_out_by (editorial extension)',
  deprecatedAt: 'prov:invalidatedAtTime (editorial extension)',
};

function walkJsonFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walkJsonFiles(path);
    return /\.(?:json|jsonld|geojson)$/.test(entry.name) ? [path] : [];
  });
}

function jsonType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function exampleJson(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized == null) return String(value);
  return serialized.length > 180 ? `${serialized.slice(0, 177)}...` : serialized;
}

function profileValue(
  value: unknown,
  path: string,
  recordIndex: number,
  profiles: Map<string, FieldProfile>,
) {
  if (path) {
    const profile = profiles.get(path) ?? {
      path,
      seenInRecords: new Set<number>(),
      valueCount: 0,
      nullCount: 0,
      types: new Set<string>(),
      examples: [],
    };
    profile.seenInRecords.add(recordIndex);
    profile.valueCount++;
    profile.types.add(jsonType(value));
    if (value === null) profile.nullCount++;
    if (profile.examples.length < 3) {
      const example = exampleJson(value);
      if (!profile.examples.includes(example)) profile.examples.push(example);
    }
    profiles.set(path, profile);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      profileValue(item, `${path}[]`, recordIndex, profiles);
    }
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as JsonObject)) {
      profileValue(child, path ? `${path}.${key}` : key, recordIndex, profiles);
    }
  }
}

function tableId(sourceFile: string): string {
  return sourceFile
    .replace(/^data\//, '')
    .replace(/\.(?:json|jsonld|geojson)$/, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function humanize(path: string): string {
  const leaf = path
    .replace(/\[\]/g, '')
    .split('.')
    .pop()
    ?.replace(/^@/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  return (leaf || path).replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function leafName(path: string): string {
  return (
    path
      .replace(/\[\]/g, '')
      .split('.')
      .pop() ?? path
  );
}

function dimensions(path: string): string {
  const segments = path
    .replace(/\[\]/g, '')
    .split('.')
    .map((segment) => segment.toLowerCase());
  const hasAny = (values: string[]) =>
    segments.some((segment) => values.includes(segment));
  const matched = new Set<string>();
  if (hasAny([
    'location',
    'geometry',
    'coordinates',
    'lat',
    'lng',
    'wkt',
    'geometrytype',
    'broaderplace',
    'district',
    'districtassertions',
    'districtid',
    'districtlabel',
    'locationassertions',
    'locationdescription',
    'locationdescriptionoriginal',
    'locationoriginal',
    'locationstandardized',
    'locationpoint',
    'districtordivision',
    'riverorroad',
    'publicationplace',
    'wijk',
    'buurt',
    'wijk_buurt',
    'wijk1885',
    'adres1885',
    'straatnaam1885',
  ])) {
    matched.add('space');
  }
  if (hasAny([
    'year',
    'sourceyear',
    'startyear',
    'endyear',
    'mapyear',
    'timespan',
    'created',
    'modified',
    'modifiedat',
    'deprecatedat',
    'lifecycleevents',
    'eventtype',
  ])) {
    matched.add('time');
  }
  if (hasAny([
    'source',
    'sources',
    'sourceid',
    'sourceyear',
    'sourcerow',
    'sourceversion',
    'sourcerecord',
    'sourcepath',
    'dataset',
    'layer',
    'featureindex',
    'recordid',
    'page',
    'referenceoriginal',
    'holdingarchive',
    'handleurl',
    'iiifmanifest',
    'iiifinfourl',
    'collectionurl',
    'formspartof',
  ])) {
    matched.add('source');
  }
  if (hasAny([
    'modified',
    'modifiedat',
    'modifiedby',
    'deprecated',
    'deprecatedat',
    'deprecatedby',
    'replacedby',
    'deprecationnote',
    'mergedinto',
    'reviewstatus',
    'physicallinkreviewstatus',
    'reviewedphysicalplaceids',
    'associatedphysicalplaceids',
    'certainty',
    'note',
    'notes',
    'editorialnote',
    'matchtype',
  ])) {
    matched.add('provenance');
  }
  if (
    /(^|\.)(@?id|identifier|qid|fid|psurids|externalLinks)(\[\])?(\.|$)/i.test(
      path,
    )
  ) {
    matched.add('identity');
  }
  if (hasAny([
    '@type',
    'type',
    'placetype',
    'typeid',
    'crmclass',
    'crmbadge',
    'preflabel',
    'altlabel',
    'label',
    'definition',
    'broader',
    'narrower',
    'related',
    'inscheme',
    'topconceptof',
    'hastopconcept',
    'color',
    'sortorder',
    'p2_has_type',
  ])) {
    matched.add('vocabulary');
  }
  return [...matched].sort().join(';') || 'content';
}

function generatedDescription(path: string): string {
  const title = humanize(path);
  const fieldDimensions = dimensions(path);
  if (fieldDimensions.includes('space')) {
    return `Spatial value stored in “${title}”; its exact interpretation should be confirmed against the source documentation.`;
  }
  if (
    fieldDimensions.includes('source') ||
    fieldDimensions.includes('provenance')
  ) {
    return `Source or provenance value stored in “${title}”; a curated definition has not yet been recorded.`;
  }
  return `Value stored in “${title}”; a curated field definition has not yet been recorded.`;
}

function localizedDescription(path: string): string | undefined {
  const match = path.match(
    /(?:^|\.)(prefLabel|altLabel|definition|editorialNote|scopeNote|historyNote)\.(en|nl|srn)(?:\[\])?$/,
  );
  if (!match) return undefined;
  const [, parent, language] = match;
  const languageLabel =
    language === 'en' ? 'English' : language === 'nl' ? 'Dutch' : 'Sranantongo';
  return `${languageLabel}-language value of ${humanize(parent)}.`;
}

function contextObjects(context: unknown): JsonObject[] {
  if (Array.isArray(context)) {
    return context.flatMap((entry) => contextObjects(entry));
  }
  return context && typeof context === 'object' && !Array.isArray(context)
    ? [context as JsonObject]
    : [];
}

function expandCompactTerm(term: string, contexts: JsonObject[]): string {
  if (term.startsWith('@')) return term;
  const colon = term.indexOf(':');
  if (colon < 0) return term;
  const prefix = term.slice(0, colon);
  const suffix = term.slice(colon + 1);
  for (const context of contexts) {
    const value = context[prefix];
    if (typeof value === 'string') return `${value}${suffix}`;
  }
  return term;
}

function linkedDataTerm(
  path: string,
  contexts: JsonObject[],
  isGeoJson: boolean,
): string {
  const leaf = leafName(path);
  if (leaf === '@id' || leaf === '@type') return leaf;
  if (leaf.includes(':')) return expandCompactTerm(leaf, contexts);
  for (const context of contexts) {
    const definition = context[leaf];
    if (typeof definition === 'string') {
      return expandCompactTerm(definition, contexts);
    }
    if (
      definition &&
      typeof definition === 'object' &&
      !Array.isArray(definition) &&
      typeof (definition as JsonObject)['@id'] === 'string'
    ) {
      return expandCompactTerm(
        (definition as JsonObject)['@id'] as string,
        contexts,
      );
    }
  }
  if (!isGeoJson) return '';
  if (leaf === 'geometry' || leaf === 'coordinates' || leaf === 'properties') {
    return `https://purl.org/geojson/vocab#${leaf}`;
  }
  if (leaf === 'type') return '@type';
  return '';
}

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  return [
    columns.map(csvCell).join(','),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(',')),
  ].join('\n') + '\n';
}

function inspectTable(filePath: string): {
  metadata: TableMetadata;
  rows: Array<Record<string, unknown>>;
} {
  const sourceFile = relative(REPO_DIR, filePath);
  const document = JSON.parse(readFileSync(filePath, 'utf-8')) as JsonObject;
  const graph = document['@graph'];
  const features = document.features;
  const recordScope = Array.isArray(graph)
    ? '@graph[]'
    : document.type === 'FeatureCollection' && Array.isArray(features)
      ? 'features[]'
      : 'document';
  const records = (
    recordScope === '@graph[]'
      ? graph
      : recordScope === 'features[]'
        ? features
        : [document]
  ) as unknown[];
  const role = EDITORIAL_TABLES.has(sourceFile)
    ? 'editorial-authority'
    : 'source-snapshot';
  const metadata: TableMetadata = {
    tableId: tableId(sourceFile),
    sourceFile,
    recordScope,
    recordCount: records.length,
    role,
    editability:
      role === 'editorial-authority' ? 'editor-managed' : 'immutable-source',
  };
  const profiles = new Map<string, FieldProfile>();
  records.forEach((record, index) =>
    profileValue(record, '', index, profiles),
  );
  const contexts = contextObjects(document['@context']);
  const isGeoJson = filePath.endsWith('.geojson');

  return {
    metadata,
    rows: [...profiles.values()]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((profile) => {
        const leaf = leafName(profile.path);
        const description =
          DESCRIPTIONS[profile.path] ??
          DESCRIPTIONS[leaf] ??
          localizedDescription(profile.path);
        return {
          table_id: metadata.tableId,
          source_file: metadata.sourceFile,
          record_scope: metadata.recordScope,
          field_path: profile.path,
          column_title: humanize(profile.path),
          description: description ?? generatedDescription(profile.path),
          description_status: description ? 'curated' : 'generated-needs-review',
          json_types: [...profile.types].sort().join(';'),
          required_in_scope:
            profile.seenInRecords.size === metadata.recordCount ? 'yes' : 'no',
          nullable: profile.nullCount > 0 ? 'yes' : 'no',
          repeatable: profile.path.includes('[]') ? 'yes' : 'no',
          record_presence_count: profile.seenInRecords.size,
          record_count: metadata.recordCount,
          value_count: profile.valueCount,
          example_json: profile.examples[0] ?? '',
          linked_data_term: linkedDataTerm(
            profile.path,
            contexts,
            isGeoJson,
          ),
          information_dimensions: dimensions(profile.path),
          current_editability: metadata.editability,
          linked_art_candidate: LINKED_ART_PATTERNS[leaf] ?? '',
        };
      }),
  };
}

function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const entry of readdirSync(OUTPUT_DIR, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.csv')) {
      rmSync(join(OUTPUT_DIR, entry.name));
    }
  }

  const tables = walkJsonFiles(DATA_DIR)
    .sort()
    .map(inspectTable);
  const dictionaryColumns = [
    'table_id',
    'source_file',
    'record_scope',
    'field_path',
    'column_title',
    'description',
    'description_status',
    'json_types',
    'required_in_scope',
    'nullable',
    'repeatable',
    'record_presence_count',
    'record_count',
    'value_count',
    'example_json',
    'linked_data_term',
    'information_dimensions',
    'current_editability',
    'linked_art_candidate',
  ];

  for (const table of tables) {
    writeFileSync(
      join(OUTPUT_DIR, `${table.metadata.tableId}.csv`),
      csv(table.rows, dictionaryColumns),
    );
  }

  const tableRows = tables.map(({ metadata, rows }) => {
    const hasDimension = (dimension: string) =>
      rows.some((row) =>
        String(row.information_dimensions).split(';').includes(dimension),
      )
        ? 'yes'
        : 'no';
    const hasPath = (paths: string[]) =>
      rows.some((row) => {
        const leaf = leafName(String(row.field_path)).toLowerCase();
        return paths.includes(leaf);
      })
        ? 'yes'
        : 'no';
    return {
      table_id: metadata.tableId,
      source_file: metadata.sourceFile,
      record_scope: metadata.recordScope,
      record_count: metadata.recordCount,
      field_count: rows.length,
      role: metadata.role,
      current_editability: metadata.editability,
      has_space_fields: hasDimension('space'),
      has_time_fields: hasDimension('time'),
      has_source_fields: hasDimension('source'),
      has_edit_provenance: hasPath([
        'modifiedby',
        'modifiedat',
        'deprecatedby',
        'deprecatedat',
        'reviewstatus',
      ]),
      has_dataset_release_version: hasPath([
        'datasetpersistentid',
        'datasetversion',
        'releaseversion',
        'filepersistentid',
        'checksum',
        'checksumvalue',
      ]),
      dictionary_file: `docs/data-dictionary/${metadata.tableId}.csv`,
    };
  });
  writeFileSync(
    join(OUTPUT_DIR, 'tables.csv'),
    csv(tableRows, [
      'table_id',
      'source_file',
      'record_scope',
      'record_count',
      'field_count',
      'role',
      'current_editability',
      'has_space_fields',
      'has_time_fields',
      'has_source_fields',
      'has_edit_provenance',
      'has_dataset_release_version',
      'dictionary_file',
    ]),
  );

  const generatedFields = tables.reduce(
    (sum, table) =>
      sum +
      table.rows.filter(
        (row) => row.description_status === 'generated-needs-review',
      ).length,
    0,
  );
  console.log(
    `Exported ${tables.length} table dictionaries with ${tables.reduce(
      (sum, table) => sum + table.rows.length,
      0,
    )} field paths (${generatedFields} descriptions still need curation).`,
  );
}

main();
