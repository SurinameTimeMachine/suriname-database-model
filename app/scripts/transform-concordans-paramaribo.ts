/**
 * Concordans Paramaribo profiler.
 *
 * The CSV export does not preserve values for formula-backed cells, so this
 * script reconstructs the important address fields from their component columns
 * and writes a first analysis report. The raw XLSX stays outside Git.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'csv-parse/sync';

type ConcordansRow = Record<string, string>;

const DEFAULT_INPUT =
  '/home/thunnis/Projecten/STM/concordans paramaribo/Concordans Paramaribo 2022 (orig as csv).csv';
const DEFAULT_OUTPUT_DIR = join(
  __dirname,
  '../..',
  'data',
  'concordans-paramaribo',
);

function clean(value: string | undefined): string {
  return (value || '').trim();
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function countFilled(rows: ConcordansRow[], field: string): number {
  return rows.reduce(
    (count, row) => (clean(row[field]) ? count + 1 : count),
    0,
  );
}

function uniqueSample(values: string[], limit = 8): string[] {
  const seen = new Set<string>();
  const sample: string[] = [];
  for (const value of values) {
    const cleaned = clean(value);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    sample.push(cleaned);
    if (sample.length >= limit) break;
  }
  return sample;
}

function deriveAddress2022(row: ConcordansRow): string {
  // Formula in the XLSX: =CONCATENATE(K2;" ";IF(LEN(L2)=1;"  ";"");IF(LEN(L2)=2;" ";"");L2;M2)
  const street = clean(row['Huidige straatnaam']);
  const number = clean(row['huidig no']);
  const suffix = clean(row['huidig bis']);

  if (!street && !number && !suffix) return '';

  const numberPadding = number
    ? number.length === 1
      ? '  '
      : number.length === 2
        ? ' '
        : ''
    : '';

  return normalizeSpaces(`${street} ${numberPadding}${number}${suffix}`);
}

function deriveAddress1885(row: ConcordansRow): string {
  const wijk = clean(row['NW 1885 La.']);
  const number = clean(row['NW 1885 no.']);
  const suffix = clean(row['NW 1885 bis']);
  return normalizeSpaces([wijk, number, suffix].filter(Boolean).join(' '));
}

function deriveAddress1837(row: ConcordansRow): string {
  return clean(row['adres 1837: NW']);
}

function deriveAddress1817(row: ConcordansRow): string {
  return clean(row['adres 1817: OW']);
}

function profileRows(rows: ConcordansRow[]) {
  const with1885 = rows.filter((row) => clean(row['adres 1885: NW'])).length;
  const with1837 = rows.filter((row) => clean(row['adres 1837: NW'])).length;
  const with1817 = rows.filter((row) => clean(row['adres 1817: OW'])).length;
  const with2022Derived = rows.filter((row) => deriveAddress2022(row)).length;
  const with1921 = rows.filter((row) => clean(row['adres 1921 (BR)'])).length;
  const withStreet1885 = rows.filter((row) => clean(row['NW 1885 straatnaam'])).length;
  const withStreet1837 = rows.filter((row) => clean(row['NW straatnaam, 1837'])).length;
  const withStreet1830 = rows.filter((row) => clean(row['OW straatnaam, 1830'])).length;
  const withSplitMarker = rows.filter((row) => clean(row['Gesplitst in'])).length;
  const withNewMarker = rows.filter((row) => clean(row['Nieuw in'])).length;

  return {
    total: rows.length,
    with1885,
    with1837,
    with1817,
    with2022Derived,
    with1921,
    withStreet1885,
    withStreet1837,
    withStreet1830,
    withSplitMarker,
    withNewMarker,
    samples: {
      address2022: uniqueSample(rows.map((row) => deriveAddress2022(row))),
      address1921: uniqueSample(rows.map((row) => clean(row['adres 1921 (BR)']))),
      address1885: uniqueSample(rows.map((row) => deriveAddress1885(row))),
      address1837: uniqueSample(rows.map((row) => deriveAddress1837(row))),
      address1817: uniqueSample(rows.map((row) => deriveAddress1817(row))),
      street1885: uniqueSample(rows.map((row) => clean(row['NW 1885 straatnaam']))),
      street1837: uniqueSample(rows.map((row) => clean(row['NW straatnaam, 1837']))),
      street1830: uniqueSample(rows.map((row) => clean(row['OW straatnaam, 1830']))),
    },
  };
}

function buildReport(profile: ReturnType<typeof profileRows>, inputPath: string) {
  const lines: string[] = [];
  lines.push('# Concordans Paramaribo First Data Analysis');
  lines.push('');
  lines.push(`Input file: ${inputPath}`);
  lines.push('');
  lines.push('## Main finding');
  lines.push('');
  lines.push(
    'The CSV export does not contain the calculated values for formula-backed cells, but the address can be reconstructed from the component columns in the export.',
  );
  lines.push('');
  lines.push('## Field coverage');
  lines.push('');
  lines.push(`- Total rows: ${profile.total}`);
  lines.push(`- Rows with 2022 formula-derived address: ${profile.with2022Derived}`);
  lines.push(`- Rows with 1921 address: ${profile.with1921}`);
  lines.push(`- Rows with 1885 address cell filled in CSV: ${profile.with1885}`);
  lines.push(`- Rows with 1837 address: ${profile.with1837}`);
  lines.push(`- Rows with 1817 address: ${profile.with1817}`);
  lines.push(`- Rows with 1885 street name: ${profile.withStreet1885}`);
  lines.push(`- Rows with 1837 street name: ${profile.withStreet1837}`);
  lines.push(`- Rows with 1830 street name: ${profile.withStreet1830}`);
  lines.push(`- Rows with split marker: ${profile.withSplitMarker}`);
  lines.push(`- Rows with new marker: ${profile.withNewMarker}`);
  lines.push('');
  lines.push('## Sample values');
  lines.push('');
  lines.push(`- 2022: ${profile.samples.address2022.join(' | ')}`);
  lines.push(`- 1921: ${profile.samples.address1921.join(' | ')}`);
  lines.push(`- 1885: ${profile.samples.address1885.join(' | ')}`);
  lines.push(`- 1837: ${profile.samples.address1837.join(' | ')}`);
  lines.push(`- 1817: ${profile.samples.address1817.join(' | ')}`);
  lines.push(`- 1885 streets: ${profile.samples.street1885.join(' | ')}`);
  lines.push(`- 1837 streets: ${profile.samples.street1837.join(' | ')}`);
  lines.push(`- 1830 streets: ${profile.samples.street1830.join(' | ')}`);
  lines.push('');
  lines.push('## Immediate implications');
  lines.push('');
  lines.push('- The first normalization target should be the 1885 address layer.');
  lines.push('- The 2022 address column must be reconstructed from the street, number, and suffix columns.');
  lines.push('- 1837 and 1921 remain the major transition layers for the later matching logic.');
  lines.push('- Street names are useful secondary hints, not the primary anchor.');
  lines.push('- Splits and merges need explicit relationship modeling later.');
  return lines.join('\n');
}

function main() {
  const inputPath = process.env.CONCORDANS_PARAMARIBO_CSV || DEFAULT_INPUT;

  if (!existsSync(inputPath)) {
    throw new Error(`Concordans CSV not found: ${inputPath}`);
  }

  const raw = readFileSync(inputPath, 'utf-8');
  const rows = parse(raw, {
    columns: true,
    delimiter: ';',
    skip_empty_lines: true,
    trim: true,
  }) as ConcordansRow[];

  const profile = profileRows(rows);
  const report = buildReport(profile, inputPath);

  const outputDir = process.env.CONCORDANS_PARAMARIBO_OUT || DEFAULT_OUTPUT_DIR;
  mkdirSync(outputDir, { recursive: true });
  const reportPath = join(outputDir, 'concordans-paramaribo-profile.md');
  writeFileSync(reportPath, report);

  console.log(`Rows: ${profile.total}`);
  console.log(`2022 addresses reconstructed from components: ${profile.with2022Derived}`);
  console.log(`1921 addresses present: ${profile.with1921}`);
  console.log(`1885 address cells filled in CSV: ${profile.with1885}`);
  console.log(`1885 street names present: ${profile.withStreet1885}`);
  console.log(`Report written to: ${reportPath}`);
}

main();