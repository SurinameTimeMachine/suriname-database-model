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
 * Data model (CIDOC-CRM):
 *   E22 Source (the Rijksmuseum collection record) --P128 carries-->
 *   E36 Visual Item (the image/work) --P138 represents-->
 *   E25 Plantation (the depicted physical plantation).
 * The organization (E74) grouping served to the UI is a derived index
 * built in `prepare-data.ts` via the E25's `hasOrganizationalAssociation`
 * link -- it is not part of the stored snapshot model.
 *
 * Run with: npx tsx scripts/import-rijksmuseum-images.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SIBLING_REPO_COLLECTION = join(
  __dirname,
  '../../../../rijksmuseum/rijksmuseum-suriname-collection/data/collection.json',
);
const ORGANIZATIONS_PATH = join(__dirname, '../public/data/organizations.json');
const OUT_PATH = join(__dirname, '../../data/rijksmuseum-images.jsonld');

const STM = 'https://data.surinametijdmachine.org/';
const SOURCE_URI = `${STM}source/rijksmuseum-collection`;

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
  if (!existsSync(ORGANIZATIONS_PATH)) {
    throw new Error(
      `Organizations index not found at ${ORGANIZATIONS_PATH}. Run \`pnpm pipeline\` (or at least \`pnpm prepare-data\`) first so public/data/organizations.json exists.`,
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
      '@type': ['E36_Visual_Item', 'sdo:ImageObject'],
      // E22 Source (collection record) -> P128 carries -> E36 Visual Item
      //   -> P138 represents -> E25 Plantation (by wikidata Q-ID match).
      P128i_is_carried_by: SOURCE_URI,
      P138_represents: `${STM}plantation/${qid.toLowerCase()}`,
      depictedOrganization: `${STM}organization/${qid}`,
      hadPrimarySource: SOURCE_URI,
      prefLabel: object.titles[0] ?? object.objectnummer,
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
    '@context': {
      crm: 'http://www.cidoc-crm.org/cidoc-crm/',
      sdo: 'https://schema.org/',
      stm: STM,
      prefLabel: 'skos:prefLabel',
      P128i_is_carried_by: { '@id': 'crm:P128i_is_carried_by', '@type': '@id' },
      P138_represents: { '@id': 'crm:P138_represents', '@type': '@id' },
      depictedOrganization: { '@id': 'stm:depictedOrganization', '@type': '@id' },
      hadPrimarySource: { '@id': 'prov:hadPrimarySource', '@type': '@id' },
      objectNumber: 'stm:objectNumber',
      year: { '@id': 'dct:date', '@type': 'xsd:gYear' },
      thumbnailUrl: { '@id': 'sdo:thumbnailUrl', '@type': '@id' },
      contentUrl: { '@id': 'sdo:contentUrl', '@type': '@id' },
      sameAs: { '@id': 'sdo:sameAs', '@type': '@id' },
      isPublicDomain: 'stm:isPublicDomain',
      license: { '@id': 'dct:license', '@type': '@id' },
      licenseLabel: 'stm:licenseLabel',
      skos: 'http://www.w3.org/2004/02/skos/core#',
      dct: 'http://purl.org/dc/terms/',
      prov: 'http://www.w3.org/ns/prov#',
      xsd: 'http://www.w3.org/2001/XMLSchema#',
    },
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
