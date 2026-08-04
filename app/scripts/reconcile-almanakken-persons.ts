import { mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';

const BASE_DIR = join(__dirname, '../..');
const ALMANAC_V1_CSV = join(
  BASE_DIR,
  'data/06-almanakken - Plantations Surinaamse Almanakken/Plantations Surinaamse Almanakken v1.0.csv',
);
const ALMANAC_V2_CSV = join(
  BASE_DIR,
  'data/06-almanakken - Plantations Surinaamse Almanakken/versie 2.0/Plantations Surinaamse Almanakken v2.0.csv',
);
const OUTPUT_DIR = join(BASE_DIR, 'lod');
const OUTPUT_FILE = join(OUTPUT_DIR, 'reconciled-person-standardization.xlsx');

const ROLES = ['eigenaren', 'administrateurs', 'directeuren', 'blank-officier', 'blankofficier'] as const;
type Role = (typeof ROLES)[number];

interface AlmanakRow {
  recordid: string;
  year: string;
  page: string;
  plantation_std: string;
  plantation_org: string;
  plantation_id: string;
  psur_id: string;
  psur_id2?: string;
  [key: string]: string | undefined;
}

interface EnrichmentRow {
  enrichment_id: string;
  source_version: string;
  recordid: string;
  year: string;
  page: string;
  role: string;
  ordinal: number;
  role_value_v2: string;
  name_count: number;
  disamb_step: string;
  NAME: string;
  splitsen_of_check: boolean;
  fusie: boolean;
  overig: boolean;
  original_name: string;
  normalized_name: string;
  entity_type: 'natural_person' | 'legal_entity';
  plantation_id: string;
  psur_id: string;
  org_source: string;
  org_v2: string;
  match_type: 'matched' | 'review_required' | 'new' | 'split' | 'fusion';
  status: 'matched' | 'review_required' | 'new' | 'split' | 'fusion';
  wikidata_id: string;
  notes: string;
}

function normalizeName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:]+$/g, '')
    .replace(/\s*[½⅓⅔¼¾]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitNames(value: string): string[] {
  if (!value) return [];

  return value
    .split(/\s*(?:;|,|\/|&|\s+(?:en|and)\s+)/i)
    .map((part) => normalizeName(part))
    .filter((part) => part.length > 0 && !/^(de|the|unknown|onbekend)$/i.test(part));
}

function buildEnrichmentId(row: EnrichmentRow): string {
  const base = [
    row.source_version,
    row.recordid,
    row.role,
    row.ordinal,
    row.normalized_name || row.original_name,
    row.plantation_id || 'unknown',
  ]
    .join('|')
    .toLowerCase();

  return `enrichment-${Buffer.from(base).toString('base64url')}`;
}

function normalizeRow(row: Record<string, string | undefined>): AlmanakRow {
  const normalized: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = key.replace(/^\uFEFF/, '').trim();
    normalized[normalizedKey] = value;
  }

  const recordid = (normalized.recordid ?? normalized['ï»¿recordid'] ?? '').toString().trim();
  if (recordid) {
    normalized.recordid = recordid;
  }

  return normalized as AlmanakRow;
}

function parseCsv(filePath: string, delimiter: string): AlmanakRow[] {
  const content = readFileSync(filePath, 'latin1');
  return parse(content, {
    delimiter,
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }).map((row: Record<string, string | undefined>) => normalizeRow(row));
}

function loadRowMap(rows: AlmanakRow[]): Map<string, AlmanakRow> {
  const map = new Map<string, AlmanakRow>();
  for (const row of rows) {
    if (row.recordid) map.set(row.recordid, row);
  }
  return map;
}

function inferEntityType(name: string): 'natural_person' | 'legal_entity' {
  const normalized = normalizeName(name).toLowerCase();
  if (
    /^(de|den|der|van|von|st|st\.)/i.test(normalized) ||
    /\b(bank|maatschappij|stichting|curators|weduwe|familie|company|compagnie)\b/i.test(normalized)
  ) {
    return 'legal_entity';
  }
  return 'natural_person';
}

