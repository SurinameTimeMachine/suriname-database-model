import { parse } from 'csv-parse/sync';
/**
 * Transform the Slave and Emancipation Registers CSV into CIDOC-CRM + PICO
 * entity arrays.
 *
 * Reads:
 *   data/01-plantages-dataset .../Suriname Plantation Dataset Version 1.0.csv
 *     (ID_plantation <-> Name_plantation, the PSUR anchor table)
 *   data/05-slave-emancipation .../Dataset Suriname Slave and Emancipation
 *     Registers Version 1.1.csv (95,388 rows, ~55MB)
 *
 * Model: `Id_person` is already the resolved PICO PersonReconstruction
 * identity in the source dataset (multiple rows per Id_person are distinct
 * PersonObservations with different Start/EndEntry spans) -- no person-level
 * deduplication is performed here, only plantation-name -> PSUR matching.
 *
 * The register only carries a free-text plantation name (no PSUR id), so
 * each observation is matched against the Plantagen dataset's
 * Name_plantation column by normalized string. Unresolved rows keep their
 * raw plantation text but no `psurId`. generate-database.ts resolves
 * `psurId` -> wikidata qid -> local E74 organization URI using the already
 * generated E25 plantation rows (see transform-plantations.ts).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const BASE_DIR = join(__dirname, '../..');
const PLANTAGEN_CSV = join(
  BASE_DIR,
  'data/01-plantages-dataset - Suriname Plantation Dataset Version 1.0/Suriname Plantation Dataset Version 1.0.csv',
);
const REGISTER_CSV = join(
  BASE_DIR,
  'data/05-slave-emancipation - Suriname Slave and Emancipation Registers Dataset Version 1.1/Dataset Suriname Slave and Emancipation Registers Version 1.1.csv',
);

const STM = 'https://data.surinametijdmachine.org/';

/**
 * Register plantation-name spellings that do not normalize to a match in the
 * Plantagen dataset. Populate from the `unmatchedPlantationNames` report
 * (run `tsx scripts/transform-persons.ts` standalone) after manual review,
 * mirroring VERIFIED_NAME_TRANSCRIPTIONS in transform-plantations.ts.
 */
const PLANTATION_NAME_OVERRIDES: Record<string, string> = {};

// --- Types ---

export interface E21Row {
  uri: string;
  idPerson: string;
  prefLabel: string;
  sex: string;
  dayBirth: string;
  monthBirth: string;
  yearBirth: string;
  dayDeath: string;
  monthDeath: string;
  yearDeath: string;
  nameMother: string;
}

export interface PersonObservationRow {
  uri: string;
  personUri: string;
  idPerson: string;
  idSource: string;
  nameEnslaved: string;
  sex: string;
  age: string;
  plantationText: string;
  psurId: string;
  ownerName: string;
  startDay: string;
  startMonth: string;
  startYear: string;
  startEvent: string;
  startInfo: string;
  endDay: string;
  endMonth: string;
  endYear: string;
  endEvent: string;
  endEventDetailed: string;
  endInfo: string;
  registerType: string;
  inventoryNumber: string;
  folioNumber: string;
  sourceUri: string;
}

export interface PersonTransformResult {
  e21: E21Row[];
  observations: PersonObservationRow[];
  unmatchedPlantationNames: Array<{ name: string; count: number }>;
}

// --- Helpers ---

function normalizePlantationName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^plantage\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function buildPlantationNameIndex(): Map<string, string> {
  const csv = readFileSync(PLANTAGEN_CSV, 'utf-8');
  const rows: Record<string, string>[] = parse(csv, {
    columns: true,
    delimiter: ',',
    skip_empty_lines: true,
  });
  const index = new Map<string, string>();
  for (const row of rows) {
    const psurId = (row.ID_plantation ?? '').trim();
    const name = (row.Name_plantation ?? '').trim();
    if (!psurId || !name) continue;
    index.set(normalizePlantationName(name), psurId);
  }
  return index;
}

// --- Main ---

