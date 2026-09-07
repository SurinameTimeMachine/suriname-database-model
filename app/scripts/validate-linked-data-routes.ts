import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const serverBase = (process.env.LINKED_DATA_BASE_URL ?? 'http://127.0.0.1:3000').replace(
  /\/$/,
  '',
);
const canonicalBase = 'https://data.surinametijdmachine.org/';

type Entity = Record<string, unknown> & { '@id': string };
type Database = { '@id': string; '@graph': Entity[] };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function values(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function pathFor(uri: string): string {
  assert(uri.startsWith(canonicalBase), `Non-canonical STM URI: ${uri}`);
  return uri.slice(canonicalBase.length);
}

async function expectRepresentation(
  path: string,
  expectedCanonicalId: string,
  contentType: string,
  accept?: string,
  expectedBodyId = expectedCanonicalId,
) {
  const response = await fetch(`${serverBase}/${path}`, {
    headers: accept ? { Accept: accept } : undefined,
    redirect: 'manual',
  });
  assert(response.status === 200, `${path} returned HTTP ${response.status}`);
  assert(
    response.headers.get('content-type')?.includes(contentType),
    `${path} returned ${response.headers.get('content-type')}, expected ${contentType}`,
  );
  assert(
    response.headers
      .get('link')
      ?.includes(`<${expectedCanonicalId}>; rel="canonical"`),
    `${path} has no canonical Link header for ${expectedCanonicalId}`,
  );
  const body = (await response.json()) as Record<string, unknown>;
  const recordUrl =
    typeof body.recordUrl === 'string' && body.recordUrl.startsWith('/')
      ? new URL(body.recordUrl, canonicalBase).href
      : body.recordUrl;
  const ids = [
    body['@id'],
    body.id,
    recordUrl,
    ...(Array.isArray(body['@graph'])
      ? body['@graph'].map((entity) => (entity as Entity)['@id'])
      : []),
  ];
  assert(
    ids.includes(expectedBodyId),
    `${path} does not describe ${expectedBodyId}`,
  );
}

async function expectReadableVocabularyProfile(
  path = 'vocabulary/place-type/plantation.jsonld',
) {
  const expectedId = `${canonicalBase}vocabulary/place-type/plantation`;
  const response = await fetch(`${serverBase}/${path}`, { redirect: 'manual' });
  assert(response.status === 200, `${path} returned HTTP ${response.status}`);
  assert(
    response.headers.get('content-type')?.includes('application/ld+json'),
    `${path} did not return JSON-LD`,
  );
  assert(
    response.headers
      .get('link')
      ?.includes(`${expectedId}.jsonld?profile=complete`),
    `${path} does not advertise its complete profile`,
  );
  const body = (await response.json()) as Record<string, unknown>;
  assert(body.id === expectedId, `${path} changed the canonical concept id`);
  assert(
    values(body.type).includes('Concept'),
    `${path} is not a readable Concept object`,
  );
  assert(
    typeof body._label === 'string' &&
      values(body.prefLabel).length > 0 &&
      values(body.definition).length > 0 &&
      values(body.editorialNote).length > 0,
    `${path} lost its label, definition, or editorial note`,
  );
}

async function expectReadablePlaceProfile(
  placeId: string,
  path = `place/${placeId}.jsonld`,
) {
  const placeUri = `${canonicalBase}place/${placeId}#location`;
  const response = await fetch(`${serverBase}/${path}`, { redirect: 'manual' });
  assert(response.status === 200, `${path} returned HTTP ${response.status}`);
  assert(
    response.headers.get('content-type')?.includes('application/ld+json'),
    `${path} did not return JSON-LD`,
  );
  assert(
    response.headers
      .get('link')
      ?.includes(
        `${canonicalBase}place/${placeId}.jsonld?profile=complete`,
      ),
    `${path} does not advertise its complete profile`,
  );
  const body = (await response.json()) as Record<string, unknown>;
  assert(body.id === placeUri, `${path} changed the canonical Place id`);
  assert(body.type === 'Place', `${path} is not a readable Place object`);
  assert(!('@graph' in body), `${path} returned an @graph wrapper`);
  assert(
    typeof body._label === 'string' &&
      values(body.classified_as).length > 0 &&
      values(body.identified_by).length > 0,
    `${path} lost its label, structural type, or identifiers`,
  );
}

async function main() {
  const database = JSON.parse(
    readFileSync(join(process.cwd(), 'public/data/database.jsonld'), 'utf-8'),
  ) as Database;
  const samples = new Map<string, Entity>();
  for (const entity of database['@graph']) {
    const path = pathFor(entity['@id']);
    const prefix = path.split('/')[0];
    if (!samples.has(prefix)) samples.set(prefix, entity);
  }
  samples.set('database', { '@id': database['@id'] });

  for (const expectedId of [
    `${canonicalBase}vocabulary/place-type/plantation`,
    `${canonicalBase}vocabulary/place-function/koffie`,
  ]) {
    samples.set(expectedId, { '@id': expectedId });
  }

  const recordIndex = JSON.parse(
    readFileSync(join(process.cwd(), 'public/data/place-records/index.json'), 'utf-8'),
  ) as Array<{ id: string }>;
  const placeId = recordIndex[0]?.id;
  assert(placeId, 'No authority record available for route validation');
  await expectReadablePlaceProfile(placeId);
  await expectReadablePlaceProfile(
    placeId,
    `place/${placeId}.jsonld?profile=globalise`,
  );

  for (const entity of samples.values()) {
    const path = pathFor(entity['@id']);
    const html = await fetch(`${serverBase}/${path}`, { redirect: 'manual' });
    assert(html.status === 200, `${path} HTML returned HTTP ${html.status}`);
    assert(
      html.headers.get('content-type')?.includes('text/html'),
      `${path} HTML returned ${html.headers.get('content-type')}`,
    );
    await html.body?.cancel();

    await expectRepresentation(
      path,
      entity['@id'],
      'application/ld+json',
      'application/ld+json',
    );
    await expectRepresentation(`${path}.jsonld`, entity['@id'], 'application/ld+json');
    await expectRepresentation(`${path}.json`, entity['@id'], 'application/json');
  }

  const placeUri = `${canonicalBase}place/${placeId}`;
  const locationUri = `${placeUri}#location`;
  await expectRepresentation(
    `place/${placeId}`,
    placeUri,
    'application/ld+json',
    'application/ld+json',
    locationUri,
  );
  await expectRepresentation(
    `place/${placeId}.jsonld`,
    placeUri,
    'application/ld+json',
    undefined,
    locationUri,
  );
  await expectRepresentation(
    `place/${placeId}.jsonld?profile=complete`,
    placeUri,
    'application/ld+json',
  );
  await expectRepresentation(`place/${placeId}.json`, placeUri, 'application/json');
  await expectReadableVocabularyProfile();
  await expectReadableVocabularyProfile(
    'vocabulary/place-type/plantation.jsonld?profile=globalise',
  );
  await expectRepresentation(
    'vocabulary/place-type/plantation.jsonld?profile=complete',
    `${canonicalBase}vocabulary/place-type/plantation`,
    'application/ld+json',
  );

  const missing = await fetch(`${serverBase}/type/not-a-real-resource`);
  assert(missing.status === 404, `Unknown resource returned HTTP ${missing.status}`);

  console.log(
    `Linked-data routes OK at ${serverBase}: ${samples.size} resource families and place authority records serve HTML, readable JSON-LD, complete JSON-LD, application JSON, Accept negotiation, and legacy GLOBALISE aliases.`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
