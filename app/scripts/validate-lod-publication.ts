/**
 * Verify that the generated JSON-LD graph is published unchanged by the app.
 *
 * Run after the data pipeline has copied generated artifacts into public/data.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const LOD_DIR = join(__dirname, '../lod');
const PUBLIC_DATA_DIR = join(__dirname, '../public/data');
const DATA_DIR = join(__dirname, '../../data');
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function toArray<T>(value: T | T[] | undefined | null): T[] {
  return value == null ? [] : Array.isArray(value) ? value : [value];
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

function main() {
  const database = readArtifact(LOD_DIR, 'database.jsonld');
  const context = readArtifact(LOD_DIR, 'context.jsonld');
  const publishedDatabase = readArtifact(PUBLIC_DATA_DIR, 'database.jsonld');
  const publishedContext = readArtifact(PUBLIC_DATA_DIR, 'context.jsonld');
  const gazetteer = JSON.parse(
    readArtifact(DATA_DIR, 'places-gazetteer.jsonld').toString('utf-8'),
  ) as JsonLdDocument;
  const mapFeatures = JSON.parse(
    readArtifact(PUBLIC_DATA_DIR, 'map-features.geojson').toString('utf-8'),
  ) as GeoJsonDocument;

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

  const ids = new Set<string>();
  for (const entity of document['@graph']) {
    const id = entity['@id'];
    assert(
      typeof id === 'string' && ABSOLUTE_HTTP_IRI.test(id),
      'Every generated graph entity must have an absolute HTTP @id',
    );
    assert(!ids.has(id), `Duplicate JSON-LD entity @id: ${id}`);
    ids.add(id);
  }

  const hosts = new Set<string>();
  collectHttpHosts(document['@graph'], hosts);
  assert(
    hosts.has('www.wikidata.org'),
    'Generated graph has no outbound Wikidata links',
  );
  assert(
    !hosts.has('suriname-timemachine.org'),
    'Generated graph still references the retired ontology host',
  );

  assert(Array.isArray(gazetteer['@graph']), 'Gazetteer has no @graph');
  let externalLinkCount = 0;
  for (const entry of gazetteer['@graph']) {
    assert(
      !Object.hasOwn(entry, 'wikidataQid'),
      `Legacy wikidataQid found on gazetteer entry ${String(entry.id)}`,
    );
    assert(
      Array.isArray(entry.externalLinks),
      `Gazetteer entry ${String(entry.id)} has no externalLinks array`,
    );

    const linkKeys = new Set<string>();
    for (const link of entry.externalLinks) {
      assert(
        link && typeof link === 'object' && !Array.isArray(link),
        `Invalid external link on gazetteer entry ${String(entry.id)}`,
      );
      const { authority, identifier, matchType } = link as Record<string, unknown>;
      assert(
        typeof authority === 'string' && authority.trim().length > 0,
        `External link has no authority on gazetteer entry ${String(entry.id)}`,
      );
      assert(
        typeof identifier === 'string' && identifier.trim().length > 0,
        `External link has no identifier on gazetteer entry ${String(entry.id)}`,
      );
      assert(
        typeof matchType === 'string' && SKOS_MATCH_TYPES.has(matchType),
        `External link has invalid matchType on gazetteer entry ${String(entry.id)}`,
      );
      if (authority === 'wikidata') {
        assert(
          WIKIDATA_QID.test(identifier),
          `Invalid Wikidata identifier ${identifier} on gazetteer entry ${String(entry.id)}`,
        );
      }

      const key = `${authority}:${identifier}:${matchType}`;
      assert(
        !linkKeys.has(key),
        `Duplicate external link ${key} on gazetteer entry ${String(entry.id)}`,
      );
      linkKeys.add(key);
      externalLinkCount++;
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
      (entity) => entity['@id'] === jsonld['@id'],
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

main();
