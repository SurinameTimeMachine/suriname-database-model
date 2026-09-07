/**
 * One-off import: snapshot Rijksmuseum collection images that depict a
 * plantation we track (matched by wikidata Q-ID, restricted to plantations
 * that have a PSUR id).
 *
 * This is NOT part of `pnpm pipeline` -- it reads from a sibling repository
 * checkout (rijksmuseum-suriname-collection) that only exists on a
 * contributor's machine, not in CI/Vercel. Run manually when that repo's
 * `data/collection.json` has new curated location links, then commit the
 * resulting `data/rijksmuseum-images.jsonld` snapshot.
 *
 * Run with: npx tsx scripts/import-rijksmuseum-images.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const SIBLING_REPO_COLLECTION = join(
  __dirname,
  '../../../../rijksmuseum/rijksmuseum-suriname-collection/data/collection.json',
);
const ORGANIZATIONS_PATH = join(__dirname, '../public/data/organizations.json');
const OUT_PATH = join(__dirname, '../../data/rijksmuseum-images.jsonld');

const STM = 'https://data.surinametijdmachine.org/';

interface GeoKeywordDetail {
  wikidataUri: string | null;
}

interface CollectionObject {
  recordnummer: number;
  objectnummer: string;
  titles: string[];
  year: number | null;
  geoKeywordDetails: GeoKeywordDetail[];
  pidWork: string;
  pidData: string;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  hasImage: boolean;
  isPublicDomain: boolean;
  license: string | null;
  licenseLabel: string | null;
}

function main() {
  if (!existsSync(SIBLING_REPO_COLLECTION)) {
    throw new Error(
      `Sibling repo collection.json not found at ${SIBLING_REPO_COLLECTION}. This script must be run on a machine with a checkout of rijksmuseum-suriname-collection next to this repo.`,
    );
  }
  const organizations = JSON.parse(
    readFileSync(ORGANIZATIONS_PATH, 'utf-8'),
  ) as Record<string, Record<string, unknown>>;
  const psurQids = new Set<string>();
  for (const uri of Object.keys(organizations)) {
    if (organizations[uri].psurId) psurQids.add(uri.split('/').pop()!);
  }
  console.log(`Restricting to ${psurQids.size} plantations with a PSUR id`);

  const collection = JSON.parse(
    readFileSync(SIBLING_REPO_COLLECTION, 'utf-8'),
  ) as CollectionObject[];
  console.log(`Loaded ${collection.length} Rijksmuseum objects`);

  const graph: Record<string, unknown>[] = [];
  let matched = 0;
  for (const object of collection) {
    const qid = object.geoKeywordDetails
      .map((detail) => detail.wikidataUri?.split('/').pop())
      .find((candidate) => candidate && psurQids.has(candidate));
    if (!qid) continue;
    matched++;
    graph.push({
      '@id': `${STM}rijksmuseum-image/${object.objectnummer}`,
      '@type': ['E36_Visual_Item'],
      prefLabel: object.titles[0] ?? object.objectnummer,
      P138_represents: `${STM}organization/${qid}`,
      hadPrimarySource: `${STM}source/rijksmuseum-collection`,
      objectNumber: object.objectnummer,
      year: object.year,
      thumbnailUrl: object.thumbnailUrl,
      contentUrl: object.imageUrl,
      sameAs: object.pidWork || object.pidData,
      isPublicDomain: object.isPublicDomain,
      license: object.license,
      licenseLabel: object.licenseLabel,
    });
  }
  console.log(`Matched ${matched} images to ${psurQids.size} candidate plantations`);

  const document = {
    '@id': `${STM}database/rijksmuseum-images`,
    '@type': 'sdo:Dataset',
    'sdo:name': 'Rijksmuseum images depicting tracked plantations',
    'sdo:description':
      'Static snapshot of Rijksmuseum collection objects (rijksmuseum-suriname-collection) matched by wikidata Q-ID to plantations with a PSUR id. Re-run scripts/import-rijksmuseum-images.ts to refresh.',
    'sdo:dateModified': new Date().toISOString(),
    '@graph': graph,
  };
  writeFileSync(OUT_PATH, `${JSON.stringify(document, null, 2)}\n`, 'utf-8');
  console.log(`Wrote ${OUT_PATH} (${graph.length} images)`);
}

main();