export function transformPersons(): PersonTransformResult {
  const plantationIndex = buildPlantationNameIndex();
  console.log(
    `Loaded ${plantationIndex.size} plantation names from Plantagen dataset`,
  );

  const csv = readFileSync(REGISTER_CSV, 'utf-8');
  const rows: Record<string, string>[] = parse(csv, {
    columns: true,
    delimiter: ',',
    skip_empty_lines: true,
  });
  console.log(`Loaded ${rows.length} rows from slave & emancipation register`);

  const e21ByIdPerson = new Map<string, E21Row>();
  const observations: PersonObservationRow[] = [];
  const unmatchedCounts = new Map<string, number>();

  let obsIndex = 0;
  for (const row of rows) {
    const idPerson = (row.Id_person ?? '').trim();
    if (!idPerson) continue;
    const personUri = `${STM}person/${idPerson}`;

    if (!e21ByIdPerson.has(idPerson)) {
      const name =
        (row.Name_enslaved ?? '').trim() ||
        [row.First_name, row.Family_name].filter(Boolean).join(' ').trim() ||
        (row.Baptized_name ?? '').trim();
      e21ByIdPerson.set(idPerson, {
        uri: personUri,
        idPerson,
        prefLabel: name,
        sex: (row.Sex ?? '').trim(),
        dayBirth: (row.Day_birth ?? '').trim(),
        monthBirth: (row.Month_birth ?? '').trim(),
        yearBirth: (row.Year_birth ?? '').trim(),
        dayDeath: (row.Day_death ?? '').trim(),
        monthDeath: (row.Month_death ?? '').trim(),
        yearDeath: (row.Year_death ?? '').trim(),
        nameMother: (row.Name_mother ?? '').trim(),
      });
    }

    const plantationText = (row.Plantation ?? '').trim();
    let psurId = '';
    if (plantationText) {
      const normalized = normalizePlantationName(plantationText);
      psurId =
        PLANTATION_NAME_OVERRIDES[normalized] ??
        plantationIndex.get(normalized) ??
        '';
      if (!psurId) {
        unmatchedCounts.set(
          plantationText,
          (unmatchedCounts.get(plantationText) ?? 0) + 1,
        );
      }
    }

    obsIndex += 1;
    observations.push({
      uri: `${STM}person-observation/${idPerson}-${obsIndex}`,
      personUri,
      idPerson,
      idSource: (row.Id_source ?? '').trim(),
      nameEnslaved: (row.Name_enslaved ?? '').trim(),
      sex: (row.Sex ?? '').trim(),
      age: (row.Age ?? '').trim(),
      plantationText,
      psurId,
      ownerName: (row.Name_owner ?? '').trim(),
      startDay: (row.StartEntryDay ?? '').trim(),
      startMonth: (row.StartEntryMonth ?? '').trim(),
      startYear: (row.StartEntryYear ?? '').trim(),
      startEvent: (row.StartEntryEvent ?? '').trim(),
      startInfo: (row.StartEntryInfo ?? '').trim(),
      endDay: (row.EndEntryDay ?? '').trim(),
      endMonth: (row.EndEntryMonth ?? '').trim(),
      endYear: (row.EndEntryYear ?? '').trim(),
      endEvent: (row.EndEntryEvent ?? '').trim(),
      endEventDetailed: (row.EndEntryEventDetailed ?? '').trim(),
      endInfo: (row.EndEntryInfo ?? '').trim(),
      registerType: (row.Typeregister ?? '').trim(),
      inventoryNumber: (row.Inventory_number ?? '').trim(),
      folioNumber: (row.Folio_number ?? '').trim(),
      sourceUri: `${STM}source/slave-registers`,
    });
  }

  const unmatchedPlantationNames = [...unmatchedCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const e21 = [...e21ByIdPerson.values()];
  const resolvedCount = observations.filter((o) => o.psurId).length;

  console.log(`  E21 Persons:                ${e21.length}`);
  console.log(`  Person Observations:        ${observations.length}`);
  console.log(
    `  Resolved plantation links:  ${resolvedCount}/${observations.length}`,
  );
  console.log(
    `  Distinct unmatched names:   ${unmatchedPlantationNames.length}`,
  );

  return { e21, observations, unmatchedPlantationNames };
}

// Run standalone
if (require.main === module) {
  console.log('=== Person Data Transformation ===\n');
  const result = transformPersons();
  if (result.unmatchedPlantationNames.length > 0) {
    console.log('\nTop unmatched plantation names:');
    for (const { name, count } of result.unmatchedPlantationNames.slice(
      0,
      30,
    )) {
      console.log(`  ${count.toString().padStart(6)}  ${name}`);
    }
  }
  console.log('\n=== Done ===');
}
