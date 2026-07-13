/**
 * Attach Almanakken v2 annual plantation observations to Gazetteer plantation
 * records. These are source-bound observations, not curated claims.
 *
 * Duplicate Gazetteer links for the same Wikidata QID are skipped by default so
 * the same evidence is not copied onto competing place records before review.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import type {
  AlmanakkenPlantationObservation,
  AlmanakkenPlantationRelation,
  AlmanakkenPopulationObservation,
  GazetteerPlace,
} from '../lib/types';
import { getPrimaryAuthorityLink } from '../lib/types';
import { almanakkenField, isVerlaten, readAlmanakkenRows } from './almanakken';

const DATA_DIR = join(__dirname, '../../data');
const GAZETTEER_PATH = join(DATA_DIR, 'places-gazetteer.jsonld');
const PUBLIC_GAZETTEER = join(
  __dirname,
  '../public/data/places-gazetteer.jsonld',
);
const SOURCE_ID = 'almanakken';
const INCLUDE_DUPLICATE_QIDS = process.argv.includes('--include-duplicate-qids');

function parseIntField(value: string): number | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/\s+/g, '').replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
}

function parseDecimalField(value: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value.replace(/\s+/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function compactObject<T extends object>(value: T): T | undefined {
  const result: Partial<T> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (item === undefined || item === null || item === '') continue;
    if (Array.isArray(item) && item.length === 0) continue;
    (result as Record<string, unknown>)[key] = item;
  }
  return Object.keys(result).length > 0 ? (result as T) : undefined;
}

function relation(qid: string, label: string): AlmanakkenPlantationRelation | null {
  if (!qid) return null;
  return compactObject({ qid, label }) ?? null;
}

function relationList(
  pairs: Array<[qid: string, label: string]>,
): AlmanakkenPlantationRelation[] | undefined {
  const relations = pairs
    .map(([qid, label]) => relation(qid, label))
    .filter((item): item is AlmanakkenPlantationRelation => Boolean(item));
  return relations.length > 0 ? relations : undefined;
}

function strings(...values: string[]): string[] | undefined {
  const unique = [...new Set(values.filter(Boolean))];
  return unique.length > 0 ? unique : undefined;
}

function population(row: Record<string, string>): AlmanakkenPopulationObservation | undefined {
  return compactObject({
    enslavedCount: parseIntField(almanakkenField(row, 'enslaved_norm')),
    enslavedOriginal: almanakkenField(row, 'slaven'),
    enslavedSharedWith: almanakkenField(row, 'enslaved_shared_with'),
    plantationMaleUnfreeResidents: parseIntField(
      almanakkenField(row, 'plantage_mannelijke_niet_vrije_bewoners'),
    ),
    plantationFemaleUnfreeResidents: parseIntField(
      almanakkenField(row, 'plantage_vrouwelijke_niet_vrije_bewoners'),
    ),
    plantationTotalUnfreeResidents: parseIntField(
      almanakkenField(row, 'plantage_totaal_niet_vrije_bewoners'),
    ),
    privateMaleUnfreeResidents: parseIntField(
      almanakkenField(row, 'privé_mannelijke_niet_vrije_bewoners'),
    ),
    privateFemaleUnfreeResidents: parseIntField(
      almanakkenField(row, 'privé_vrouwelijke_niet_vrije_bewoners'),
    ),
    privateTotalUnfreeResidents: parseIntField(
      almanakkenField(row, 'privé_totaal_niet_vrije_bewoners'),
    ),
    freeResidents: parseIntField(almanakkenField(row, 'vrije_bewoners')),
    totalResidents: parseIntField(almanakkenField(row, 'totaal_generaal_bewoners')),
    generalTotalEnslaved: parseIntField(
      almanakkenField(row, 'generaal_totaal_slaven'),
    ),
    enslavedFitForWorkPlantations: parseIntField(
      almanakkenField(row, 'generale_macht_slaven_geschikt_tot_werken_plantages'),
    ),
    enslavedFitForWorkPrivate: parseIntField(
      almanakkenField(row, 'generale_macht_slaven_geschikt_tot_werken_privé'),
    ),
    enslavedUnfitForWorkPlantations: parseIntField(
      almanakkenField(row, 'generale_macht_slaven_ongeschikt_tot_werken_plantages'),
    ),
    enslavedUnfitForWorkPrivate: parseIntField(
      almanakkenField(row, 'generale_macht_slaven_ongeschikt_tot_werken_privé'),
    ),
    enslavedOnPlantationsFitForWork: parseIntField(
      almanakkenField(row, 'totaal_slaven_op_de_plantages_aanwezig_geschikt_tot_werk'),
    ),
    enslavedOnPlantationsUnfitForWork: parseIntField(
      almanakkenField(row, 'totaal_slaven_op_de_plantages_aanwezig_ongeschikt_tot_werk'),
    ),
    freePlantationBoys: parseIntField(
      almanakkenField(row, 'vrije_personen_op_plantages_jongens'),
    ),
    freePlantationMen: parseIntField(
      almanakkenField(row, 'vrije_personen_op_plantages_mannen'),
    ),
    freePlantationGirls: parseIntField(
      almanakkenField(row, 'vrije_personen_op_plantages_meisjes'),
    ),
    freePlantationWomen: parseIntField(
      almanakkenField(row, 'vrije_personen_op_plantages_vrouwen'),
    ),
    freePlantationTotal: parseIntField(
      almanakkenField(row, 'vrije_personen_op_plantages_totaal'),
    ),
  });
}

function rawManagement(row: Record<string, string>) {
  return compactObject({
    administrators: almanakkenField(row, 'administrateurs'),
    directors: almanakkenField(row, 'directeuren'),
    owners: almanakkenField(row, 'eigenaren'),
    administratorsInEurope: almanakkenField(row, 'administrateurs_in_Europa'),
    administratorsInSuriname: almanakkenField(row, 'administrateurs_in_suriname'),
    blankOfficer: almanakkenField(row, 'blank-officier'),
  });
}

function buildObservation(row: Record<string, string>): AlmanakkenPlantationObservation | null {
  const recordId = almanakkenField(row, 'recordid');
  const qid = almanakkenField(row, 'plantation_id');
  if (!recordId || !qid) return null;

  const year = parseIntField(almanakkenField(row, 'year'));
  const observation: AlmanakkenPlantationObservation = {
    recordId,
    source: SOURCE_ID,
    sourceVersion: 'v2',
    qid,
    year,
    page: almanakkenField(row, 'page'),
    littera: almanakkenField(row, 'litt_std'),
    districtOrDivision: almanakkenField(row, 'district_of_divisie'),
    locationOriginal: almanakkenField(row, 'loc_org'),
    locationStandardized: almanakkenField(row, 'loc_std'),
    riverOrRoad: almanakkenField(row, 'river_or_road'),
    direction: almanakkenField(row, 'direction'),
    plantationOriginal: almanakkenField(row, 'plantation_org'),
    plantationStandardized: almanakkenField(row, 'plantation_std'),
    psurIds: strings(almanakkenField(row, 'psur_id'), almanakkenField(row, 'psur_id2')),
    hasParts: relationList([
      [almanakkenField(row, 'has_parts1_id'), almanakkenField(row, 'has_parts1_lab')],
      [almanakkenField(row, 'has_parts2_id'), almanakkenField(row, 'has_parts2_lab')],
      [almanakkenField(row, 'has_parts3_id'), almanakkenField(row, 'has_parts3_lab')],
      [almanakkenField(row, 'has_parts4_id'), almanakkenField(row, 'has_parts4_lab')],
    ]),
    partOf: relationList([
      [almanakkenField(row, 'part_of_id'), almanakkenField(row, 'part_of_lab')],
    ]),
    referenceOriginal: almanakkenField(row, 'reference_org'),
    ownedBy: relationList([
      [almanakkenField(row, 'owned_by_id'), almanakkenField(row, 'owned_by_lab')],
      [almanakkenField(row, 'owned_by_id2'), almanakkenField(row, 'owned_by_lab')],
    ]),
    sizeAkkers: parseDecimalField(almanakkenField(row, 'size_std')),
    product: almanakkenField(row, 'product_std'),
    function: almanakkenField(row, 'function'),
    additionalInfo: almanakkenField(row, 'additional_info'),
    deserted: isVerlaten(almanakkenField(row, 'deserted')) || undefined,
    lot: almanakkenField(row, 'lot'),
    sranantongoName: almanakkenField(row, 'sranantongo_naam'),
    population: population(row),
    mill: compactObject({
      type: almanakkenField(row, 'soort_van_molen'),
      steam: almanakkenField(row, 'werktuig_stoom'),
      water: almanakkenField(row, 'werktuig_water'),
    }),
    rawManagement: rawManagement(row),
  };

  return compactObject(observation) ?? null;
}

console.log('Reading Almanakken v2 observations...');
const { version, rows } = readAlmanakkenRows();
if (version !== 'v2') {
  console.error('Error: Almanakken v2 CSV is required for materialized observations.');
  process.exit(1);
}

const byQid = new Map<string, AlmanakkenPlantationObservation[]>();
for (const row of rows) {
  const observation = buildObservation(row);
  if (!observation) continue;
  const list = byQid.get(observation.qid) ?? [];
  list.push(observation);
  byQid.set(observation.qid, list);
}

for (const list of byQid.values()) {
  list.sort((a, b) => {
    const yearDelta = (a.year ?? 0) - (b.year ?? 0);
    return yearDelta || a.recordId.localeCompare(b.recordId);
  });
}

console.log(
  `  ${[...byQid.values()].reduce((sum, list) => sum + list.length, 0)} observations across ${byQid.size} QIDs`,
);

console.log('Reading gazetteer...');
const gazetteerRaw = readFileSync(GAZETTEER_PATH, 'utf-8');
const gazetteerJsonld = JSON.parse(gazetteerRaw) as { '@graph'?: GazetteerPlace[] };
const graph = gazetteerJsonld['@graph'] ?? [];

const activePlaceCountByQid = new Map<string, number>();
for (const entry of graph) {
  if (entry.type !== 'plantation' || entry.deprecated || entry.mergedInto) continue;
  const qid = getPrimaryAuthorityLink(entry, 'wikidata')?.identifier;
  if (!qid) continue;
  activePlaceCountByQid.set(qid, (activePlaceCountByQid.get(qid) ?? 0) + 1);
}

let cleared = 0;
let patched = 0;
let observationsPatched = 0;
let duplicateQidSkipped = 0;
let noMatch = 0;

for (const entry of graph) {
  if (entry.type !== 'plantation') continue;
  if (entry.almanakkenObservations?.length) cleared++;
  delete entry.almanakkenObservations;

  const qid = getPrimaryAuthorityLink(entry, 'wikidata')?.identifier;
  if (!qid) {
    noMatch++;
    continue;
  }

  const observations = byQid.get(qid);
  if (!observations?.length) {
    noMatch++;
    continue;
  }

  if (!INCLUDE_DUPLICATE_QIDS && (activePlaceCountByQid.get(qid) ?? 0) > 1) {
    duplicateQidSkipped++;
    continue;
  }

  entry.almanakkenObservations = observations;
  patched++;
  observationsPatched += observations.length;
}

console.log(
  `  Patched ${patched} places with ${observationsPatched} observations. Cleared stale field on ${cleared} places.`,
);
console.log(
  `  Skipped duplicate QIDs: ${duplicateQidSkipped}  No almanakken match: ${noMatch}`,
);

const outStr = JSON.stringify(gazetteerJsonld, null, 2);
writeFileSync(GAZETTEER_PATH, outStr, 'utf-8');
mkdirSync(dirname(PUBLIC_GAZETTEER), { recursive: true });
writeFileSync(PUBLIC_GAZETTEER, outStr, 'utf-8');
console.log(`  Wrote ${GAZETTEER_PATH}`);
console.log(`  Wrote public copy: ${PUBLIC_GAZETTEER}`);
