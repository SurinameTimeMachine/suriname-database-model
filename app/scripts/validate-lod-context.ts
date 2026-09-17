import { readFileSync } from 'fs';
import { join } from 'path';

const LOD_DIR = join(__dirname, '../lod');
const JSON_LD_KEYWORDS = new Set([
  '@base',
  '@container',
  '@context',
  '@direction',
  '@graph',
  '@id',
  '@import',
  '@included',
  '@index',
  '@json',
  '@language',
  '@list',
  '@nest',
  '@none',
  '@prefix',
  '@propagate',
  '@protected',
  '@reverse',
  '@set',
  '@type',
  '@value',
  '@version',
  '@vocab',
]);

interface JsonLdDocument {
  '@context'?: Record<string, unknown>;
  '@graph'?: unknown[];
}

function collectKeys(value: unknown, keys: Set<string>) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeys(item, keys));
    return;
  }
  if (!value || typeof value !== 'object') return;

  for (const [key, child] of Object.entries(value)) {
    keys.add(key);
    collectKeys(child, keys);
  }
}

function values(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function localTerm(term: string) {
  return !term.includes(':') && !JSON_LD_KEYWORDS.has(term);
}

function main() {
  const database = JSON.parse(
    readFileSync(join(LOD_DIR, 'database.jsonld'), 'utf-8'),
  ) as JsonLdDocument;
  const contextDocument = JSON.parse(
    readFileSync(join(LOD_DIR, 'context.jsonld'), 'utf-8'),
  ) as Pick<JsonLdDocument, '@context'>;

  const context = database['@context'];
  if (!context || typeof context !== 'object') {
    throw new Error('database.jsonld has no object @context');
  }
  if (
    JSON.stringify(contextDocument['@context']) !== JSON.stringify(context)
  ) {
    throw new Error('context.jsonld does not match database.jsonld @context');
  }

  const graph = database['@graph'];
  if (!Array.isArray(graph)) {
    throw new Error('database.jsonld has no @graph array');
  }

  const terms = new Set<string>();
  collectKeys(graph, terms);

  const missingTerms = [...terms]
    .filter(localTerm)
    .filter((term) => !(term in context))
    .sort();

  const graphTypes = new Set<string>();
  for (const entity of graph) {
    if (!entity || typeof entity !== 'object') continue;
    for (const type of values((entity as Record<string, unknown>)['@type'])) {
      if (typeof type === 'string') graphTypes.add(type);
    }
  }

  const missingTypes = [...graphTypes]
    .filter(localTerm)
    .filter((term) => !(term in context))
    .sort();

  if (missingTerms.length > 0 || missingTypes.length > 0) {
    const details = [
      missingTerms.length
        ? `Undefined graph terms: ${missingTerms.join(', ')}`
        : null,
      missingTypes.length
        ? `Undefined type aliases: ${missingTypes.join(', ')}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');
    throw new Error(details);
  }

  console.log(
    `LOD context OK: standalone context matches database context; ${terms.size} graph keys and ${graphTypes.size} graph types are covered.`,
  );
}

main();
