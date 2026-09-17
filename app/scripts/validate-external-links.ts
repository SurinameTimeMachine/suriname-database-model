import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import jsonld from 'jsonld';

const wikidataEntity = /^https?:\/\/www\.wikidata\.org\/entity\/(Q\d+)$/;
const CANONICAL_HOST = 'data.surinametijdmachine.org';
const vocabularyHosts = new Set(['www.w3.org', 'www.opengis.net']);
const USER_AGENT = 'SurinameTimeMachine-LOD-validator/1.0';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function fetchWithRetry(url: string | URL, init: RequestInit) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await fetch(url, init);
    if (response.status !== 429 && response.status < 500) return response;
    await response.body?.cancel();
    const retryAfter = Number(response.headers.get('retry-after'));
    const delay = Number.isFinite(retryAfter)
      ? retryAfter * 1_000
      : Math.min(1_000 * 2 ** attempt, 30_000);
    await sleep(delay);
  }
  throw new Error(`Repeated throttling or server errors while fetching ${url}`);
}

function collectResourceIris(value: unknown, iris: Set<string>) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectResourceIris(item, iris));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (key === '@id' && typeof child === 'string' && /^https?:\/\//.test(child)) {
      iris.add(child);
    } else if (key !== '@type') {
      collectResourceIris(child, iris);
    }
  }
}

async function validateWikidata(qids: Set<string>) {
  const missing: string[] = [];
  for (const batch of chunks([...qids].sort(), 50)) {
    const url = new URL('https://www.wikidata.org/w/api.php');
    url.search = new URLSearchParams({
      action: 'wbgetentities',
      format: 'json',
      formatversion: '2',
      ids: batch.join('|'),
      props: 'info',
    }).toString();
    const response = await fetchWithRetry(url, {
      headers: {
        'Api-User-Agent': USER_AGENT,
        'User-Agent': USER_AGENT,
      },
    });
    assert(response.ok, `Wikidata API returned HTTP ${response.status}`);
    const payload = (await response.json()) as {
      entities?: Record<string, { missing?: boolean }>;
    };
    for (const qid of batch) {
      if (!payload.entities?.[qid] || payload.entities[qid].missing) missing.push(qid);
    }
    await sleep(300);
  }
  assert(missing.length === 0, `Missing Wikidata entities: ${missing.join(', ')}`);
}

async function validateUrl(uri: string) {
  const response = await fetch(uri, {
    headers: {
      Accept: 'application/ld+json, application/json;q=0.9, text/html;q=0.8',
      'User-Agent': USER_AGENT,
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  });
  assert(response.ok, `${uri} returned HTTP ${response.status}`);
  if (/\/(info\.json|manifest)$/.test(new URL(uri).pathname)) {
    assert(
      response.headers.get('content-type')?.includes('json'),
      `${uri} returned ${response.headers.get('content-type')}, expected JSON`,
    );
  }
  await response.body?.cancel();
}

async function main() {
  const database = JSON.parse(
    readFileSync(join(process.cwd(), 'public/data/database.jsonld'), 'utf-8'),
  );
  const gazetteer = JSON.parse(
    readFileSync(join(process.cwd(), '../data/places-gazetteer.jsonld'), 'utf-8'),
  ) as {
    '@graph': Array<{
      externalLinks?: Array<{ authority: string; identifier: string }>;
    }>;
  };
  const expanded = await jsonld.expand(database);
  const resourceIris = new Set<string>();
  collectResourceIris(expanded, resourceIris);

  const qids = new Set<string>();
  const externalUrls = new Set<string>();
  for (const iri of resourceIris) {
    const wikidata = iri.match(wikidataEntity);
    if (wikidata) {
      qids.add(wikidata[1]);
      continue;
    }
    const host = new URL(iri).host;
    if (host !== CANONICAL_HOST && !vocabularyHosts.has(host)) {
      externalUrls.add(iri);
    }
  }
  for (const entry of gazetteer['@graph']) {
    for (const link of entry.externalLinks ?? []) {
      assert(link.authority === 'wikidata', `Unsupported authority: ${link.authority}`);
      assert(/^Q\d+$/.test(link.identifier), `Invalid Wikidata QID: ${link.identifier}`);
      qids.add(link.identifier);
    }
  }

  await validateWikidata(qids);
  await Promise.all([...externalUrls].sort().map(validateUrl));
  console.log(
    `External links OK: ${qids.size} unique Wikidata entities and ${externalUrls.size} source/IIIF URLs are retrievable.`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
