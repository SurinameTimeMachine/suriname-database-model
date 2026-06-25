/**
 * Generate public authority-record representations from the editorial gazetteer.
 *
 * The Gazetteer remains an editorial input. This script produces a compact
 * JSON-LD record graph and a separate application JSON projection for every
 * public place record.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'csv-parse/sync';

import { BASE, buildPlaceRecordContext } from './lod-context';

const DATA_DIR = join(__dirname, '../../data');
const OUT_DIR = join(__dirname, '../public/data/place-records');
const GAZETTEER_PATH = join(DATA_DIR, 'places-gazetteer.jsonld');
const THESAURUS_PATH = join(DATA_DIR, 'place-types-thesaurus.jsonld');
const SOURCES_PATH = join(DATA_DIR, 'sources-registry.jsonld');
const ALMANAKKEN_PATH = join(
  DATA_DIR,
  '06-almanakken - Plantations Surinaamse Almanakken',
  'Plantations Surinaamse Almanakken v1.0.csv',
);

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

type AlmanakkenEvidence = {
  recordId: string;
  qid: string;
  year: number | undefined;
  product: string;
  deserted: boolean;
  sourceName: string;
  sourcePage: string;
};

type GazetteerEntry = JsonObject & {
  id?: string;
  type?: string;
  names?: PlaceName[];
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

function asArray<T>(value: T | T[] | undefined | null): T[] {
  return value == null ? [] : Array.isArray(value) ? value : [value];
}

function sourceUri(sourceId: string, sourceIds: Map<string, string>): string {
  return sourceIds.get(sourceId) ?? `${BASE}source/${sourceId}`;
}

function namesFor(entry: GazetteerEntry): PlaceName[] {
  if (Array.isArray(entry.names) && entry.names.length > 0) return entry.names;
  const names: PlaceName[] = [];
  if (entry.prefLabel) {
    names.push({
      text: entry.prefLabel,
      language: 'nl',
      type: 'official',
      isPreferred: true,
    });
  }
  for (const text of entry.altLabels ?? []) {
    names.push({ text, language: 'und', type: 'historical', isPreferred: false });
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
  if (!startYear && !endYear) return null;
  const entity: JsonObject = {
    '@id': id,
    '@type': ['crm:E52_Time-Span'],
    'rdfs:label': endYear && endYear !== startYear ? `${startYear}–${endYear}` : String(startYear ?? endYear),
  };
  if (startYear) entity.P82a_begin_of_the_begin = String(startYear);
  if (endYear) entity.P82b_end_of_the_end = String(endYear);
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

function wikidataIds(entry: GazetteerEntry): string[] {
  return (entry.externalLinks ?? [])
    .filter(
      (link): link is ExternalLink & { identifier: string } =>
        link.authority === 'wikidata' && Boolean(link.identifier),
    )
    .map((link) => link.identifier);
}

function loadAlmanakkenEvidence(): Map<string, AlmanakkenEvidence[]> {
  const csv = new TextDecoder('latin1').decode(readFileSync(ALMANAKKEN_PATH));
  const rows = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as Array<Record<string, string>>;
  const byQid = new Map<string, AlmanakkenEvidence[]>();
  for (const row of rows) {
    const qid = (row.plantation_id ?? '').trim();
    const recordId = (row.recordid ?? '').trim();
    if (!qid || !recordId) continue;
    const year = Number.parseInt((row.year ?? '').trim(), 10);
    const evidence: AlmanakkenEvidence = {
      recordId,
      qid,
      year: Number.isFinite(year) ? year : undefined,
      product: (row.product_std ?? '').trim(),
      deserted: Boolean((row.deserted ?? '').trim()),
      sourceName: (row.plantation_org ?? '').trim(),
      sourcePage: (row.page ?? '').trim(),
    };
    const list = byQid.get(qid) ?? [];
    list.push(evidence);
    byQid.set(qid, list);
  }
  return byQid;
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
  const almanakkenByQid = loadAlmanakkenEvidence();

  mkdirSync(OUT_DIR, { recursive: true });
  const index: JsonObject[] = [];
  let records = 0;

  for (const entry of gazetteer) {
    if (!entry.id || entry.deprecated || entry.mergedInto) continue;

    const recordUri = `${BASE}place/${entry.id}`;
    const placeClass = crmByPlaceType.get(entry.type ?? '') ?? 'E53_Place';
    const featureUri = `${recordUri}/feature`;
    const locationUri = `${recordUri}/location`;
    const hasFeature = isPhysicalFeature(placeClass);
    const targetUri = hasFeature ? featureUri : locationUri;
    const names = namesFor(entry);
    const label = preferredName(names);
    const graph: JsonObject[] = [];
    const productTypeUris = new Set<string>();
    const organizationUris = new Set<string>();
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
    const sourceUris = [...referencedSourceIds].map((id) => sourceUri(id, sourceIds));

    const record: JsonObject = {
      '@id': recordUri,
      '@type': ['stm:AuthorityRecord', 'crm:E31_Document'],
      'dcterms:identifier': entry.id,
      'rdfs:label': label,
      describes: hasFeature ? [featureUri, locationUri] : [locationUri],
      'prov:wasDerivedFrom': sourceUris,
    };
    graph.push(record);

    if (hasFeature) {
      const feature: JsonObject = {
        '@id': featureUri,
        '@type': [`crm:${placeClass}`],
        'rdfs:label': label,
        P2_has_type: `${BASE}type/place-type/${entry.type}`,
        P53_has_location: locationUri,
        'prov:wasDerivedFrom': sourceUris,
      };
      for (const link of entry.externalLinks ?? []) {
        if (link.authority !== 'wikidata' || !link.identifier) continue;
        if (link.matchType === 'exactMatch') {
          feature['skos:exactMatch'] = wikidataUri(link.identifier);
        } else if (link.matchType === 'closeMatch') {
          feature['skos:closeMatch'] = wikidataUri(link.identifier);
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
      'prov:wasDerivedFrom': sourceUris,
    };
    if (entry.broader) {
      location.P89_falls_within = `${BASE}place/${entry.broader}/location`;
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
      const geometryUri = `${locationUri}/geometry/${geometrySlug(entry.location.wkt)}`;
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
      const centroidUri = `${locationUri}/geometry/centroid`;
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
      const identifierUri = `${locationUri}/identifier/qgis-fid`;
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
      const nameUri = `${recordUri}/name/${position + 1}`;
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
    const organizationalAssociationUris: string[] = [];
    for (const assertion of asArray(entry.districtAssertions)) {
      if (!assertion.id || !assertion.districtId) continue;
      const assertionUri = `${recordUri}/assertion/${assertion.id}`;
      const spanUri = `${assertionUri}/time-span`;
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
        P141_assigned: `${BASE}place/${assertion.districtId}/location`,
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
      const assertionUri = `${recordUri}/assertion/${assertion.id}`;
      const spanUri = `${assertionUri}/time-span`;
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
      const assertionUri = `${recordUri}/assertion/${assertion.id}`;
      const spanUri = `${assertionUri}/time-span`;
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

    for (const assertion of entry.productAssertions ?? []) {
      if (!assertion.id || !assertion.value) continue;
      const assertionUri = `${recordUri}/assertion/${assertion.id}`;
      const spanUri = `${assertionUri}/time-span`;
      const span = timeSpan(spanUri, assertion.startYear, assertion.endYear);
      if (span) graph.push(span);
      graph.push({
        '@id': assertionUri,
        '@type': ['crm:E13_Attribute_Assignment'],
        P140_assigned_attribute_to: targetUri,
        P141_assigned: `${BASE}type/product/${slug(assertion.value)}`,
        ...(span ? { P4_has_time_span: spanUri } : {}),
        ...(assertion.source
          ? { 'prov:hadPrimarySource': sourceUri(assertion.source, sourceIds) }
          : {}),
        certainty: `${BASE}type/certainty/certain`,
        ...(assertion.note ? { P3_has_note: assertion.note } : {}),
      });
      const productTypeUri = `${BASE}type/product/${slug(assertion.value)}`;
      if (!productTypeUris.has(productTypeUri)) {
        productTypeUris.add(productTypeUri);
        graph.push({
          '@id': productTypeUri,
          '@type': ['crm:E99_Product_Type'],
          'rdfs:label': assertion.value,
        });
      }
      evidenceUris.push(assertionUri);
    }
    if (evidenceUris.length > 0) record.hasEvidence = evidenceUris;

    // Preserve every matching Almanakken row as raw, source-bound evidence.
    // These observations do not make an unsupported physical-lifecycle claim.
    for (const qid of wikidataIds(entry)) {
      const qidEvidence = almanakkenByQid.get(qid) ?? [];
      const rawEvidenceUris: string[] = [];
      for (const evidence of qidEvidence) {
        const evidenceUri = `${BASE}observation/almanakken/${evidence.recordId}`;
        const organizationUri = `${BASE}organization/${evidence.qid}`;
        const spanUri = `${evidenceUri}/time-span`;
        if (!organizationUris.has(organizationUri)) {
          organizationUris.add(organizationUri);
          graph.push({
            '@id': organizationUri,
            '@type': ['crm:E74_Group'],
            'skos:exactMatch': wikidataUri(evidence.qid),
          });
        }
        if (evidence.year) graph.push(timeSpan(spanUri, evidence.year)!);
        const observation: JsonObject = {
          '@id': evidenceUri,
          '@type': ['crm:E13_Attribute_Assignment'],
          P140_assigned_attribute_to: organizationUri,
          ...(evidence.year ? { P4_has_time_span: spanUri } : {}),
          'prov:hadPrimarySource': sourceUri('almanakken', sourceIds),
          sourceRow: evidence.recordId,
          ...(evidence.sourceName ? { P3_has_note: evidence.sourceName } : {}),
          ...(evidence.sourcePage ? { pageReference: evidence.sourcePage } : {}),
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
        rawEvidenceUris.push(evidenceUri);
      }
      if (rawEvidenceUris.length > 0) {
        const associationUri = `${recordUri}/association/organization/${qid}`;
        const years = qidEvidence
          .map((evidence) => evidence.year)
          .filter((year): year is number => year != null);
        const spanUri = `${associationUri}/time-span`;
        const span = timeSpan(
          spanUri,
          years.length > 0 ? Math.min(...years) : undefined,
          years.length > 0 ? Math.max(...years) : undefined,
        );
        if (span) graph.push(span);
        graph.push({
          '@id': associationUri,
          '@type': ['crm:E13_Attribute_Assignment'],
          P140_assigned_attribute_to: targetUri,
          P141_assigned: `${BASE}organization/${qid}`,
          P2_has_type: `${BASE}type/relationship/source-linked-organisation`,
          ...(span ? { P4_has_time_span: spanUri } : {}),
          'prov:hadPrimarySource': sourceUri('almanakken', sourceIds),
          'prov:wasDerivedFrom': rawEvidenceUris,
          certainty: `${BASE}type/certainty/probable`,
        });
        organizationalAssociationUris.push(associationUri);
      }
    }
    if (evidenceUris.length > 0) record.hasEvidence = evidenceUris;
    if (organizationalAssociationUris.length > 0) {
      record.hasOrganizationalAssociation = organizationalAssociationUris;
    }

    for (const [position, ref] of (entry.diklandRefs ?? []).entries()) {
      if (!ref.folderPath && !ref.driveUrl) continue;
      const sourceUriValue = `${recordUri}/source/dikland/${position + 1}`;
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

    const document: JsonObject = {
      '@context': buildPlaceRecordContext(),
      '@id': recordUri,
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
      districtAssertions: asArray(entry.districtAssertions),
      locationAssertions: asArray(entry.locationAssertions),
      diklandRefs: asArray(entry.diklandRefs),
    };
    writeFileSync(join(OUT_DIR, `${entry.id}.jsonld`), `${JSON.stringify(document, null, 2)}\n`);
    writeFileSync(join(OUT_DIR, `${entry.id}.json`), `${JSON.stringify(projection, null, 2)}\n`);
    index.push({ id: entry.id, label, type: entry.type, recordUri });
    records++;
  }

  writeFileSync(join(OUT_DIR, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  console.log(`Generated ${records} public authority records in ${OUT_DIR}`);
}

if (require.main === module) generatePlaceRecords();
