/**
 * Verify that the generated JSON-LD graph is published unchanged by the app.
 *
 * Run after the data pipeline has copied generated artifacts into public/data.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import jsonld from 'jsonld';
import {
  derivePlaceFunctionAssertions,
  relatedPlaceType,
  PLACE_FUNCTION_SCHEME_URI,
  type PlaceFunctionAssertion,
  type PlaceFunctionSource,
} from '../lib/place-functions';

const LOD_DIR = join(__dirname, '../lod');
const PUBLIC_DATA_DIR = join(__dirname, '../public/data');
const DATA_DIR = join(__dirname, '../../data');
const ADDRESS_POINTS_PATH = join(
  DATA_DIR,
  '08-place-points-qgis',
  'export20260619',
  'locatiepunten1885.geojson',
);
const PLACE_RECORDS_DIR = join(PUBLIC_DATA_DIR, 'place-records');
const ABSOLUTE_HTTP_IRI = /^https?:\/\//;
const CANONICAL_BASE = 'https://data.surinametijdmachine.org/';
const WIKIDATA_QID = /^Q\d+$/;
const SKOS_MATCH_TYPES = new Set([
  'exactMatch',
  'closeMatch',
  'broadMatch',
  'narrowMatch',
  'relatedMatch',
]);

interface JsonLdDocument {
  '@context'?: Record<string, unknown>;
  '@graph'?: Array<Record<string, unknown>>;
  '@id'?: string;
  '@type'?: string | string[];
}

interface GeoJsonDocument {
  features?: Array<{ properties?: Record<string, unknown> }>;
}

interface AddressPointSource {
  features?: Array<{
    geometry?: { type?: string; coordinates?: unknown } | null;
  }>;
}

interface AlmanakkenReviewDocument {
  rowCounts?: {
    total: number;
    withQid: number;
    withoutQid: number;
    attached: number;
    unresolved: number;
  };
  byPlaceId?: Record<
    string,
    {
      rows?: number;
      productRows?: number;
      desertedRows?: number;
      hasProductAssertions?: boolean;
      hasStatusAssertions?: boolean;
      hasAlmanakkenObservations?: boolean;
      issues?: Array<{ type?: string }>;
    }
  >;
  unlinkedRows?: Array<{ recordId?: string }>;
}

interface PlaceFunctionsDocument {
  scheme?: { uri?: string };
  functions?: Array<{
    id?: string;
    uri?: string;
    placeCount?: number;
    assertionCount?: number;
    relatedPlaceType?: { id?: string; uri?: string };
    places?: Array<{
      id?: string;
      usages?: Array<{ assertionId?: string }>;
    }>;
  }>;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function toArray<T>(value: T | T[] | undefined | null): T[] {
  return value == null ? [] : Array.isArray(value) ? value : [value];
}

function jsonLdId(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const id = (value as Record<string, unknown>)['@id'];
    return typeof id === 'string' ? id : undefined;
  }
  return undefined;
}

function readArtifact(directory: string, name: string): Buffer {
  const path = join(directory, name);
  assert(existsSync(path), `Missing LOD artifact: ${path}`);
  return readFileSync(path);
}

function collectHttpHosts(value: unknown, hosts: Set<string>) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectHttpHosts(item, hosts));
    return;
  }
  if (!value || typeof value !== 'object') return;

  for (const child of Object.values(value)) {
    if (typeof child === 'string' && ABSOLUTE_HTTP_IRI.test(child)) {
      hosts.add(new URL(child).host);
    } else {
      collectHttpHosts(child, hosts);
    }
  }
}

function collectCanonicalReferences(value: unknown, references: Set<string>) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectCanonicalReferences(item, references));
    return;
  }
  if (!value || typeof value !== 'object') return;

  for (const child of Object.values(value)) {
    if (typeof child === 'string' && child.startsWith(CANONICAL_BASE)) {
      references.add(child);
    } else {
      collectCanonicalReferences(child, references);
    }
  }
}

async function main() {
  const database = readArtifact(LOD_DIR, 'database.jsonld');
  const context = readArtifact(LOD_DIR, 'context.jsonld');
  const publishedDatabase = readArtifact(PUBLIC_DATA_DIR, 'database.jsonld');
  const publishedContext = readArtifact(PUBLIC_DATA_DIR, 'context.jsonld');
  const gazetteer = JSON.parse(
    readArtifact(DATA_DIR, 'places-gazetteer.jsonld').toString('utf-8'),
  ) as JsonLdDocument;
  const sourceRegistry = JSON.parse(
    readArtifact(DATA_DIR, 'sources-registry.jsonld').toString('utf-8'),
  ) as JsonLdDocument;
  const addressPointSource = JSON.parse(
    readFileSync(ADDRESS_POINTS_PATH, 'utf-8'),
  ) as AddressPointSource;
  const mapFeatures = JSON.parse(
    readArtifact(PUBLIC_DATA_DIR, 'map-features.geojson').toString('utf-8'),
  ) as GeoJsonDocument;
  const almanakkenReview = JSON.parse(
    readArtifact(PUBLIC_DATA_DIR, 'almanakken-review.json').toString('utf-8'),
  ) as AlmanakkenReviewDocument;
  const placeFunctions = JSON.parse(
    readArtifact(PUBLIC_DATA_DIR, 'place-functions.json').toString('utf-8'),
  ) as PlaceFunctionsDocument;
  const organizationOverrides = JSON.parse(
    readArtifact(DATA_DIR, 'organization-authority-overrides.jsonld').toString(
      'utf-8',
    ),
  ) as JsonLdDocument;

  assert(
    database.equals(publishedDatabase),
    'public/data/database.jsonld differs from the generated database',
  );
  assert(
    context.equals(publishedContext),
    'public/data/context.jsonld differs from the generated context',
  );

  const document = JSON.parse(database.toString('utf-8')) as JsonLdDocument;
  assert(
    document['@context'] && typeof document['@context'] === 'object',
    'database.jsonld has no object @context',
  );
  assert(Array.isArray(document['@graph']), 'database.jsonld has no @graph');
  assert(
    typeof document['@id'] === 'string' && ABSOLUTE_HTTP_IRI.test(document['@id']),
    'database.jsonld must have an absolute HTTP @id',
  );
  assert(
    document['@type'] === 'sdo:Dataset',
    'database.jsonld must identify itself as an sdo:Dataset',
  );

  const expanded = (await jsonld.expand(
    document as unknown as jsonld.JsonLdDocument,
  )) as unknown as Array<Record<string, unknown>>;
  assert(expanded.length === 1, 'JSON-LD expansion must produce one dataset node');
  assert(
    Array.isArray(expanded[0]['@graph']) &&
      expanded[0]['@graph'].length === document['@graph'].length,
    'JSON-LD expansion must preserve every generated graph entity',
  );

  const ids = new Set<string>();
  for (const entity of document['@graph']) {
    const id = entity['@id'];
    assert(
      typeof id === 'string' && ABSOLUTE_HTTP_IRI.test(id),
      'Every generated graph entity must have an absolute HTTP @id',
    );
    assert(!ids.has(id), `Duplicate JSON-LD entity @id: ${id}`);
    assert(
      !id.startsWith('http://www.wikidata.org/entity/') &&
        !id.startsWith('https://www.wikidata.org/entity/'),
      `External Wikidata entity must not be redefined in the local graph: ${id}`,
    );
    const types = toArray(entity['@type']);
    if (types.includes('E25_Human_Made_Feature')) {
      for (const property of [
        'P51_has_former_or_current_owner',
        'P52_has_current_owner',
      ]) {
        assert(
          !toArray(entity[property]).some(
            (value) =>
              typeof value === 'string' &&
              /^https?:\/\/www\.wikidata\.org\/entity\/Q\d+$/.test(value),
          ),
          `${id} uses a plantation authority QID as ${property}`,
        );
      }
    }
    if (types.includes('E74_Group')) {
      assert(
        id.startsWith(`${CANONICAL_BASE}organization/Q`),
        `E74 organization must use a canonical local URI: ${id}`,
      );
      assert(
        typeof entity.exactMatch === 'string' &&
          /^https?:\/\/www\.wikidata\.org\/entity\/Q\d+$/.test(entity.exactMatch),
        `E74 organization must have one Wikidata skos:exactMatch: ${id}`,
      );
    }
    ids.add(id);
  }

  ids.add(document['@id']);
  for (const entry of gazetteer['@graph'] ?? []) {
    if (
      entry.type === 'plantation' &&
      typeof entry.id === 'string' &&
      !entry.deprecated &&
      !entry.mergedInto
    ) {
      // These E25 nodes are defined in their public per-place JSON-LD records.
      ids.add(`${CANONICAL_BASE}place/${entry.id}#feature`);
    }
  }
  const canonicalReferences = new Set<string>();
  collectCanonicalReferences(document['@graph'], canonicalReferences);
  const danglingReferences = [...canonicalReferences].filter((uri) => !ids.has(uri));
  assert(
    danglingReferences.length === 0,
    `Generated graph has undefined canonical URI references:\n${danglingReferences.join('\n')}`,
  );

  const hosts = new Set<string>();
  collectHttpHosts(document['@graph'], hosts);
  assert(
    hosts.has('www.wikidata.org'),
    'Generated graph has no outbound Wikidata links',
  );
  const hasRetiredHost = [...hosts].some(
    (host) =>
      host === 'suriname-timemachine.org' ||
      host.endsWith('.suriname-timemachine.org'),
  );
  assert(
    !hasRetiredHost,
    'Generated graph still references the retired ontology host',
  );

  assert(Array.isArray(gazetteer['@graph']), 'Gazetteer has no @graph');
  assert(Array.isArray(sourceRegistry['@graph']), 'Source registry has no @graph');
  const knownSourceIds = new Set(
    sourceRegistry['@graph']
      .map((source) => source.sourceId)
      .filter((sourceId): sourceId is string => typeof sourceId === 'string'),
  );
  let externalLinkCount = 0;
  for (const entry of gazetteer['@graph']) {
    assert(
      entry && typeof entry === 'object' && !Array.isArray(entry),
      'Gazetteer @graph must contain only object entries',
    );
    const entryRecord = entry as Record<string, unknown>;
    const entryId =
      typeof entryRecord['@id'] === 'string'
        ? entryRecord['@id']
        : typeof entryRecord.id === 'string'
          ? entryRecord.id
          : '(missing @id)';
    assert(
      !Object.hasOwn(entryRecord, 'wikidataQid'),
      `Legacy wikidataQid found on gazetteer entry ${entryId}`,
    );
    assert(
      Array.isArray(entryRecord.externalLinks),
      `Gazetteer entry ${entryId} has no externalLinks array`,
    );

    const linkKeys = new Set<string>();
    for (const link of entryRecord.externalLinks) {
      assert(
        link && typeof link === 'object' && !Array.isArray(link),
        `Invalid external link on gazetteer entry ${entryId}`,
      );
      const { authority, identifier, matchType } = link as Record<string, unknown>;
      assert(
        typeof authority === 'string' && authority.trim().length > 0,
        `External link has no authority on gazetteer entry ${entryId}`,
      );
      assert(
        typeof identifier === 'string' && identifier.trim().length > 0,
        `External link has no identifier on gazetteer entry ${entryId}`,
      );
      assert(
        typeof matchType === 'string' && SKOS_MATCH_TYPES.has(matchType),
        `External link has invalid matchType on gazetteer entry ${entryId}`,
      );
      if (authority === 'wikidata') {
        assert(
          WIKIDATA_QID.test(identifier),
          `Invalid Wikidata identifier ${identifier} on gazetteer entry ${entryId}`,
        );
      }

      const key = JSON.stringify([authority, identifier, matchType]);
      assert(
        !linkKeys.has(key),
        `Duplicate external link ${key} on gazetteer entry ${entryId}`,
      );
      linkKeys.add(key);
      externalLinkCount++;
    }

    const assertionIds = new Set<string>();
    for (const [kind, assertions] of [
      ['district', entry.districtAssertions],
      ['location', entry.locationAssertions],
      ['status', entry.statusAssertions],
      ['product', entry.productAssertions],
    ] as const) {
      if (assertions == null) continue;
      assert(
        Array.isArray(assertions),
        `${kind} assertions on ${String(entry.id)} must be an array`,
      );
      for (const assertion of assertions) {
        assert(
          assertion && typeof assertion === 'object' && !Array.isArray(assertion),
          `Invalid ${kind} assertion on ${String(entry.id)}`,
        );
        const value = assertion as Record<string, unknown>;
        assert(
          typeof value.id === 'string' && value.id.trim().length > 0,
          `${kind} assertion on ${String(entry.id)} has no stable ID`,
        );
        assert(
          !assertionIds.has(value.id),
          `Duplicate assertion ID ${value.id} on ${String(entry.id)}`,
        );
        assertionIds.add(value.id);
        assert(
          typeof value.source === 'string' && knownSourceIds.has(value.source),
          `${kind} assertion ${value.id} on ${String(entry.id)} has an unknown source`,
        );
        const start = value.startYear ?? value.sourceYear;
        const end = value.endYear;
        assert(
          start == null || (typeof start === 'number' && Number.isInteger(start)),
          `${kind} assertion ${value.id} on ${String(entry.id)} has an invalid start year`,
        );
        assert(
          end == null || (typeof end === 'number' && Number.isInteger(end)),
          `${kind} assertion ${value.id} on ${String(entry.id)} has an invalid end year`,
        );
        assert(
          !(typeof start === 'number' && typeof end === 'number' && end < start),
          `${kind} assertion ${value.id} on ${String(entry.id)} ends before it starts`,
        );
      }
    }
  }

  const recordIndex = JSON.parse(
    readArtifact(PLACE_RECORDS_DIR, 'index.json').toString('utf-8'),
  ) as Array<Record<string, unknown>>;
  assert(
    recordIndex.length > 0,
    'No generated public authority records were found',
  );
  const recordIds = new Set<string>();
  for (const record of recordIndex) {
    const id = record.id;
    assert(typeof id === 'string', 'Authority-record index contains an invalid id');
    assert(!recordIds.has(id), `Authority-record index contains duplicate id ${id}`);
    recordIds.add(id);
  }
  const activeGazetteer = gazetteer['@graph'].filter(
    (entry) => !entry.deprecated && !entry.mergedInto,
  );
  const rowCounts = almanakkenReview.rowCounts;
  assert(rowCounts, 'Almanakken review has no row completeness counts');
  assert(
    rowCounts.total === rowCounts.withQid + rowCounts.withoutQid,
    'Almanakken review row totals are inconsistent',
  );
  assert(
    rowCounts.withQid === rowCounts.attached + rowCounts.unresolved,
    'Almanakken linked-row totals are inconsistent',
  );
  assert(
    almanakkenReview.unlinkedRows?.length === rowCounts.withoutQid,
    'Almanakken rows without QIDs are not all exposed for review',
  );
  const aggregateEntitiesById = new Map(
    document['@graph'].map((entity) => [entity['@id'], entity]),
  );
  assert(
    placeFunctions.scheme?.uri === PLACE_FUNCTION_SCHEME_URI,
    'Place-functions application data uses an unexpected concept scheme',
  );
  const aggregateFunctionScheme = aggregateEntitiesById.get(
    PLACE_FUNCTION_SCHEME_URI,
  );
  assert(
    aggregateFunctionScheme &&
      toArray(aggregateFunctionScheme['@type'] as string | string[]).includes(
        'skos:ConceptScheme',
      ),
    'Aggregate JSON-LD has no place-function concept scheme',
  );
  const gazetteerPlantationsByFeatureUri = new Map(
    activeGazetteer
      .filter(
        (entry) => entry.type === 'plantation' && typeof entry.id === 'string',
      )
      .map((entry) => [
        `${CANONICAL_BASE}place/${String(entry.id)}#feature`,
        entry,
      ]),
  );
  const associationStatuses = new Set([
    'linked',
    'needs-organization-link',
    'needs-physical-link-review',
    'needs-physical-plantation-link',
  ]);
  const expectedFunctions = new Map<
    string,
    Map<string, PlaceFunctionAssertion[]>
  >();
  for (const entry of activeGazetteer) {
    if (entry.type !== 'plantation' || typeof entry.id !== 'string') continue;
    const assertions = derivePlaceFunctionAssertions(
      entry as PlaceFunctionSource,
    );
    if (assertions.length === 0) continue;

    const projection = JSON.parse(
      readArtifact(PLACE_RECORDS_DIR, `${entry.id}.json`).toString('utf-8'),
    ) as Record<string, unknown>;
    const projectedAssertions = toArray(
      projection.functionAssertions as Record<string, unknown>[] | undefined,
    );
    assert(
      projectedAssertions.length === assertions.length,
      `Authority-record projection ${entry.id} has incomplete function assertions`,
    );

    const record = JSON.parse(
      readArtifact(PLACE_RECORDS_DIR, `${entry.id}.jsonld`).toString('utf-8'),
    ) as JsonLdDocument;
    const graph = record['@graph'] ?? [];
    const featureUri = `${CANONICAL_BASE}place/${entry.id}#feature`;
    const feature = graph.find((entity) => entity['@id'] === featureUri);
    assert(
      feature &&
        toArray(feature['@type'] as string | string[]).includes(
          'crm:E25_Human_Made_Feature',
        ),
      `Function-bearing authority record ${entry.id} has no E25 target`,
    );

    for (const assertion of assertions) {
      assert(
        knownSourceIds.has(assertion.source),
        `Function assertion ${assertion.id} on ${entry.id} has an unknown source`,
      );
      const assignmentUri = `${CANONICAL_BASE}place/${entry.id}#assertion-${assertion.id}`;
      const assignment = graph.find(
        (entity) => entity['@id'] === assignmentUri,
      );
      assert(
        assignment &&
          toArray(assignment['@type'] as string | string[]).includes(
            'crm:E17_Type_Assignment',
          ) &&
          assignment.P41_classified === featureUri &&
          assignment.P42_assigned === assertion.functionUri,
        `Function assertion ${assignmentUri} is not an E17 assignment to its physical place`,
      );
      assert(
        assertion.startYear == null ||
          typeof assignment.P4_has_time_span === 'string',
        `Dated function assertion ${assignmentUri} has no E52 time-span`,
      );
      const term = graph.find(
        (entity) => entity['@id'] === assertion.functionUri,
      );
      assert(
        term &&
          toArray(term['@type'] as string | string[]).includes(
            'crm:E55_Type',
          ) &&
          toArray(term['@type'] as string | string[]).includes('skos:Concept') &&
          jsonLdId(term['skos:inScheme']) === PLACE_FUNCTION_SCHEME_URI,
        `Function assertion ${assignmentUri} has no local E55/SKOS concept`,
      );
      const localRelatedType = relatedPlaceType(assertion.functionId);
      assert(
        localRelatedType == null ||
          jsonLdId(term['skos:related']) === localRelatedType.uri,
        `Function assertion ${assignmentUri} omits its related structural place type`,
      );
      const places =
        expectedFunctions.get(assertion.functionId) ??
        new Map<string, PlaceFunctionAssertion[]>();
      const placeAssertions: PlaceFunctionAssertion[] =
        places.get(entry.id) ?? [];
      placeAssertions.push(assertion);
      places.set(entry.id, placeAssertions);
      expectedFunctions.set(assertion.functionId, places);
    }
  }

  const publishedFunctionIds = new Set<string>();
  for (const term of placeFunctions.functions ?? []) {
    assert(
      typeof term.id === 'string' && expectedFunctions.has(term.id),
      `Place-functions application data contains an unexpected term ${String(term.id)}`,
    );
    assert(!publishedFunctionIds.has(term.id), `Duplicate function term ${term.id}`);
    publishedFunctionIds.add(term.id);
    assert(
      term.uri === `${PLACE_FUNCTION_SCHEME_URI}/${term.id}`,
      `Function term ${term.id} has a non-canonical URI`,
    );
    const expectedPlaces = expectedFunctions.get(term.id)!;
    const expectedAssertionCount = [...expectedPlaces.values()].reduce(
      (sum, assertions) => sum + assertions.length,
      0,
    );
    assert(
      term.placeCount === expectedPlaces.size &&
        term.assertionCount === expectedAssertionCount,
      `Function term ${term.id} has inconsistent place or assertion counts`,
    );
    const publishedPlaces = new Map(
      (term.places ?? []).map((place) => [place.id, place]),
    );
    for (const [placeId, assertions] of expectedPlaces) {
      const publishedPlace = publishedPlaces.get(placeId);
      assert(
        publishedPlace &&
          new Set(
            (publishedPlace.usages ?? []).map((usage) => usage.assertionId),
          ).size === assertions.length &&
          assertions.every((assertion) =>
            (publishedPlace.usages ?? []).some(
              (usage) => usage.assertionId === assertion.id,
            ),
          ),
        `Function term ${term.id} has incomplete usage links for ${placeId}`,
      );
    }
    const aggregateTerm = aggregateEntitiesById.get(term.uri);
    assert(
      aggregateTerm &&
        toArray(aggregateTerm['@type'] as string | string[]).includes(
          'E55_Type',
        ) &&
        toArray(aggregateTerm['@type'] as string | string[]).includes(
          'skos:Concept',
        ) &&
        jsonLdId(aggregateTerm['skos:inScheme']) === PLACE_FUNCTION_SCHEME_URI,
      `Aggregate JSON-LD has no canonical E55/SKOS function term ${term.id}`,
    );
    const expectedRelatedType = relatedPlaceType(term.id);
    const aggregateRelatedType = expectedRelatedType
      ? aggregateEntitiesById.get(expectedRelatedType.uri)
      : undefined;
    assert(
      expectedRelatedType == null ||
        (term.relatedPlaceType?.id === expectedRelatedType.id &&
          term.relatedPlaceType.uri === expectedRelatedType.uri &&
          jsonLdId(aggregateTerm?.['skos:related']) ===
            expectedRelatedType.uri &&
          aggregateRelatedType != null &&
          toArray(
            aggregateRelatedType['@type'] as string | string[],
          ).includes('skos:Concept')),
      `Function term ${term.id} omits its related structural place type`,
    );
  }
  assert(
    publishedFunctionIds.size === expectedFunctions.size,
    'Place-functions application data omits derived function terms',
  );
  const expectedFunctionAssignmentCount = [...expectedFunctions.values()]
    .flatMap((places) => [...places.values()])
    .reduce((sum, assertions) => sum + assertions.length, 0);
  let serializedFunctionAssignmentCount = 0;
  for (const recordEntry of recordIndex) {
    const recordId = recordEntry.id as string;
    const record = JSON.parse(
      readArtifact(PLACE_RECORDS_DIR, `${recordId}.jsonld`).toString('utf-8'),
    ) as JsonLdDocument;
    const graph = record['@graph'] ?? [];
    for (const assignment of graph.filter(
      (entity) =>
        typeof entity.P42_assigned === 'string' &&
        entity.P42_assigned.startsWith(`${PLACE_FUNCTION_SCHEME_URI}/`),
    )) {
      serializedFunctionAssignmentCount++;
      const target = graph.find(
        (entity) => entity['@id'] === assignment.P41_classified,
      );
      assert(
        toArray(assignment['@type'] as string | string[]).includes(
          'crm:E17_Type_Assignment',
        ) &&
          target &&
          toArray(target['@type'] as string | string[]).includes(
            'crm:E25_Human_Made_Feature',
          ) &&
          !toArray(target['@type'] as string | string[]).includes(
            'crm:E74_Group',
          ),
        `Place-function assignment ${String(assignment['@id'])} does not classify an E25 physical place`,
      );
    }
  }
  assert(
    serializedFunctionAssignmentCount === expectedFunctionAssignmentCount,
    'Serialized place-function assignment count differs from the derived application data',
  );
  for (const entity of document['@graph'].filter((candidate) =>
    toArray(candidate['@type'] as string | string[]).includes('Plantation'),
  )) {
    const entityId = String(entity['@id']);
    const status = entity.organizationAssociationStatus;
    assert(
      typeof status === 'string' && associationStatuses.has(status),
      `Plantation ${entityId} has no valid organization association status`,
    );
    const organizationUri = entity.hasOrganizationalAssociation;
    if (status === 'needs-organization-link') {
      assert(
        organizationUri == null,
        `Plantation ${entityId} is marked unlinked but has an E74 association`,
      );
      continue;
    }
    assert(
      typeof organizationUri === 'string',
      `Plantation ${entityId} is marked ${String(status)} without an E74 association`,
    );
    const organization = aggregateEntitiesById.get(organizationUri);
    assert(
      organization &&
        toArray(organization['@type'] as string | string[]).includes('E74_Group'),
      `Plantation ${entityId} association does not resolve to E74`,
    );
    assert(
      toArray(entity.closeMatch as string | string[]).includes(
        organization.exactMatch as string,
      ),
      `Plantation ${entityId} and E74 association do not share the authority QID`,
    );
    assert(
      toArray(
        organization.associatedPhysicalPlantation as string | string[],
      ).includes(entityId),
      `Plantation ${entityId} association is not reciprocal on ${organizationUri}`,
    );
  }
  for (const organization of document['@graph'].filter((candidate) =>
    toArray(candidate['@type'] as string | string[]).includes('E74_Group'),
  )) {
    const organizationId = String(organization['@id']);
    const status = organization.organizationAssociationStatus;
    const physicalPlantations = toArray(
      organization.associatedPhysicalPlantation as string | string[],
    );
    assert(
      typeof status === 'string' && associationStatuses.has(status),
      `Organization ${organizationId} has no valid physical association status`,
    );
    assert(
      physicalPlantations.length > 0
        ? status !== 'needs-physical-plantation-link'
        : status === 'needs-physical-plantation-link',
      `Organization ${organizationId} has an inconsistent physical association status`,
    );
    for (const plantationUri of physicalPlantations) {
      const plantation = aggregateEntitiesById.get(plantationUri);
      if (plantation) {
        assert(
          toArray(plantation['@type'] as string | string[]).includes(
            'E25_Human_Made_Feature',
          ),
          `Organization ${organizationId} links to a non-E25 plantation`,
        );
        assert(
          plantation.hasOrganizationalAssociation === organizationId,
          `Organization ${organizationId} association is not reciprocal on ${plantationUri}`,
        );
        continue;
      }
      const gazetteerPlantation =
        gazetteerPlantationsByFeatureUri.get(plantationUri);
      assert(
        gazetteerPlantation,
        `Organization ${organizationId} links to an unknown physical plantation`,
      );
      const externalLinks = Array.isArray(gazetteerPlantation.externalLinks)
        ? (gazetteerPlantation.externalLinks as Array<Record<string, unknown>>)
        : [];
      const qid = externalLinks.find(
        (link) =>
          link.authority === 'wikidata' &&
          typeof link.identifier === 'string',
      )?.identifier;
      assert(
        typeof qid === 'string' &&
          String(organization.exactMatch).endsWith(`/${qid}`),
        `Organization ${organizationId} and Gazetteer plantation ${plantationUri} do not share a QID`,
      );
    }
  }
  for (const feature of mapFeatures.features ?? []) {
    const properties = feature.properties ?? {};
    if (properties.featureType !== 'plantation') continue;
    const status = properties.organizationAssociationStatus;
    assert(
      typeof status === 'string' && associationStatuses.has(status),
      `Explore plantation ${String(properties.stmId)} has no association review status`,
    );
    assert(
      typeof properties.wikidataQid === 'string'
        ? status !== 'needs-organization-link'
        : status === 'needs-organization-link',
      `Explore plantation ${String(properties.stmId)} has inconsistent QID and association status`,
    );
  }
  const overrideQids = new Set<string>();
  for (const override of organizationOverrides['@graph'] ?? []) {
    const qid = override.qid;
    assert(
      typeof qid === 'string' && /^Q\d+$/.test(qid),
      'Organization authority override has an invalid QID',
    );
    assert(!overrideQids.has(qid), `Duplicate organization override for ${qid}`);
    assert(
      aggregateEntitiesById.has(`${CANONICAL_BASE}organization/${qid}`),
      `Organization override targets unknown E74 organization ${qid}`,
    );
    assert(
      ['unreviewed', 'reviewed', 'disputed'].includes(
        String(override.reviewStatus),
      ),
      `Organization override ${qid} has an invalid review status`,
    );
    if (override.physicalLinkReviewStatus != null) {
      assert(
        override.physicalLinkReviewStatus === 'confirmed-multiple',
        `Organization override ${qid} has an invalid physical-link review status`,
      );
      const reviewedIds = Array.isArray(override.reviewedPhysicalPlaceIds)
        ? override.reviewedPhysicalPlaceIds
        : [];
      assert(
        reviewedIds.length >= 2 &&
          new Set(reviewedIds).size === reviewedIds.length,
        `Organization override ${qid} must identify at least two distinct reviewed places`,
      );
      assert(
        reviewedIds.every(
          (id) => typeof id === 'string' && /^stm-[a-z0-9-]+$/.test(id),
        ),
        `Organization override ${qid} has an invalid reviewed place ID`,
      );
    }
    overrideQids.add(qid);
  }
  const aggregateAlmanakkenEvidence = document['@graph'].filter(
    (entity) =>
      typeof entity['@id'] === 'string' &&
      entity['@id'].startsWith(`${CANONICAL_BASE}obs/`),
  );
  assert(
    aggregateAlmanakkenEvidence.length === rowCounts.total,
    'Aggregate JSON-LD does not preserve every Almanakken source row',
  );
  for (const evidence of aggregateAlmanakkenEvidence) {
    const evidenceId = String(evidence['@id']);
    const targetId = evidence.P140_assigned_attribute_to;
    if (typeof evidence.sourcePlantationQid === 'string') {
      assert(
        targetId != null,
        `QID-bearing Almanakken observation has no E74 target: ${evidenceId}`,
      );
    } else {
      assert(
        targetId == null,
        `Almanakken observation without a QID has an unsupported target: ${evidenceId}`,
      );
    }
    for (const legacyProperty of ['hasParts', 'partOf', 'ownedBy', 'mergedInto']) {
      assert(
        evidence[legacyProperty] == null,
        `Aggregate Almanakken observation still emits ambiguous ${legacyProperty}: ${evidenceId}`,
      );
    }
    for (const relationshipProperty of [
      'reportedComponentOrganization',
      'reportedCompositeOrganization',
      'reportedOwnerOrganization',
    ]) {
      for (const relationshipTarget of toArray(
        evidence[relationshipProperty] as string | string[],
      )) {
        assert(
          relationshipTarget.startsWith(`${CANONICAL_BASE}organization/`),
          `${evidenceId} ${relationshipProperty} does not use a local organization URI`,
        );
        const relationshipOrganization = aggregateEntitiesById.get(
          relationshipTarget,
        );
        assert(
          relationshipOrganization &&
            toArray(
              relationshipOrganization['@type'] as string | string[],
            ).includes('E74_Group'),
          `${evidenceId} ${relationshipProperty} targets an unknown E74`,
        );
      }
    }
    if (targetId == null) continue;
    assert(
      typeof targetId === 'string',
      'Aggregate Almanakken observation has a non-string target',
    );
    const target = aggregateEntitiesById.get(targetId);
    assert(target, `Aggregate Almanakken observation targets unknown entity ${targetId}`);
    assert(
      toArray(target['@type'] as string | string[]).includes('E74_Group'),
      `Aggregate Almanakken observation targets a non-E74 entity ${targetId}`,
    );
  }
  const inferredPresence = document['@graph'].filter((entity) =>
    toArray(entity['@type'] as string | string[]).includes('PresenceInference'),
  );
  assert(
    aggregateAlmanakkenEvidence.every(
      (entity) => typeof entity.presenceInferenceStatus === 'string',
    ),
    'Every Almanakken observation must expose its presence-inference status',
  );
  assert(
    inferredPresence.length ===
      aggregateAlmanakkenEvidence.filter(
        (entity) => entity.presenceInferenceStatus === 'inferred-probable',
      ).length,
    'Presence inference nodes and inferred observation statuses differ',
  );
  for (const inference of inferredPresence) {
    const inferenceId = String(inference['@id']);
    const observation = aggregateEntitiesById.get(inference.wasDerivedFrom);
    const organization = aggregateEntitiesById.get(
      inference.inferredPopulationAssociatedWith,
    );
    const plantation = aggregateEntitiesById.get(inference.inferredPresenceAt);
    assert(observation, `${inferenceId} has no source observation`);
    assert(
      organization &&
        toArray(organization['@type'] as string | string[]).includes('E74_Group'),
      `${inferenceId} has no E74 organization`,
    );
    assert(
      plantation &&
        toArray(plantation['@type'] as string | string[]).includes(
          'E25_Human_Made_Feature',
        ),
      `${inferenceId} has no E25 plantation`,
    );
    assert(
      inference.certainty === `${CANONICAL_BASE}type/certainty/probable` &&
        typeof inference.populationCount === 'number' &&
        inference.populationCount > 0,
      `${inferenceId} is not a qualified probable population assertion`,
    );
  }
  const attachedSourceRows = new Set<string>();
  for (const entry of activeGazetteer) {
    const observations = toArray(
      entry.almanakkenObservations as Record<string, unknown>[] | undefined,
    );
    if (observations.length === 0) continue;
    const id = entry.id;
    assert(typeof id === 'string', 'Almanakken-bearing place has no ID');
    const record = JSON.parse(
      readArtifact(PLACE_RECORDS_DIR, `${id}.jsonld`).toString('utf-8'),
    ) as JsonLdDocument;
    const graph = record['@graph'] ?? [];
    const evidence = graph.filter(
      (entity) => entity.sourceVersion === 'v2' && typeof entity.sourceRow === 'string',
    );
    assert(
      evidence.length === observations.length,
      `Authority record ${id} does not preserve every Almanakken observation`,
    );
    for (const observation of evidence) {
      const sourceRow = observation.sourceRow as string;
      assert(
        !attachedSourceRows.has(sourceRow),
        `Almanakken source row ${sourceRow} is attached more than once`,
      );
      attachedSourceRows.add(sourceRow);
      const target = graph.find(
        (entity) => entity['@id'] === observation.P140_assigned_attribute_to,
      );
      assert(target, `Almanakken observation ${sourceRow} has no local target`);
      assert(
        toArray(target['@type'] as string | string[]).includes(
          'crm:E74_Group',
        ),
        `Almanakken observation ${sourceRow} does not target an E74 organization`,
      );
      for (const relationshipProperty of [
        'reportedComponentOrganization',
        'reportedCompositeOrganization',
        'reportedOwnerOrganization',
      ]) {
        for (const relationshipTarget of toArray(
          observation[relationshipProperty] as string | string[],
        )) {
          const relationshipOrganization = graph.find(
            (entity) => entity['@id'] === relationshipTarget,
          );
          assert(
            relationshipOrganization &&
              toArray(
                relationshipOrganization['@type'] as string | string[],
              ).includes('crm:E74_Group'),
            `Almanakken observation ${sourceRow} has an unresolved ${relationshipProperty}`,
          );
        }
      }
    }
    for (const feature of graph.filter((entity) =>
      toArray(entity['@type'] as string | string[]).includes(
        'crm:E25_Human_Made_Feature',
      ),
    )) {
      const organizationUri = feature.hasOrganizationalAssociation;
      if (organizationUri == null) continue;
      const organization = graph.find(
        (entity) => entity['@id'] === organizationUri,
      );
      assert(
        organization &&
          toArray(organization['@type'] as string | string[]).includes(
            'crm:E74_Group',
          ) &&
          toArray(
            organization.associatedPhysicalPlantation as string | string[],
          ).includes(feature['@id'] as string),
        `Authority record ${id} has a non-reciprocal E25-E74 association`,
      );
    }
  }
  assert(
    attachedSourceRows.size === rowCounts.attached,
    'Almanakken attached-row count differs from published authority records',
  );
  for (const entry of activeGazetteer) {
    if (entry.type !== 'river' && entry.type !== 'creek') continue;
    const location = entry.location as Record<string, unknown> | undefined;
    assert(
      typeof location?.wkt === 'string' &&
        /^(?:Multi)?LineString\s*\(/i.test(location.wkt),
      `${String(entry.type)} ${String(entry.id)} is not backed by line geometry`,
    );
  }
  for (const entry of activeGazetteer) {
    if (entry.type !== 'plantation') continue;
    const location = entry.location as Record<string, unknown> | undefined;
    assert(
      typeof location?.wkt !== 'string' || !/^Point\s*\(/i.test(location.wkt),
      `Plantation ${String(entry.id)} is incorrectly backed by point geometry`,
    );
  }
  const sourceAddressFeatures = (addressPointSource.features ?? []).filter(
    (feature) =>
      feature.geometry?.type === 'Point' &&
      Array.isArray(feature.geometry.coordinates) &&
      feature.geometry.coordinates.length >= 2 &&
      Number.isFinite(Number(feature.geometry.coordinates[0])) &&
      Number.isFinite(Number(feature.geometry.coordinates[1])),
  );
  const historicalAddresses = activeGazetteer.filter(
    (entry) => entry.type === 'historical-address',
  );
  assert(
    historicalAddresses.length === sourceAddressFeatures.length,
    'Historical-address Gazetteer records do not cover every valid 1885 source point',
  );
  for (const entry of historicalAddresses) {
    const sourceRecord = entry.sourceRecord as Record<string, unknown> | undefined;
    const locationAssertions = entry.locationAssertions as
      | Array<Record<string, unknown>>
      | undefined;
    assert(
      Array.isArray(entry.sources) && entry.sources.includes('historic-map-27'),
      `Historical address ${String(entry.id)} has no 1885 map source`,
    );
    assert(
      sourceRecord?.dataset === '08-place-points-qgis' &&
        sourceRecord.layer === 'locatiepunten1885' &&
        typeof sourceRecord.featureIndex === 'number',
      `Historical address ${String(entry.id)} has no stable source feature locator`,
    );
    assert(
      locationAssertions?.some(
        (assertion) =>
          assertion.source === 'historic-map-27' &&
          assertion.startYear === 1885 &&
          typeof assertion.sourceRow === 'string',
      ),
      `Historical address ${String(entry.id)} has no source-bound 1885 location assertion`,
    );
  }
  for (const historicalAddress of historicalAddresses) {
    const historicalAddressId = historicalAddress.id as string;
    const addressRecord = JSON.parse(
      readArtifact(PLACE_RECORDS_DIR, `${historicalAddressId}.jsonld`).toString(
        'utf-8',
      ),
    ) as JsonLdDocument;
    const graph = addressRecord['@graph'] ?? [];
    const location = graph.find(
      (entity) =>
        entity['@id'] === `${CANONICAL_BASE}place/${historicalAddressId}#location`,
    );
    const observation = graph.find(
      (entity) =>
        entity['@id'] ===
        `${CANONICAL_BASE}place/${historicalAddressId}#assertion-address-observation-1885`,
    );
    const geometryId = location?.['geo:hasGeometry'];
    const geometry = graph.find((entity) => entity['@id'] === geometryId);
    const addressName = graph.find((entity) =>
      toArray(location?.P1_is_identified_by as string | string[]).includes(
        entity['@id'] as string,
      ),
    );
    assert(
      toArray(location?.['@type'] as string | string[]).includes('crm:E53_Place') &&
        toArray(location?.['@type'] as string | string[]).includes('geo:Feature'),
      `Historical address ${historicalAddressId} anchor is not typed as crm:E53_Place and geo:Feature`,
    );
    assert(
      observation?.P2_has_type ===
        `${CANONICAL_BASE}type/relationship/address-observation`,
      `Historical address ${historicalAddressId} has no address-observation relation`,
    );
    assert(
      observation?.P140_assigned_attribute_to ===
        `${CANONICAL_BASE}place/${historicalAddressId}#location`,
      `Historical address ${historicalAddressId} observation is not attached to its E53/GeoSPARQL point anchor`,
    );
    assert(
      typeof addressName?.['@id'] === 'string' &&
        observation?.P141_assigned === addressName['@id'],
      `Historical address ${historicalAddressId} observation does not assign its dated address appellation`,
    );
    assert(
      observation?.P4_has_time_span ===
        `${CANONICAL_BASE}place/${historicalAddressId}#assertion-address-observation-1885-time-span`,
      `Historical address ${historicalAddressId} observation has no 1885 time span`,
    );
    assert(
      geometryId === `${CANONICAL_BASE}place/${historicalAddressId}#geometry-point`,
      `Historical address ${historicalAddressId} point geometry has a non-point URI`,
    );
    assert(
      typeof geometry?.['geo:asWKT'] === 'object' &&
        geometry['geo:asWKT'] !== null &&
        String((geometry['geo:asWKT'] as Record<string, unknown>)['@value']).includes(
          '> POINT ',
        ),
      `Historical address ${historicalAddressId} geometry is not serialized as WKT POINT`,
    );
  }
  assert(
    recordIds.size === activeGazetteer.length,
    'Authority-record index does not cover every active Gazetteer entry',
  );
  for (const entry of activeGazetteer) {
    assert(
      typeof entry.id === 'string' && recordIds.has(entry.id),
      `Gazetteer entry ${String(entry.id)} has no authority record`,
    );
  }

  assert(Array.isArray(mapFeatures.features), 'Map features has no features array');
  const mappedGazetteerIds = new Set(
    mapFeatures.features
      .map((feature) => feature.properties?.stmId)
      .filter((id): id is string => typeof id === 'string'),
  );
  let geometricGazetteerEntries = 0;
  for (const entry of activeGazetteer) {
    const location = entry.location as Record<string, unknown> | undefined;
    const hasGeometry =
      typeof location?.wkt === 'string' ||
      (typeof location?.lat === 'number' && typeof location?.lng === 'number');
    if (!hasGeometry) continue;
    geometricGazetteerEntries++;
    assert(
      mappedGazetteerIds.has(entry.id as string),
      `Geometry-bearing Gazetteer entry ${String(entry.id)} is missing from map-features.geojson`,
    );
  }
  const recordSamples = [
    recordIndex[0],
    recordIndex[Math.floor(recordIndex.length / 2)],
    recordIndex[recordIndex.length - 1],
  ].filter((record, index, values) => values.indexOf(record) === index);
  for (const record of recordSamples) {
    const id = record.id as string;
    const jsonld = JSON.parse(
      readArtifact(PLACE_RECORDS_DIR, `${id}.jsonld`).toString('utf-8'),
    ) as JsonLdDocument;
    assert(
      jsonld['@id'] === `${CANONICAL_BASE}place/${id}`,
      `Authority record ${id} has a non-canonical @id`,
    );
    assert(
      jsonld['@context'] && typeof jsonld['@context'] === 'object',
      `Authority record ${id} has no JSON-LD context`,
    );
    assert(
      Array.isArray(jsonld['@graph']) && jsonld['@graph'].length > 0,
      `Authority record ${id} has no graph`,
    );
    const recordNode = jsonld['@graph'].find(
      (entity) => entity['@id'] === `${CANONICAL_BASE}place/${id}#record`,
    );
    assert(recordNode, `Authority record ${id} has no record node`);
    assert(
      toArray(recordNode['@type'] as string | string[]).includes(
        'stm:AuthorityRecord',
      ),
      `Authority record ${id} does not have the AuthorityRecord type`,
    );
    assert(
      recordNode['dcterms:identifier'] === id,
      `Authority record ${id} has no stable dcterms:identifier`,
    );
    assert(
      toArray(recordNode.describes as string | string[]).length > 0,
      `Authority record ${id} does not describe an entity`,
    );
    const graphIds = new Set<string>();
    for (const entity of jsonld['@graph']) {
      const entityId = entity['@id'];
      assert(
        typeof entityId === 'string' && entityId.startsWith(CANONICAL_BASE),
        `Authority record ${id} has a non-canonical entity @id`,
      );
      assert(
        !entityId.startsWith(`${CANONICAL_BASE}place/${id}/`),
        `Authority record ${id} uses a non-dereferenceable place subpath ${entityId}`,
      );
      assert(!graphIds.has(entityId), `Authority record ${id} has duplicate @id ${entityId}`);
      graphIds.add(entityId);
      const types = toArray(entity['@type'] as string | string[]);
      if (types.includes('crm:E25_Human_Made_Feature')) {
        assert(
          typeof entity.P53_has_location === 'string',
          `Feature ${entityId} has no E53 location`,
        );
      }
      if (types.includes('crm:E17_Type_Assignment')) {
        assert(
          typeof entity.P41_classified === 'string' &&
            typeof entity.P42_assigned === 'string' &&
            typeof entity['prov:hadPrimarySource'] === 'string',
          `Status assertion ${entityId} does not meet the supported profile`,
        );
      }
      if (types.includes('crm:E13_Attribute_Assignment')) {
        assert(
          typeof entity['prov:hadPrimarySource'] === 'string',
          `Evidence assertion ${entityId} has no primary source`,
        );
      }
    }
    assert(
      existsSync(join(PLACE_RECORDS_DIR, `${id}.json`)),
      `Authority record ${id} has no JSON projection`,
    );
  }

  console.log(
    `LOD publication OK: ${ids.size} entities, ${recordIndex.length} authority records, and ${geometricGazetteerEntries} map-covered Gazetteer entries are published unchanged; ${hosts.size} linked-data hosts and ${externalLinkCount} canonical authority links are validated.`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
