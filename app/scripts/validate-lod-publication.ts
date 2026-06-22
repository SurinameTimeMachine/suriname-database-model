/**
 * Verify that the generated JSON-LD graph is published unchanged by the app.
 *
 * Run after the data pipeline has copied generated artifacts into public/data.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const LOD_DIR = join(__dirname, '../lod');
const PUBLIC_DATA_DIR = join(__dirname, '../public/data');
const ABSOLUTE_HTTP_IRI = /^https?:\/\//;

interface JsonLdDocument {
  '@context'?: Record<string, unknown>;
  '@graph'?: Array<Record<string, unknown>>;
  '@id'?: string;
  '@type'?: string | string[];
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
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

  console.log(
    `LOD publication OK: ${ids.size} entities and the shared context are published unchanged; ${hosts.size} linked-data hosts are referenced.`,
  );
}

main();
