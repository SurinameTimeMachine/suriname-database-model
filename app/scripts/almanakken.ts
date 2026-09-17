import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse } from 'csv-parse/sync';

export const ALMANAKKEN_VERSION = 'v2' as const;
export const ALMANAKKEN_V2_COLUMNS = [
  'recordid',
  'id',
  'year',
  'page',
  'litt_std',
  'district_of_divisie',
  'loc_org',
  'loc_std',
  'river_or_road',
  'direction',
  'plantation_std',
  'plantation_org',
  'plantation_id',
  'psur_id',
  'psur_id2',
  'has_parts1_lab',
  'has_parts1_id',
  'has_parts2_lab',
  'has_parts2_id',
  'has_parts3_lab',
  'has_parts3_id',
  'has_parts4_lab',
  'has_parts4_id',
  'part_of_lab',
  'part_of_id',
  'reference_org',
  'owned_by_lab',
  'owned_by_id',
  'owned_by_id2',
  'size_std',
  'product_std',
  'enslaved_norm',
  'enslaved_shared_with',
  'function',
  'additional_info',
  'deserted',
  'lot',
  'administrateurs',
  'directeuren',
  'eigenaren',
  'administrateurs_in_Europa',
  'administrateurs_in_suriname',
  'blank-officier',
  'slaven',
  'sranantongo_naam',
  'plantage_mannelijke_niet_vrije_bewoners',
  'plantage_totaal_niet_vrije_bewoners',
  'plantage_vrouwelijke_niet_vrije_bewoners',
  'privé_mannelijke_niet_vrije_bewoners',
  'privé_totaal_niet_vrije_bewoners',
  'privé_vrouwelijke_niet_vrije_bewoners',
  'soort_van_molen',
  'totaal_generaal_bewoners',
  'vrije_bewoners',
  'generaal_totaal_slaven',
  'generale_macht_slaven_geschikt_tot_werken_plantages',
  'generale_macht_slaven_geschikt_tot_werken_privé',
  'generale_macht_slaven_ongeschikt_tot_werken_plantages',
  'generale_macht_slaven_ongeschikt_tot_werken_privé',
  'totaal_slaven_op_de_plantages_aanwezig_geschikt_tot_werk',
  'totaal_slaven_op_de_plantages_aanwezig_ongeschikt_tot_werk',
  'vrije_personen_op_plantages_jongens',
  'vrije_personen_op_plantages_mannen',
  'vrije_personen_op_plantages_meisjes',
  'vrije_personen_op_plantages_vrouwen',
  'vrije_personen_op_plantages_totaal',
  'werktuig_stoom',
  'werktuig_water',
] as const;

export type AlmanakkenV2Column = (typeof ALMANAKKEN_V2_COLUMNS)[number];
export type AlmanakkenRow = Record<AlmanakkenV2Column, string>;

const DATA_DIR = join(__dirname, '../..', 'data');
const ALMANAKKEN_V2_CSV = join(
  DATA_DIR,
  '06-almanakken - Plantations Surinaamse Almanakken',
  'Plantations Surinaamse Almanakken v2.0 (1).csv',
);

function readCsvRows(path: string): AlmanakkenRow[] {
  const csv = new TextDecoder('utf-8', { fatal: true })
    .decode(readFileSync(path))
    .replace(/^\uFEFF/, '');
  const rows = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    delimiter: ';',
    trim: true,
  }) as AlmanakkenRow[];

  if (rows.length === 0) throw new Error('Almanakken v2 CSV has no data rows.');
  const actualColumns = Object.keys(rows[0]);
  const expectedColumns = new Set<string>(ALMANAKKEN_V2_COLUMNS);
  const missing = ALMANAKKEN_V2_COLUMNS.filter(
    (column) => !actualColumns.includes(column),
  );
  const unexpected = actualColumns.filter((column) => !expectedColumns.has(column));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `Almanakken v2 schema mismatch. Missing: ${missing.join(', ') || 'none'}. Unexpected: ${unexpected.join(', ') || 'none'}.`,
    );
  }

  return rows;
}

export function readAlmanakkenRows(): {
  path: string;
  version: typeof ALMANAKKEN_VERSION;
  rows: AlmanakkenRow[];
} {
  return {
    path: ALMANAKKEN_V2_CSV,
    version: ALMANAKKEN_VERSION,
    rows: readCsvRows(ALMANAKKEN_V2_CSV),
  };
}

export function almanakkenField(
  row: Partial<AlmanakkenRow>,
  ...keys: AlmanakkenV2Column[]
): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function isVerlaten(value: string | undefined): boolean {
  return (value ?? '').trim().toLowerCase() === 'verlaten';
}