function reconcileV2Rows(v1Rows: AlmanakRow[], v2Rows: AlmanakRow[]): EnrichmentRow[] {
  const v1Map = loadRowMap(v1Rows);
  const v2Map = loadRowMap(v2Rows);
  const results: EnrichmentRow[] = [];

  for (const [recordid, v2Row] of v2Map.entries()) {
    const v1Row = v1Map.get(recordid);
    const orgSource = v1Row ? v1Row.plantation_std || v1Row.plantation_org : '';
    const orgV2 = v2Row.plantation_std || v2Row.plantation_org || '';
    const orgMatches = orgSource === orgV2;

    for (const role of ROLES) {
      const v1Value = v1Row?.[role] ?? '';
      const v2Value = v2Row?.[role] ?? '';
      const v1Values = splitNames(v1Value.toString());
      const v2Values = splitNames(v2Value.toString());
      const allNames = [...new Set([...v1Values, ...v2Values])];

      if (allNames.length === 0) continue;

      const roleValueV2 = v2Value.toString().trim() || v1Value.toString().trim();
      const sourceNames = v2Values.length > 0 ? v2Values : v1Values;
      const nameCount = sourceNames.length;

      for (let index = 0; index < sourceNames.length; index++) {
        const originalName = sourceNames[index];
        const normalizedName = normalizeName(originalName);
        const isNew = v1Values.length === 0 && v2Values.length > 0;
        const isSplit = v2Values.length > 1 || (v1Values.length > 1 && v2Values.length <= 1);
        const isFusion = v1Values.length > 1 && v2Values.length <= 1;

        let matchType: EnrichmentRow['match_type'] = 'matched';
        let status: EnrichmentRow['status'] = 'matched';
        let notes = 'Carry over from prior workbook; org remains aligned.';

        if (!orgMatches) {
          matchType = 'review_required';
          status = 'review_required';
          notes = `Org changed from '${orgSource}' to '${orgV2}'. Review required.`;
        } else if (isNew) {
          matchType = 'new';
          status = 'new';
          notes = 'New person entry detected in v2.0.';
        } else if (isSplit) {
          matchType = 'split';
          status = 'split';
          notes = 'Split case detected; review the person list carefully.';
        } else if (isFusion) {
          matchType = 'fusion';
          status = 'fusion';
          notes = 'Fusion case detected; review the merged name list.';
        }

        const splitsenOfCheck = matchType === 'split' || nameCount > 1;
        const fusie = matchType === 'fusion';
        const overig = !splitsenOfCheck && !fusie;
        const disambStep = splitsenOfCheck ? 'split' : fusie ? 'fusion' : 'overig';

        const enrichmentRow: EnrichmentRow = {
          enrichment_id: '',
          source_version: 'v2.0',
          recordid,
          year: v2Row.year || '',
          page: v2Row.page || '',
          role,
          ordinal: index + 1,
          role_value_v2: roleValueV2,
          name_count: nameCount,
          disamb_step: disambStep,
          NAME: normalizedName,
          splitsen_of_check: splitsenOfCheck,
          fusie,
          overig,
          original_name: originalName,
          normalized_name: normalizedName,
          entity_type: inferEntityType(originalName),
          plantation_id: v2Row.plantation_id || '',
          psur_id: v2Row.psur_id || '',
          org_source: orgSource,
          org_v2: orgV2,
          match_type: matchType,
          status,
          wikidata_id: '',
          notes,
        };

        enrichmentRow.enrichment_id = buildEnrichmentId(enrichmentRow);
        results.push(enrichmentRow);
      }
    }
  }

  return results;
}

function buildWorkbook(rows: EnrichmentRow[]) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Person Enrichment');
  worksheet.columns = [
    { header: 'enrichment_id', key: 'enrichment_id', width: 28 },
    { header: 'source_version', key: 'source_version', width: 12 },
    { header: 'recordid', key: 'recordid', width: 16 },
    { header: 'year', key: 'year', width: 8 },
    { header: 'page', key: 'page', width: 8 },
    { header: 'role', key: 'role', width: 22 },
    { header: 'ordinal', key: 'ordinal', width: 8 },
    { header: 'role_value_v2', key: 'role_value_v2', width: 40 },
    { header: 'name_count', key: 'name_count', width: 10 },
    { header: 'disamb_step', key: 'disamb_step', width: 16 },
    { header: 'NAME', key: 'NAME', width: 28 },
    { header: 'splitsen_of_check', key: 'splitsen_of_check', width: 18 },
    { header: 'fusie', key: 'fusie', width: 10 },
    { header: 'overig', key: 'overig', width: 10 },
    { header: 'original_name', key: 'original_name', width: 28 },
    { header: 'normalized_name', key: 'normalized_name', width: 28 },
    { header: 'entity_type', key: 'entity_type', width: 18 },
    { header: 'plantation_id', key: 'plantation_id', width: 18 },
    { header: 'psur_id', key: 'psur_id', width: 14 },
    { header: 'org_source', key: 'org_source', width: 28 },
    { header: 'org_v2', key: 'org_v2', width: 28 },
    { header: 'match_type', key: 'match_type', width: 16 },
    { header: 'status', key: 'status', width: 16 },
    { header: 'wikidata_id', key: 'wikidata_id', width: 18 },
    { header: 'notes', key: 'notes', width: 48 },
  ];

  worksheet.addRows(rows);

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  return workbook;
}

function main() {
  console.log('Reading v1.0 and v2.0 almanak CSVs...');
  const v1Rows = parseCsv(ALMANAC_V1_CSV, ',');
  const v2Rows = parseCsv(ALMANAC_V2_CSV, ';');
  console.log(`Loaded ${v1Rows.length} v1 rows and ${v2Rows.length} v2 rows`);

  const rows = reconcileV2Rows(v1Rows, v2Rows);
  console.log(`Generated ${rows.length} enrichment rows`);

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const workbook = buildWorkbook(rows);
  workbook.xlsx.writeFile(OUTPUT_FILE).then(() => {
    console.log(`Workbook written to ${OUTPUT_FILE}`);
  });
}

main();
