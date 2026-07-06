/**
 * Concordans Paramaribo profiler.
 *
 * The CSV export does not preserve calculated values for formula-backed cells,
 * so this script reconstructs the important address fields from their component
 * columns and writes a first analysis report plus a derived CSV. The raw XLSX
 * stays outside Git.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'csv-parse/sync';

type ConcordansRow = Record<string, string>;

const DEFAULT_INPUT =
  '/home/thunnis/Projecten/STM/concordans paramaribo/Concordans Paramaribo 2022 (orig as csv).csv';
const DEFAULT_OUTPUT_DIR = join(__dirname, '../..', 'data', 'concordans-paramaribo');

function clean(value: string | undefined): string {
  return (value || '').trim();
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeForMatch(value: string): string {
  return normalizeSpaces(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.]/g, '')
    .toLowerCase();
}

function normalize1885Code(value: string): string {
  return normalizeSpaces(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function csvEscape(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function countFilled(rows: ConcordansRow[], field: string): number {
  return rows.reduce((count, row) => (clean(row[field]) ? count + 1 : count), 0);
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

function has1885RenumberingComponents(row: ConcordansRow): boolean {
  return Boolean(
    clean(row['NW 1885 La.']) ||
      clean(row['NW 1885 no.']) ||
      clean(row['NW 1885 bis']),
  );
}

function compare1885(row: ConcordansRow) {
  const cell = clean(row['adres 1885: NW']);
  const derived = deriveAddress1885(row);
  const normalizedCell = normalize1885Code(cell);
  const normalizedDerived = normalize1885Code(derived);
  const status = !cell && !derived
    ? 'empty'
    : !cell && derived
      ? 'derived-only'
    : cell === derived
      ? 'exact'
      : normalizedCell === normalizedDerived
        ? 'formatting-only'
        : 'mismatch';

  return { cell, derived, normalizedCell, normalizedDerived, status };
}

function buildProfile(rows: ConcordansRow[]) {
  const with1885Cell = countFilled(rows, 'adres 1885: NW');
  const with1885Components = rows.filter((row) => has1885RenumberingComponents(row)).length;
  const with1837 = countFilled(rows, 'adres 1837: NW');
  const with1817 = countFilled(rows, 'adres 1817: OW');
  const with2022Derived = rows.filter((row) => deriveAddress2022(row)).length;
  const with1921 = countFilled(rows, 'adres 1921 (BR)');
  const withStreet1885 = countFilled(rows, 'NW 1885 straatnaam');
  const withStreet1837 = countFilled(rows, 'NW straatnaam, 1837');
  const withStreet1830 = countFilled(rows, 'OW straatnaam, 1830');
  const withSplitMarker = countFilled(rows, 'Gesplitst in');
  const withNewMarker = countFilled(rows, 'Nieuw in');

  const comparisons = rows.map(compare1885);

  const exact1885 = comparisons.filter((item) => item.status === 'exact').length;
  const formattingOnly1885 = comparisons.filter((item) => item.status === 'formatting-only').length;
  const derivedOnly1885 = comparisons.filter((item) => item.status === 'derived-only').length;
  const realMismatch1885 = comparisons.filter((item) => item.status === 'mismatch').length;

  return {
    total: rows.length,
    with1885Cell,
    with1885Components,
    with1837,
    with1817,
    with2022Derived,
    with1921,
    withStreet1885,
    withStreet1837,
    withStreet1830,
    withSplitMarker,
    withNewMarker,
    exact1885,
    formattingOnly1885,
    derivedOnly1885,
    realMismatch1885,
    samples: {
      address2022: uniqueSample(rows.map((row) => deriveAddress2022(row))),
      address1921: uniqueSample(rows.map((row) => clean(row['adres 1921 (BR)']))),
      address1885Cell: uniqueSample(comparisons.map((item) => item.cell)),
      address1885Derived: uniqueSample(comparisons.map((item) => item.derived)),
      address1837: uniqueSample(rows.map((row) => deriveAddress1837(row))),
      address1817: uniqueSample(rows.map((row) => deriveAddress1817(row))),
      street1885: uniqueSample(rows.map((row) => clean(row['NW 1885 straatnaam']))),
      street1837: uniqueSample(rows.map((row) => clean(row['NW straatnaam, 1837']))),
      street1830: uniqueSample(rows.map((row) => clean(row['OW straatnaam, 1830']))),
      normalized1885Cell: uniqueSample(comparisons.map((item) => item.normalizedCell)),
      normalized1885Derived: uniqueSample(comparisons.map((item) => item.normalizedDerived)),
    },
    comparisonRows: comparisons,
  };
}

function buildReport(profile: ReturnType<typeof buildProfile>, inputPath: string) {
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
  lines.push(`- Rows with 1885 address cell filled in CSV: ${profile.with1885Cell}`);
  lines.push(`- Rows with 1885 renumbering components: ${profile.with1885Components}`);
  lines.push(`- Rows with 1837 address: ${profile.with1837}`);
  lines.push(`- Rows with 1817 address: ${profile.with1817}`);
  lines.push(`- Rows with 1885 street name: ${profile.withStreet1885}`);
  lines.push(`- Rows with 1837 street name: ${profile.withStreet1837}`);
  lines.push(`- Rows with 1830 street name: ${profile.withStreet1830}`);
  lines.push(`- Rows with split marker: ${profile.withSplitMarker}`);
  lines.push(`- Rows with new marker: ${profile.withNewMarker}`);
  lines.push('');
  lines.push('## 1885 comparison');
  lines.push('');
  lines.push(`- Exact 1885 cell/derived matches: ${profile.exact1885}`);
  lines.push(`- Formatting-only 1885 differences: ${profile.formattingOnly1885}`);
  lines.push(`- Derived-only 1885 rows (cell missing, reconstructable): ${profile.derivedOnly1885}`);
  lines.push(`- Real 1885 mismatches after normalization: ${profile.realMismatch1885}`);
  lines.push('');
  lines.push('## Sample values');
  lines.push('');
  lines.push(`- 2022: ${profile.samples.address2022.join(' | ')}`);
  lines.push(`- 1921: ${profile.samples.address1921.join(' | ')}`);
  lines.push(`- 1885 cell: ${profile.samples.address1885Cell.join(' | ')}`);
  lines.push(`- 1885 derived: ${profile.samples.address1885Derived.join(' | ')}`);
  lines.push(`- 1837: ${profile.samples.address1837.join(' | ')}`);
  lines.push(`- 1817: ${profile.samples.address1817.join(' | ')}`);
  lines.push(`- 1885 streets: ${profile.samples.street1885.join(' | ')}`);
  lines.push(`- 1837 streets: ${profile.samples.street1837.join(' | ')}`);
  lines.push(`- 1830 streets: ${profile.samples.street1830.join(' | ')}`);
  lines.push(`- Normalized 1885 cell: ${profile.samples.normalized1885Cell.join(' | ')}`);
  lines.push(`- Normalized 1885 derived: ${profile.samples.normalized1885Derived.join(' | ')}`);
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

function buildDerivedRows(rows: ConcordansRow[], comparisons: ReturnType<typeof compare1885>[]) {
  return rows.map((row, index) => {
    const address2022 = deriveAddress2022(row);
    const address1837 = deriveAddress1837(row);
    const address1817 = deriveAddress1817(row);
    const comparison = comparisons[index];

    const wijk1782Code = clean(row['Wijkno 1782']);
    const wijk1782DistrictNumber = clean(row['wijk']);
    const wijk1782ParcelLetter = clean(row['La.']);
    const wijk1782ParcelNumber = clean(row['no.']);
    const wijk1782ParcelPlus = clean(row['plus']);
    const wijk1782Street = clean(row['Wijk straatnaam, 1782']);
    const wijk1782Side = clean(row['zijde 1782']);

    const ow1817DistrictCode = clean(row['OW']);
    const ow1817BuurtLetter = clean(row['buurt OW La.']);
    const ow1817BuurtNumber = clean(row['buurt OW']);
    const ow1817ParcelLetter = clean(row['OW La.']);
    const ow1817ParcelNumber = clean(row['OW no.']);
    const ow1817ParcelSuffix = clean(row['OW bis']);

    const nw1837DistrictCode = clean(row['NW']);
    const nw1837OuterDistrict = clean(row['Buitenwijk']);
    const nw1837ParcelLetter = clean(row['NW La.']);
    const nw1837ParcelNumber = clean(row['NW no.']);
    const nw1837ParcelSuffix = clean(row['NW bis']);

    const nw1885Zone = clean(row['NW 1885 La.']);
    const nw1885ParcelNumber = clean(row['NW 1885 no.']);
    const nw1885ParcelSuffix = clean(row['NW 1885 bis']);
    const has1885Renumbering = has1885RenumberingComponents(row) ? 'yes' : 'no';

    const projectCode = clean(row['Project']);
    const projectNumber = clean(row['Project no.']);
    const projectSuffix = clean(row['Project bis']);

    const street1885 = clean(row['NW 1885 straatnaam']);
    const street1837 = clean(row['NW straatnaam, 1837']);
    const street1830 = clean(row['OW straatnaam, 1830']);
    const splitMarker = clean(row['Gesplitst in']);
    const newMarker = clean(row['Nieuw in']);

    return {
      sourceRow: String(index + 2),
      address2022,
      address1921: clean(row['adres 1921 (BR)']),
      address1885Cell: comparison.cell,
      address1885Derived: comparison.derived,
      has1885Renumbering,
      wijk1782Code,
      wijk1782DistrictNumber,
      wijk1782ParcelLetter,
      wijk1782ParcelNumber,
      wijk1782ParcelPlus,
      wijk1782Street,
      wijk1782Side,
      ow1817DistrictCode,
      ow1817BuurtLetter,
      ow1817BuurtNumber,
      ow1817ParcelLetter,
      ow1817ParcelNumber,
      ow1817ParcelSuffix,
      normalized1885Cell: comparison.normalizedCell,
      normalized1885Derived: comparison.normalizedDerived,
      normalized1885Status: comparison.status,
      address1837,
      address1817,
      nw1837DistrictCode,
      nw1837OuterDistrict,
      nw1837ParcelLetter,
      nw1837ParcelNumber,
      nw1837ParcelSuffix,
      nw1885Zone,
      nw1885ParcelNumber,
      nw1885ParcelSuffix,
      street1885,
      street1837,
      street1830,
      normalizedStreet1885: normalizeForMatch(street1885),
      normalizedStreet1837: normalizeForMatch(street1837),
      normalizedStreet1830: normalizeForMatch(street1830),
      projectCode,
      projectNumber,
      projectSuffix,
      splitMarker,
      newMarker,
      currentStreet: clean(row['Huidige straatnaam']),
      currentNumber: clean(row['huidig no']),
      currentBis: clean(row['huidig bis']),
      has1885Cell: comparison.cell ? 'yes' : 'no',
      has1885Derived: comparison.derived ? 'yes' : 'no',
      hasSplitMarker: splitMarker ? 'yes' : 'no',
      hasNewMarker: newMarker ? 'yes' : 'no',
    };
  });
}

function buildCsv(rows: ReturnType<typeof buildDerivedRows>): string {
  const headers = [
    'sourceRow',
    'address2022',
    'address1921',
    'address1885Cell',
    'address1885Derived',
    'has1885Renumbering',
    'wijk1782Code',
    'wijk1782DistrictNumber',
    'wijk1782ParcelLetter',
    'wijk1782ParcelNumber',
    'wijk1782ParcelPlus',
    'wijk1782Street',
    'wijk1782Side',
    'ow1817DistrictCode',
    'ow1817BuurtLetter',
    'ow1817BuurtNumber',
    'ow1817ParcelLetter',
    'ow1817ParcelNumber',
    'ow1817ParcelSuffix',
    'normalized1885Cell',
    'normalized1885Derived',
    'normalized1885Status',
    'address1837',
    'address1817',
    'nw1837DistrictCode',
    'nw1837OuterDistrict',
    'nw1837ParcelLetter',
    'nw1837ParcelNumber',
    'nw1837ParcelSuffix',
    'nw1885Zone',
    'nw1885ParcelNumber',
    'nw1885ParcelSuffix',
    'street1885',
    'street1837',
    'street1830',
    'normalizedStreet1885',
    'normalizedStreet1837',
    'normalizedStreet1830',
    'projectCode',
    'projectNumber',
    'projectSuffix',
    'splitMarker',
    'newMarker',
    'currentStreet',
    'currentNumber',
    'currentBis',
    'has1885Cell',
    'has1885Derived',
    'hasSplitMarker',
    'hasNewMarker',
  ];

  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(
      headers
        .map((header) => csvEscape(row[header as keyof typeof row] || ''))
        .join(','),
    );
  }
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

  const profile = buildProfile(rows);
  const report = buildReport(profile, inputPath);
  const derivedRows = buildDerivedRows(rows, profile.comparisonRows);
  const derivedCsv = buildCsv(derivedRows);

  const outputDir = process.env.CONCORDANS_PARAMARIBO_OUT || DEFAULT_OUTPUT_DIR;
  mkdirSync(outputDir, { recursive: true });
  const reportPath = join(outputDir, 'concordans-paramaribo-profile.md');
  const csvPath = join(outputDir, 'concordans-paramaribo-derived.csv');
  writeFileSync(reportPath, report);
  writeFileSync(csvPath, derivedCsv);

  console.log(`Rows: ${profile.total}`);
  console.log(`2022 addresses reconstructed from components: ${profile.with2022Derived}`);
  console.log(`1921 addresses present: ${profile.with1921}`);
  console.log(`1885 address cells filled in CSV: ${profile.with1885Cell}`);
  console.log(`1885 renumbering components present: ${profile.with1885Components}`);
  console.log(`1885 street names present: ${profile.withStreet1885}`);
  console.log(`1885 normalized exact matches: ${profile.exact1885}`);
  console.log(`1885 formatting-only differences: ${profile.formattingOnly1885}`);
  console.log(`1885 derived-only rows: ${profile.derivedOnly1885}`);
  console.log(`1885 real mismatches after normalization: ${profile.realMismatch1885}`);
  console.log(`Report written to: ${reportPath}`);
  console.log(`Derived CSV written to: ${csvPath}`);
}

main();