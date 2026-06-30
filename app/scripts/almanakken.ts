import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { parse } from 'csv-parse/sync';

export type AlmanakkenCsvVersion = 'v1' | 'v2';
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
  version: AlmanakkenCsvVersion;
} {
  if (existsSync(V2_CSV)) return { path: V2_CSV, version: 'v2' };
  return { path: V1_CSV, version: 'v1' };
}

export function readAlmanakkenRows(): {
  path: string;
  version: AlmanakkenCsvVersion;
  rows: AlmanakkenRow[];
} {
  const { path, version } = getAlmanakkenSourcePath();
  const csv = decodeCsv(path, version);
  const rows = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    delimiter: version === 'v2' ? ';' : ',',
    trim: true,
  }) as AlmanakkenRow[];
  return { path, version, rows };
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
