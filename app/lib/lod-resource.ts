import 'server-only';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const canonicalBase = 'https://data.surinametijdmachine.org/';
export const resourcePrefixes = new Set([
  'appellation',
  'database',
  'feature',
  'image',
  'inference',
  'obs',
  'organization',
  'place',
  'plantation',
  'production',
  'provenance',
  'rule',
  'source',
  'timespan',
  'type',
  'vocabulary',
  'visual-item',
]);

type JsonObject = Record<string, unknown>;
type DatabaseDocument = {
  '@context': JsonObject;
  '@graph': JsonObject[];
  '@id': string;
  '@type': string | string[];
  [key: string]: unknown;
};

let databasePromise: Promise<DatabaseDocument> | null = null;

async function loadDatabase(): Promise<DatabaseDocument> {
  databasePromise ??= readFile(
    join(process.cwd(), 'public', 'data', 'database.jsonld'),
    'utf-8',
  )
    .then((content) => JSON.parse(content) as DatabaseDocument)
    .catch((error: unknown) => {
      databasePromise = null;
      throw error;
    });
  return await databasePromise;
}

export function resourcePath(parts: string[]): string | null {
  if (parts.length === 0 || !resourcePrefixes.has(parts[0])) return null;
  if (parts.some((part) => !part || part === '.' || part === '..')) return null;
  return parts.join('/');
}

export async function loadResource(parts: string[]): Promise<{
  context: JsonObject;
  entity: JsonObject;
  uri: string;
} | null> {
  const path = resourcePath(parts);
  if (!path) return null;
  const database = await loadDatabase();
  const uri = `${canonicalBase}${path}`;
  const entity =
    uri === database['@id']
      ? Object.fromEntries(
          Object.entries(database).filter(
            ([key]) => key !== '@context' && key !== '@graph',
          ),
        )
      : database['@graph'].find((candidate) => candidate['@id'] === uri);
  return entity ? { context: database['@context'], entity, uri } : null;
}

export function resourceJsonLd(resource: {
  context: JsonObject;
  entity: JsonObject;
  uri: string;
}): JsonObject {
  return {
    '@context': resource.context,
    '@id': resource.uri,
    '@graph': [resource.entity],
  };
}
