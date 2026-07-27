/**
 * Generate public authority-record representations from the editorial gazetteer.
 *
 * The Gazetteer remains an editorial input. This script produces a compact
 * JSON-LD record graph and a separate application JSON projection for every
 * public place record.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import type { AlmanakkenPlantationObservation } from '../lib/types';
import {
  derivePlaceFunctionAssertions,
  placeFunctionLabels,
  PLACE_FUNCTION_SCHEME_URI,
  relatedPlaceType,
} from '../lib/place-functions';
import { derivePlantationCompositionPeriods } from '../lib/plantation-compositions';
import {
  type PhysicalLinkReviewFields,
  resolveConfirmedPhysicalLinkReviews,
} from '../lib/physical-organization-links';

import { BASE, buildPlaceRecordContext } from './lod-context';

const DATA_DIR = join(__dirname, '../../data');
const OUT_DIR = join(__dirname, '../public/data/place-records');
const GAZETTEER_PATH = join(DATA_DIR, 'places-gazetteer.jsonld');
const ORGANIZATION_OVERRIDES_PATH = join(
  DATA_DIR,
  'organization-authority-overrides.jsonld',
);
const THESAURUS_PATH = join(DATA_DIR, 'place-types-thesaurus.jsonld');
const SOURCES_PATH = join(DATA_DIR, 'sources-registry.jsonld');

type JsonObject = Record<string, unknown>;

type PlaceName = {
  text?: string;
  language?: string;
  type?: string;
  isPreferred?: boolean;
  source?: string;
  sourceYear?: number;
};

type ExternalLink = {
  authority?: string;
  identifier?: string;
  matchType?: string;
};

type Assertion = {
  id?: string;
  status?: string;
  value?: string;
  districtId?: string | null;
  districtLabel?: string | null;
  standardized?: string | null;
  original?: string | null;
  source?: string;
  sourceYear?: number;
  startYear?: number;
  endYear?: number;
  certainty?: string;
  note?: string | null;
  sourceRow?: string;
};

type DiklandRef = {
  folderPath?: string;
  driveUrl?: string;
  author?: string | null;
  year?: string | null;
  notes?: string | null;
};

type GazetteerEntry = JsonObject & {
  id?: string;
  type?: string;
  names?: PlaceName[];
  sranantongoNames?: string[];
  prefLabel?: string;
  altLabels?: string[];
  broader?: string | null;
  description?: string;
  location?: {
    lat?: number | null;
    lng?: number | null;
    wkt?: string | null;
  };
  sources?: string[];
  externalLinks?: ExternalLink[];
  fid?: number | null;
  locationDescription?: string | null;
  locationDescriptionOriginal?: string | null;
  statusAssertions?: Assertion[];
  productAssertions?: Assertion[];
  districtAssertions?: Assertion[];
  locationAssertions?: Assertion[];
  almanakkenObservations?: AlmanakkenPlantationObservation[];
  locationPoint?: boolean;
  diklandRefs?: DiklandRef[];
  deprecated?: boolean;
  mergedInto?: string;
};

function readGraph(path: string): JsonObject[] {
  const document = JSON.parse(readFileSync(path, 'utf-8')) as JsonObject;
  return Array.isArray(document['@graph'])
    ? (document['@graph'] as JsonObject[])
    : [];
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function fragmentUri(pageUri: string, fragment: string): string {
  const safeFragment = fragment
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${pageUri}#${safeFragment}`;
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  return value == null ? [] : Array.isArray(value) ? value : [value];
}

function sourceUri(sourceId: string, sourceIds: Map<string, string>): string {
  return sourceIds.get(sourceId) ?? `${BASE}source/${sourceId}`;
}

function namesFor(entry: GazetteerEntry): PlaceName[] {
  const names: PlaceName[] = Array.isArray(entry.names) ? [...entry.names] : [];
  if (names.length === 0 && entry.prefLabel) {
    names.push({
      text: entry.prefLabel,
      language: 'nl',
      type: 'official',
      isPreferred: true,
    });
  }

  for (const text of entry.altLabels ?? []) {
    if (!text) continue;
    const exists = names.some(
      (name) =>
        (name.text ?? '').toLowerCase().trim() === text.toLowerCase().trim(),
    );
    if (!exists) {
      names.push({
        text,
        language: 'und',
        type: 'historical',
        isPreferred: false,
      });
    }
  }

  for (const text of entry.sranantongoNames ?? []) {
    if (!text) continue;
    const exists = names.some(
      (name) =>
        (name.text ?? '').toLowerCase().trim() === text.toLowerCase().trim(),
    );
    if (!exists) {
      names.push({
        text,
        language: 'srn',
        type: 'vernacular',
        isPreferred: false,
      });
    }
  }

  return names;
}

function preferredName(names: PlaceName[]): string {
  return names.find((name) => name.isPreferred)?.text ?? names[0]?.text ?? '';
}

function crmClass(value: unknown): string {
  const type = typeof value === 'string' ? value : 'E53_Place';
  return type.replace('E25_Human-Made_Feature', 'E25_Human_Made_Feature');
}

function isPhysicalFeature(type: string): boolean {
  return type.includes('E25') || type.includes('E26');
}

function timeSpan(id: string, startYear?: number, endYear?: number): JsonObject | null {
  if (startYear == null && endYear == null) return null;
  const firstYear = startYear ?? endYear!;
  const lastYear = endYear ?? startYear!;
  const entity: JsonObject = {
    '@id': id,
    '@type': ['crm:E52_Time-Span'],
    'rdfs:label':
      lastYear !== firstYear ? `${firstYear}–${lastYear}` : String(firstYear),
    P82a_begin_of_the_begin: String(firstYear),
    P82b_end_of_the_end: String(lastYear),
  };
  return entity;
}

function geometrySlug(wkt: string): string {
  const type = wkt.trim().split(/\s+/, 1)[0]?.toLowerCase();
  if (type === 'point' || type === 'multipoint') return 'point';
  if (type === 'linestring' || type === 'multilinestring') return 'line';
  if (type === 'polygon' || type === 'multipolygon') return 'polygon';
  return 'geometry';
}

function wikidataUri(identifier: string): string {
  return `http://www.wikidata.org/entity/${identifier}`;
}

function organizationUri(identifier: string): string {
  return `${BASE}organization/${identifier}`;
}

function externalLinkUri(link: ExternalLink): string | null {
  if (!link.identifier) return null;
  if (link.authority === 'wikidata') return wikidataUri(link.identifier);
  return /^https?:\/\//.test(link.identifier) ? link.identifier : null;
}

function appendLink(entity: JsonObject, property: string, uri: string) {
  const current = entity[property];
  entity[property] = current == null ? uri : [...asArray(current as string | string[]), uri];
}

function statusType(status: string): string {
  const normalized =
    status === 'built'
      ? 'cultivation-attested'
      : status === 'reactivated'
        ? 'cultivation-re-attested'
        : status === 'present'
          ? 'presence-attested'
          : status === 'abandoned'
            ? 'abandonment-reported'
            : status;
  return `${BASE}type/operational-status/${normalized}`;
}

function statusCertainty(status: string): string {
  return status === 'built' || status === 'reactivated'
    ? `${BASE}type/certainty/probable`
    : `${BASE}type/certainty/certain`;
}

export function generatePlaceRecords() {
  const gazetteer = readGraph(GAZETTEER_PATH) as GazetteerEntry[];
  const organizationOverrides = new Map(
    (
      (existsSync(ORGANIZATION_OVERRIDES_PATH)
        ? readGraph(ORGANIZATION_OVERRIDES_PATH)
        : []) as Array<PhysicalLinkReviewFields & { qid?: string }>
    )
      .filter((entry) => typeof entry.qid === 'string')
      .map((entry) => [entry.qid!, entry]),
  );
  const plantationCandidatesByQid = new Map<string, GazetteerEntry[]>();
  for (const entry of gazetteer) {
    if (!entry.id || entry.deprecated || entry.mergedInto) continue;
    const qid =
      entry.type === 'plantation'
        ? entry.externalLinks?.find(
            (link) =>
              link.authority === 'wikidata' &&
              typeof link.identifier === 'string' &&
              /^Q\d+$/.test(link.identifier),
          )?.identifier
        : undefined;
    if (!qid) continue;
    plantationCandidatesByQid.set(qid, [
      ...(plantationCandidatesByQid.get(qid) ?? []),
      entry,
    ]);
  }
  const confirmedPhysicalLinks = resolveConfirmedPhysicalLinkReviews(
    organizationOverrides,
    new Map(
      [...plantationCandidatesByQid.entries()].map(([qid, entries]) => [
        qid,
        entries.map((entry) => ({ id: entry.id!, fid: entry.fid })),
      ]),
    ),
  );
  const thesaurus = readGraph(THESAURUS_PATH);
  const sources = readGraph(SOURCES_PATH);
  const crmByPlaceType = new Map(
    thesaurus
      .filter((entry) => typeof entry.typeId === 'string')
      .map((entry) => [entry.typeId as string, crmClass(entry.crmClass)]),
  );
  const sourceIds = new Map(
    sources
      .filter(
        (entry) =>
          typeof entry.sourceId === 'string' && typeof entry['@id'] === 'string',
      )
      .map((entry) => [entry.sourceId as string, entry['@id'] as string]),
  );
  mkdirSync(OUT_DIR, { recursive: true });
  if (existsSync(OUT_DIR)) {
    for (const fileName of readdirSync(OUT_DIR)) {
      if (/\.json(?:ld)?$/.test(fileName)) {
        unlinkSync(join(OUT_DIR, fileName));
      }
    }
  }
  const index: JsonObject[] = [];
  let records = 0;

  for (const entry of gazetteer) {
    if (!entry.id || entry.deprecated || entry.mergedInto) continue;

    const pageUri = `${BASE}place/${entry.id}`;
    const recordUri = fragmentUri(pageUri, 'record');
    const placeClass = crmByPlaceType.get(entry.type ?? '') ?? 'E53_Place';
    const featureUri = fragmentUri(pageUri, 'feature');
    const locationUri = fragmentUri(pageUri, 'location');
    const hasFeature = isPhysicalFeature(placeClass);
    const structuralTypeUri = `${BASE}vocabulary/place-type/${entry.type}`;
    const targetUri = hasFeature ? featureUri : locationUri;
    const names = namesFor(entry);
    const label = preferredName(names);
    const graph: JsonObject[] = [];
    const organizationNodes = new Map<string, JsonObject>();
    const ensureOrganization = (
      qid: string,
      organizationLabel?: string,
      physicalPlantationUri?: string,
      associationStatus:
        | 'linked'
        | 'needs-physical-link-review' = 'linked',
    ): string => {
      const uri = organizationUri(qid);
      let organization = organizationNodes.get(qid);
      if (!organization) {
        organization = {
          '@id': uri,
          '@type': ['crm:E74_Group'],
          'rdfs:label': organizationLabel || qid,
          'skos:exactMatch': wikidataUri(qid),
          organizationAssociationStatus: 'needs-physical-plantation-link',
        };
        organizationNodes.set(qid, organization);
        graph.push(organization);
      } else if (
        organizationLabel &&
        organization['rdfs:label'] === qid
      ) {
        organization['rdfs:label'] = organizationLabel;
      }
      if (physicalPlantationUri) {
        organization.associatedPhysicalPlantation = physicalPlantationUri;
        organization.organizationAssociationStatus = associationStatus;
      }
      return uri;
    };
    const productTypeUris = new Set<string>();
    const functionTypeUris = new Set<string>();
    const functionAssertions =
      entry.type === 'plantation'
        ? derivePlaceFunctionAssertions(entry)
        : [];
    const referencedSourceIds = new Set<string>(entry.sources ?? []);
    for (const name of names) if (name.source) referencedSourceIds.add(name.source);
    for (const assertion of [
      ...asArray(entry.districtAssertions),
      ...asArray(entry.locationAssertions),
      ...asArray(entry.statusAssertions),
      ...asArray(entry.productAssertions),
    ]) {
      if (assertion.source) referencedSourceIds.add(assertion.source);
    }
    for (const assertion of functionAssertions) {
      referencedSourceIds.add(assertion.source);
    }
    const sourceUris = [...referencedSourceIds].map((id) => sourceUri(id, sourceIds));

    const record: JsonObject = {
      '@id': recordUri,
      '@type': ['stm:AuthorityRecord', 'crm:E31_Document'],
      'dcterms:identifier': entry.id,
      'rdfs:label': label,
      describes: hasFeature ? [featureUri, locationUri] : [locationUri],
      'prov:wasDerivedFrom': [...sourceUris],
    };
    graph.push(record);

    if (hasFeature) {
      const plantationQid =
        entry.type === 'plantation'
          ? entry.externalLinks?.find(
              (link) =>
                link.authority === 'wikidata' &&
                typeof link.identifier === 'string' &&
                /^Q\d+$/.test(link.identifier),
            )?.identifier
          : undefined;
      const feature: JsonObject = {
        '@id': featureUri,
        '@type': [`crm:${placeClass}`],
        'rdfs:label': label,
        P2_has_type: structuralTypeUri,
        P53_has_location: locationUri,
        'prov:wasDerivedFrom': [...sourceUris],
      };
      if (plantationQid) {
        const confirmedReview = confirmedPhysicalLinks.get(plantationQid);
        const associationStatus =
          confirmedReview && entry.id
            ? confirmedReview.associatedPlaceIds.has(entry.id)
              ? 'linked'
              : 'needs-organization-link'
            : (plantationCandidatesByQid.get(plantationQid)?.length ?? 0) > 1
              ? 'needs-physical-link-review'
              : 'linked';
        if (associationStatus !== 'needs-organization-link') {
          feature.hasOrganizationalAssociation = ensureOrganization(
            plantationQid,
            label,
            featureUri,
            associationStatus,
          );
        }
        feature.organizationAssociationStatus = associationStatus;
      } else if (entry.type === 'plantation') {
        feature.organizationAssociationStatus = 'needs-organization-link';
      }
      for (const link of entry.externalLinks ?? []) {
        const uri = externalLinkUri(link);
        if (!uri) continue;
        if (link.matchType === 'exactMatch') {
          appendLink(feature, 'skos:exactMatch', uri);
        } else if (link.matchType === 'closeMatch') {
          appendLink(feature, 'skos:closeMatch', uri);
        } else if (link.matchType === 'broadMatch') {
          appendLink(feature, 'skos:broadMatch', uri);
        } else if (link.matchType === 'narrowMatch') {
          appendLink(feature, 'skos:narrowMatch', uri);
        } else if (link.matchType === 'relatedMatch') {
          appendLink(feature, 'skos:relatedMatch', uri);
        }
      }
      graph.push(feature);
    }

    const location: JsonObject = {
      '@id': locationUri,
      '@type': [
        'crm:E53_Place',
        ...(entry.locationPoint ? ['geo:Feature'] : []),
      ],
      'rdfs:label': entry.locationDescription ?? label,
      ...(!hasFeature ? { P2_has_type: structuralTypeUri } : {}),
      'prov:wasDerivedFrom': [...sourceUris],
    };
    if (entry.broader) {
      location.P89_falls_within = fragmentUri(
        `${BASE}place/${entry.broader}`,
        'location',
      );
    }
    const locationObservations = asArray(entry.locationAssertions);
    const notes = (locationObservations.length > 0
      ? locationObservations.flatMap((assertion) => [
          assertion.standardized,
          assertion.original,
        ])
      : [entry.locationDescription, entry.locationDescriptionOriginal]
    ).filter(
      (note): note is string => Boolean(note),
    );
    if (notes.length > 0) location.P3_has_note = notes;
    if (entry.location?.wkt) {
      const geometryUri = fragmentUri(
        pageUri,
        `geometry-${geometrySlug(entry.location.wkt)}`,
      );
      location['geo:hasGeometry'] = geometryUri;
      graph.push({
        '@id': geometryUri,
        '@type': ['geo:Geometry'],
        'geo:asWKT': {
          '@value': `<http://www.opengis.net/def/crs/OGC/1.3/CRS84> ${entry.location.wkt}`,
          '@type': 'geo:wktLiteral',
        },
      });
    }
    if (entry.location?.lat != null && entry.location.lng != null) {
      const centroidUri = fragmentUri(pageUri, 'geometry-centroid');
      location['geo:hasCentroid'] = centroidUri;
      graph.push({
        '@id': centroidUri,
        '@type': ['geo:Geometry'],
        'geo:asWKT': {
          '@value': `<http://www.opengis.net/def/crs/OGC/1.3/CRS84> POINT (${entry.location.lng} ${entry.location.lat})`,
          '@type': 'geo:wktLiteral',
        },
      });
    }
    if (entry.fid != null) {
      const identifierUri = fragmentUri(pageUri, 'identifier-qgis-fid');
      location.P48_has_preferred_identifier = identifierUri;
      graph.push({
        '@id': identifierUri,
        '@type': ['crm:E42_Identifier'],
        P190_has_symbolic_content: String(entry.fid),
        P2_has_type: `${BASE}type/identifier-type/qgis-fid`,
      });
    }
    graph.push(location);

    const nameUris: string[] = [];
    names.forEach((name, position) => {
      if (!name.text) return;
      const nameUri = fragmentUri(pageUri, `name-${position + 1}`);
      nameUris.push(nameUri);
      graph.push({
        '@id': nameUri,
        '@type': ['crm:E41_Appellation'],
        P190_has_symbolic_content: {
          '@value': name.text,
          '@language': name.language || 'und',
        },
        P2_has_type: `${BASE}type/name-type/${name.type || 'historical'}`,
        P72_has_language: `${BASE}type/language/${name.language || 'und'}`,
        P1i_identifies: targetUri,
        ...(name.source
          ? { P128i_is_carried_by: sourceUri(name.source, sourceIds) }
          : {}),
      });
    });
    if (nameUris.length > 0) {
      const subject = graph.find((entity) => entity['@id'] === targetUri);
      if (subject) subject.P1_is_identified_by = nameUris;
    }

    const evidenceUris: string[] = [];
    const statusUris: string[] = [];
    for (const assertion of asArray(entry.districtAssertions)) {
      if (!assertion.id || !assertion.districtId) continue;
      const assertionUri = fragmentUri(pageUri, `assertion-${assertion.id}`);
      const spanUri = fragmentUri(pageUri, `assertion-${assertion.id}-time-span`);
      const span = timeSpan(
        spanUri,
        assertion.sourceYear ?? assertion.startYear,
        assertion.endYear,
      );
      if (span) graph.push(span);
      graph.push({
        '@id': assertionUri,
        '@type': ['crm:E13_Attribute_Assignment'],
        P140_assigned_attribute_to: targetUri,
        P141_assigned: fragmentUri(
          `${BASE}place/${assertion.districtId}`,
          'location',
        ),
        P2_has_type: `${BASE}type/relationship/district-membership`,
        ...(span ? { P4_has_time_span: spanUri } : {}),
        ...(assertion.source
          ? { 'prov:hadPrimarySource': sourceUri(assertion.source, sourceIds) }
          : {}),
        certainty: `${BASE}type/certainty/${assertion.certainty ?? 'certain'}`,
        ...(assertion.note ? { P3_has_note: assertion.note } : {}),
      });
      evidenceUris.push(assertionUri);
    }

    for (const assertion of locationObservations) {
      if (!assertion.id || (!assertion.standardized && !assertion.original)) continue;
      const assertionUri = fragmentUri(pageUri, `assertion-${assertion.id}`);
      const spanUri = fragmentUri(pageUri, `assertion-${assertion.id}-time-span`);
      const span = timeSpan(spanUri, assertion.startYear, assertion.endYear);
      if (span) graph.push(span);
      graph.push({
        '@id': assertionUri,
        '@type': ['crm:E13_Attribute_Assignment'],
        P140_assigned_attribute_to: locationUri,
        ...(entry.type === 'historical-address' && nameUris[0]
          ? { P141_assigned: nameUris[0] }
          : {}),
        P2_has_type:
          entry.type === 'historical-address'
            ? `${BASE}type/relationship/address-observation`
            : `${BASE}type/relationship/location-description`,
        ...(span ? { P4_has_time_span: spanUri } : {}),
        ...(assertion.source
          ? { 'prov:hadPrimarySource': sourceUri(assertion.source, sourceIds) }
          : {}),
        ...(assertion.standardized ? { standardizedContent: assertion.standardized } : {}),
        ...(assertion.original ? { sourceContent: assertion.original } : {}),
        ...(assertion.sourceRow ? { sourceRow: assertion.sourceRow } : {}),
        ...(assertion.note ? { P3_has_note: assertion.note } : {}),
      });
      evidenceUris.push(assertionUri);
    }

    for (const assertion of entry.statusAssertions ?? []) {
      if (!assertion.id || !assertion.status) continue;
      const assertionUri = fragmentUri(pageUri, `assertion-${assertion.id}`);
      const spanUri = fragmentUri(pageUri, `assertion-${assertion.id}-time-span`);
      const span = timeSpan(spanUri, assertion.startYear, assertion.endYear);
      if (span) graph.push(span);
      graph.push({
        '@id': assertionUri,
        '@type': ['crm:E17_Type_Assignment'],
        P41_classified: targetUri,
        P42_assigned: statusType(assertion.status),
        ...(span ? { P4_has_time_span: spanUri } : {}),
        ...(assertion.source
          ? { 'prov:hadPrimarySource': sourceUri(assertion.source, sourceIds) }
          : {}),
        certainty: statusCertainty(assertion.status),
        ...(assertion.note ? { P3_has_note: assertion.note } : {}),
      });
      evidenceUris.push(assertionUri);
      statusUris.push(assertionUri);
    }
    if (statusUris.length > 0) record.hasOperationalSummary = statusUris;

    const functionAssignmentUris: string[] = [];
    for (const assertion of functionAssertions) {
      const assertionUri = fragmentUri(pageUri, `assertion-${assertion.id}`);
      const spanUri = fragmentUri(pageUri, `assertion-${assertion.id}-time-span`);
      const span = timeSpan(spanUri, assertion.startYear, assertion.endYear);
      if (span) graph.push(span);
      graph.push({
        '@id': assertionUri,
        '@type': ['crm:E17_Type_Assignment'],
        P41_classified: targetUri,
        P42_assigned: assertion.functionUri,
        ...(span ? { P4_has_time_span: spanUri } : {}),
        ...(assertion.source
          ? { 'prov:hadPrimarySource': sourceUri(assertion.source, sourceIds) }
          : {}),
        ...(assertion.sourceRows.length > 0
          ? {
              'prov:wasDerivedFrom': assertion.sourceRows.map((recordId) =>
                fragmentUri(
                  pageUri,
                  `observation-almanakken-${recordId}`,
                ),
              ),
            }
          : {}),
        certainty: `${BASE}type/certainty/${assertion.certainty}`,
        ...(assertion.source === 'almanakken'
          ? {
              inferenceRule: `${BASE}rule/place-function-from-organization-observation`,
            }
          : {}),
        ...(assertion.note ? { P3_has_note: assertion.note } : {}),
      });
      if (!functionTypeUris.has(assertion.functionUri)) {
        functionTypeUris.add(assertion.functionUri);
        const labels = placeFunctionLabels(
          assertion.functionId,
          assertion.sourceLabel,
        );
        const placeType = relatedPlaceType(assertion.functionId);
        graph.push({
          '@id': assertion.functionUri,
          '@type': ['skos:Concept', 'crm:E55_Type'],
          'skos:prefLabel': [
            { '@value': labels.nl, '@language': 'nl' },
            { '@value': labels.en, '@language': 'en' },
          ],
          'skos:altLabel': [assertion.sourceLabel],
          'skos:inScheme': { '@id': PLACE_FUNCTION_SCHEME_URI },
          ...(placeType
            ? { 'skos:related': { '@id': placeType.uri } }
            : {}),
        });
      }
      evidenceUris.push(assertionUri);
      functionAssignmentUris.push(assertionUri);
    }
    if (functionAssignmentUris.length > 0) {
      record.hasFunctionSummary = functionAssignmentUris;
      const subject = graph.find((entity) => entity['@id'] === targetUri);
      if (subject) subject.hasFunctionAssignment = functionAssignmentUris;
    }
    // Preserve saved Almanakken v2 rows as source-bound observations.
    // These rows are evidence for review; curated claims remain the assertions above.
    const almanakkenObservations = asArray(entry.almanakkenObservations);
    for (const evidence of almanakkenObservations) {
      const evidenceUri = fragmentUri(
        pageUri,
        `observation-almanakken-${evidence.recordId}`,
      );
      const spanUri = fragmentUri(
        pageUri,
        `observation-almanakken-${evidence.recordId}-time-span`,
      );
      if (evidence.year) graph.push(timeSpan(spanUri, evidence.year)!);
      const evidenceOrganizationUri = ensureOrganization(
        evidence.qid,
        evidence.plantationStandardized || evidence.plantationOriginal,
        undefined,
      );
      const observation: JsonObject = {
        '@id': evidenceUri,
        '@type': ['crm:E13_Attribute_Assignment'],
        P140_assigned_attribute_to: evidenceOrganizationUri,
        ...(evidence.year ? { P4_has_time_span: spanUri } : {}),
        'prov:hadPrimarySource': sourceUri('almanakken', sourceIds),
        sourceRow: evidence.recordId,
        sourceVersion: evidence.sourceVersion,
        sourcePlantationQid: evidence.qid,
        ...(evidence.plantationOriginal ? { P3_has_note: evidence.plantationOriginal } : {}),
        ...(evidence.page ? { pageReference: evidence.page } : {}),
        ...(evidence.littera ? { littera: evidence.littera } : {}),
        ...(evidence.districtOrDivision
          ? { districtOrDivision: evidence.districtOrDivision }
          : {}),
        ...(evidence.locationOriginal
          ? { sourceContent: evidence.locationOriginal }
          : {}),
        ...(evidence.locationStandardized
          ? { standardizedContent: evidence.locationStandardized }
          : {}),
        ...(evidence.riverOrRoad ? { riverOrRoad: evidence.riverOrRoad } : {}),
        ...(evidence.direction ? { direction: evidence.direction } : {}),
        ...(evidence.plantationStandardized
          ? { standardizedName: evidence.plantationStandardized }
          : {}),
        ...(evidence.psurIds?.length ? { psurIds: evidence.psurIds } : {}),
        ...(evidence.hasParts?.length
          ? {
              reportedComponentOrganization: evidence.hasParts.map((part) =>
                ensureOrganization(part.qid, part.label),
              ),
              reportedComponentOrganizationLabel: evidence.hasParts
                .map((part) => part.label)
                .filter(Boolean),
            }
          : {}),
        ...(evidence.partOf?.length
          ? {
              reportedCompositeOrganization: evidence.partOf.map((part) =>
                ensureOrganization(part.qid, part.label),
              ),
              reportedCompositeOrganizationLabel: evidence.partOf
                .map((part) => part.label)
                .filter(Boolean),
            }
          : {}),
        ...(evidence.referenceOriginal
          ? { referenceOriginal: evidence.referenceOriginal }
          : {}),
        ...(evidence.ownedBy?.length
          ? {
              reportedOwnerOrganization: evidence.ownedBy.map((owner) =>
                ensureOrganization(owner.qid, owner.label),
              ),
              reportedOwnerOrganizationLabel: evidence.ownedBy
                .map((owner) => owner.label)
                .filter(Boolean),
            }
          : {}),
        ...(evidence.sizeAkkers != null ? { sizeAkkers: evidence.sizeAkkers } : {}),
        ...(evidence.function ? { function: evidence.function } : {}),
        ...(evidence.additionalInfo ? { additionalInfo: evidence.additionalInfo } : {}),
        ...(evidence.lot ? { lot: evidence.lot } : {}),
        ...(evidence.sranantongoName
          ? { sranantongoName: evidence.sranantongoName }
          : {}),
        ...(evidence.population ? { population: evidence.population } : {}),
        ...(evidence.mill ? { mill: evidence.mill } : {}),
        ...(evidence.rawManagement ? { rawManagement: evidence.rawManagement } : {}),
        ...(evidence.deserted
          ? {
              reportedOperationalStatus:
                `${BASE}type/operational-status/abandonment-reported`,
            }
          : {}),
      };
      if (evidence.product) {
        const productTypeUri = `${BASE}type/product/${slug(evidence.product)}`;
        observation.P141_assigned = productTypeUri;
        if (!productTypeUris.has(productTypeUri)) {
          productTypeUris.add(productTypeUri);
          graph.push({
            '@id': productTypeUri,
            '@type': ['crm:E99_Product_Type'],
            'rdfs:label': evidence.product,
          });
        }
      }
      graph.push(observation);
      if (!evidenceUris.includes(evidenceUri)) evidenceUris.push(evidenceUri);
    }
    const compositionPeriods = derivePlantationCompositionPeriods(
      almanakkenObservations.map((evidence) => ({
        observationUri: fragmentUri(
          pageUri,
          `observation-almanakken-${evidence.recordId}`,
        ),
        compositeOrganizationUri: ensureOrganization(
          evidence.qid,
          evidence.plantationStandardized || evidence.plantationOriginal,
        ),
        componentOrganizationUris: (evidence.hasParts ?? []).map((part) =>
          ensureOrganization(part.qid, part.label),
        ),
        year: evidence.year ?? Number.NaN,
        sourceUri: evidence.year
          ? sourceUri('almanakken', sourceIds)
          : undefined,
      })),
    );
    for (const period of compositionPeriods) {
      const compositionId = period.id.split('/').pop();
      const spanUri = `${BASE}timespan/${compositionId}`;
      graph.push({
        '@id': spanUri,
        '@type': ['crm:E52_Time-Span'],
        prefLabel:
          period.startYear === period.endYear
            ? String(period.startYear)
            : `${period.startYear}-${period.endYear}`,
        P82a_begin_of_the_begin: `${period.startYear}-01-01`,
        P82b_end_of_the_end: `${period.endYear}-12-31`,
      });
      graph.push({
        '@id': period.id,
        '@type': [
          'crm:E13_Attribute_Assignment',
          'stm:PlantationCompositionPeriod',
        ],
        P140_assigned_attribute_to: period.compositeOrganizationUri,
        reportedComponentOrganization: period.componentOrganizationUris,
        P4_has_time_span: spanUri,
        firstAttestedYear: period.startYear,
        lastAttestedYear: period.endYear,
        observationYears: period.observationYears,
        'prov:hadPrimarySource': period.sourceUris,
        'prov:wasDerivedFrom': period.evidenceUris,
        certainty: `${BASE}type/certainty/probable`,
        inferenceRule: `${BASE}rule/consecutive-source-reported-plantation-composition`,
      });
      evidenceUris.push(period.id);
    }
    if (evidenceUris.length > 0) record.hasEvidence = evidenceUris;
    for (const [position, ref] of (entry.diklandRefs ?? []).entries()) {
      if (!ref.folderPath && !ref.driveUrl) continue;
      const sourceUriValue = fragmentUri(pageUri, `source-dikland-${position + 1}`);
      graph.push({
        '@id': sourceUriValue,
        '@type': ['crm:E22_Human-Made_Object', 'crm:E31_Document'],
        P46i_forms_part_of: `${BASE}source/dikland-collection`,
        'rdfs:label': ref.folderPath ?? `Dikland reference ${position + 1}`,
        sourcePath: ref.folderPath,
        sourceUrl: ref.driveUrl,
        ...(ref.author ? { 'dcterms:creator': ref.author } : {}),
        ...(ref.year ? { 'dcterms:date': ref.year } : {}),
        ...(ref.notes ? { P3_has_note: ref.notes } : {}),
        'prov:wasDerivedFrom': `${BASE}source/dikland-collection`,
      });
      sourceUris.push(sourceUriValue);
    }
    record['prov:wasDerivedFrom'] = [...sourceUris];

    const document: JsonObject = {
      '@context': buildPlaceRecordContext(),
      '@id': pageUri,
      '@type': ['stm:AuthorityRecord'],
      '@graph': graph,
    };
    const graphIds = new Set<string>();
    for (const entity of graph) {
      const entityId = entity['@id'];
      if (typeof entityId !== 'string' || !entityId.startsWith(BASE)) {
        throw new Error(`Record ${entry.id} has a non-canonical entity id`);
      }
      if (graphIds.has(entityId)) {
        throw new Error(`Record ${entry.id} has duplicate entity id ${entityId}`);
      }
      graphIds.add(entityId);
    }
    const projection = {
      id: entry.id,
      label,
      type: entry.type,
      recordUrl: `/place/${entry.id}`,
      jsonldUrl: `/place/${entry.id}.jsonld`,
      jsonUrl: `/place/${entry.id}.json`,
      feature: hasFeature ? { id: featureUri, crmClass: placeClass } : null,
      location: {
        id: locationUri,
        lat: entry.location?.lat ?? null,
        lng: entry.location?.lng ?? null,
        wkt: entry.location?.wkt ?? null,
      },
      names,
      sources: asArray(entry.sources),
      statusAssertions: asArray(entry.statusAssertions),
      productAssertions: asArray(entry.productAssertions),
      functionAssertions,
      districtAssertions: asArray(entry.districtAssertions),
      locationAssertions: asArray(entry.locationAssertions),
      almanakkenObservations,
      diklandRefs: asArray(entry.diklandRefs),
    };
    writeFileSync(join(OUT_DIR, `${entry.id}.jsonld`), `${JSON.stringify(document, null, 2)}\n`);
    writeFileSync(join(OUT_DIR, `${entry.id}.json`), `${JSON.stringify(projection, null, 2)}\n`);
    index.push({ id: entry.id, label, type: entry.type, recordUri: pageUri });
    records++;
  }

  writeFileSync(join(OUT_DIR, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  console.log(`Generated ${records} public authority records in ${OUT_DIR}`);
}

if (require.main === module) generatePlaceRecords();
