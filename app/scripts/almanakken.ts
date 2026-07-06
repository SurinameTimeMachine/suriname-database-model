import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { parse } from 'csv-parse/sync';

export type AlmanakkenCsvVersion = 'v1' | 'v2' | 'v1+v2';
export type AlmanakkenRow = Record<string, string>;

const DATA_DIR = join(__dirname, '../..', 'data');
const ALMANAKKEN_DIR = join(
  DATA_DIR,
  '06-almanakken - Plantations Surinaamse Almanakken',
);
const V2_CSV = join(
  ALMANAKKEN_DIR,
  'Plantations Surinaamse Almanakken v2.0 (1).csv',
);
const V1_CSV = join(
  ALMANAKKEN_DIR,
  'Plantations Surinaamse Almanakken v1.0.csv',
);

function decodeCsv(filePath: string, version: AlmanakkenCsvVersion): string {
  const buf = readFileSync(filePath);
  const text =
    version === 'v2'
      ? new TextDecoder('utf-8').decode(buf)
      : new TextDecoder('latin1').decode(buf);
  return text.replace(/^\uFEFF/, '');
}

export function getAlmanakkenSourcePath(): {
  path: string;
  version: Exclude<AlmanakkenCsvVersion, 'v1+v2'>;
} {
  if (existsSync(V2_CSV)) return { path: V2_CSV, version: 'v2' };
  return { path: V1_CSV, version: 'v1' };
}

export function readAlmanakkenRows(): {
  path: string;
  version: AlmanakkenCsvVersion;
  rows: AlmanakkenRow[];
} {
  if (existsSync(V1_CSV) && existsSync(V2_CSV)) {
    const v1Rows = readAlmanakkenVersionRows('v1');
    const v2Rows = readAlmanakkenVersionRows('v2');
    const byRecordId = new Map<string, AlmanakkenRow>();
    for (const row of v1Rows) {
      const recordId = almanakkenField(row, 'recordid');
      if (recordId) byRecordId.set(recordId, row);
    }
    for (const row of v2Rows) {
      const recordId = almanakkenField(row, 'recordid');
      if (recordId) byRecordId.set(recordId, row);
    }
    return {
      path: V2_CSV,
      version: 'v1+v2',
      rows: [...byRecordId.values()],
    };
  }

  const { path, version } = getAlmanakkenSourcePath();
  return {
    path,
    version,
    rows: readCsvRows(path, version).map((row) =>
      normalizeAlmanakkenRow(row, version),
    ),
  };
}

export function readAlmanakkenVersionRows(
  version: Exclude<AlmanakkenCsvVersion, 'v1+v2'>,
): AlmanakkenRow[] {
  const path = version === 'v1' ? V1_CSV : V2_CSV;
  return readCsvRows(path, version).map((row) =>
    normalizeAlmanakkenRow(row, version),
  );
}

function readCsvRows(
  path: string,
  version: Exclude<AlmanakkenCsvVersion, 'v1+v2'>,
): AlmanakkenRow[] {
  const csv = decodeCsv(path, version);
  return parse(csv, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    delimiter: version === 'v2' ? ';' : ',',
    trim: true,
  }) as AlmanakkenRow[];
}

function normalizeAlmanakkenRow(
  row: AlmanakkenRow,
  version: Exclude<AlmanakkenCsvVersion, 'v1+v2'>,
): AlmanakkenRow {
  const normalized: AlmanakkenRow = { ...row };
  const aliases: Array<[string, string]> = [
    ['split1_lab', 'has_parts1_lab'],
    ['split1_id', 'has_parts1_id'],
    ['split2_lab', 'has_parts2_lab'],
    ['split2_id', 'has_parts2_id'],
    ['split3_lab', 'has_parts3_lab'],
    ['split3_id', 'has_parts3_id'],
    ['split4_lab', 'has_parts4_lab'],
    ['split4_id', 'has_parts4_id'],
    ['partof_lab', 'part_of_lab'],
    ['part of_id', 'part_of_id'],
    ['reference_std_lab', 'owned_by_lab'],
    ['reference_std_id', 'owned_by_id'],
    ['nummer', 'lot'],
    ['namen_totslaafgemaakten', 'sranantongo_naam'],
  ];

  for (const [legacyKey, canonicalKey] of aliases) {
    if (!normalized[canonicalKey] && normalized[legacyKey]) {
      normalized[canonicalKey] = normalized[legacyKey];
    }
  }

  if (version === 'v1') {
    normalized.psur_id2 ??= '';
    normalized.river_or_road ??= '';
    normalized.owned_by_lab ??= '';
    normalized.owned_by_id ??= '';
    normalized.owned_by_id2 ??= '';
    normalized.enslaved_norm ||= normalized.slaven ?? '';
    normalized.enslaved_shared_with ??= '';
    normalized.sranantongo_naam ??= '';
  }

  return normalized;
}

export function almanakkenField(
  row: AlmanakkenRow,
  ...keys: string[]
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
