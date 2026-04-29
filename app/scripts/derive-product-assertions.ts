/**
 * Derive ProductAssertion entries from the Almanakken CSV and patch
 * them into places-gazetteer.jsonld for all plantation entries.
 *
 * CRM alignment:
 *   ProductAssertion → E13 Attribute Assignment
 *     P140 assigned attribute to → E25 Plantation
 *     P141 assigned → E55 Type (product vocabulary term, e.g. "koffie")
 *     P4 has time-span → E52 Time-Span (startYear / endYear)
 *     prov:hadPrimarySource → E22 almanakken
 *
 * Derivation rules (per plantation, grouped by Wikidata Q-ID):
 *   - Only rows where deserted != 'verlaten' and product_std is non-empty
 *   - Consecutive years (or gap of at most 1 missing almanakken year) with
 *     the same product_std value → single ProductAssertion with startYear/endYear
 *   - Product change OR gap > 1 year → new ProductAssertion
 *
 * Skips: entries whose productAssertions array is already non-empty (manual
 *        edits take precedence). Pass --force to overwrite.
 *
 * Run with:
 *   pnpm derive-products
 *   pnpm derive-products -- --force
 */

import { parse } from 'csv-parse/sync';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { GazetteerPlace, ProductAssertion } from '../lib/types';

// ── Paths ──────────────────────────────────────────────────────────────────

const DATA_DIR = join(__dirname, '../../data');
const ALMANAKKEN_CSV = join(
  DATA_DIR,
  '06-almanakken - Plantations Surinaamse Almanakken',
  'Plantations Surinaamse Almanakken v1.0.csv',
);
const GAZETTEER_PATH = join(DATA_DIR, 'places-gazetteer.jsonld');
const PUBLIC_GAZETTEER = join(
  __dirname,
  '../public/data/places-gazetteer.jsonld',
);

// ── Config ─────────────────────────────────────────────────────────────────

const FORCE = process.argv.includes('--force');
const SOURCE_ID = 'almanakken'; // registry sourceId (prov:hadPrimarySource)

// ── Validate SOURCE_ID against sources-registry.jsonld ─────────────────────

{
  const registryPath = join(DATA_DIR, 'sources-registry.jsonld');
  let registry: { '@graph': Array<{ '@type'?: string[]; sourceId?: string }> };
  try {
    registry = JSON.parse(readFileSync(registryPath, 'utf-8'));
  } catch {
    console.error(`Error: could not read sources registry at ${registryPath}`);
    process.exit(1);
  }
  const entry = (registry['@graph'] ?? []).find(
    (n) =>
      n.sourceId === SOURCE_ID &&
      Array.isArray(n['@type']) &&
      n['@type'].includes('crm:E22_Human-Made_Object'),
  );
  if (!entry) {
    console.error(
      `Error: SOURCE_ID "${SOURCE_ID}" not found as an E22 entry in sources registry.`,
    );
    if (!FORCE) process.exit(1);
  }
}

// ── Types ──────────────────────────────────────────────────────────────────

interface AlmanakRow {
  qid: string;
  year: number;
  product: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Convert a product label to a URL-safe slug for use in assertion IDs. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ── Read and parse CSV (latin-1) ───────────────────────────────────────────

console.log('Reading almanakken CSV...');
const buf = readFileSync(ALMANAKKEN_CSV);
const csv = new TextDecoder('latin1').decode(buf);

const rawRows: Record<string, string>[] = parse(csv, {
  columns: true,
  skip_empty_lines: true,
  relax_column_count: true,
});

// Keep only rows with a Q-ID, valid year, a product value, and NOT verlaten.
// Verlaten rows are excluded because a plantation being abandoned implies no
// active product — even if the CSV has a stale product_std on that row.
const rows: AlmanakRow[] = rawRows
  .filter((r) => {
    const qid = (r['plantation_id'] ?? '').trim();
    const year = parseInt((r['year'] ?? '').trim(), 10);
    const product = (r['product_std'] ?? '').trim();
    const verlaten = (r['deserted'] ?? '').trim().toLowerCase() === 'verlaten';
    return qid && !isNaN(year) && product && !verlaten;
  })
  .map((r) => ({
    qid: r['plantation_id'].trim(),
    year: parseInt(r['year'].trim(), 10),
    product: r['product_std'].trim(),
  }));

const uniqueQids = new Set(rows.map((r) => r.qid));
console.log(
  `  ${rows.length} usable product rows across ${uniqueQids.size} Q-IDs`,
);

// ── Group by Q-ID and sort by year ─────────────────────────────────────────

const byQid = new Map<string, AlmanakRow[]>();
for (const row of rows) {
  const list = byQid.get(row.qid) ?? [];
  list.push(row);
  byQid.set(row.qid, list);
}
for (const list of byQid.values()) {
  list.sort((a, b) => a.year - b.year);
}

// ── Derive product assertions per Q-ID ────────────────────────────────────

/**
 * Walk the sorted year-by-year product observations for one plantation and
 * collapse them into contiguous ProductAssertion spans.
 *
 * Consecutive observations of the same product_std value are merged into one
 * assertion. A gap of at most 1 missing almanakken year between two same-product
 * observations is bridged (since not all almanakken editions are in the dataset).
 *
 * A different product value always starts a new assertion, regardless of the
 * gap — even a single intervening year with a different product value breaks
 * the current span.
 */
function deriveProductAssertions(
  plantationRows: AlmanakRow[],
): ProductAssertion[] {
  if (plantationRows.length === 0) return [];

  // De-duplicate year→product. If a year appears twice with different products
  // (edge case), keep the first one encountered (rows are already sorted by year).
  const yearProduct = new Map<number, string>();
  for (const r of plantationRows) {
    if (!yearProduct.has(r.year)) {
      yearProduct.set(r.year, r.product);
    }
  }

  const sortedYears = [...yearProduct.keys()].sort((a, b) => a - b);

  type Phase = { product: string; startYear: number; endYear: number };
  const phases: Phase[] = [];
  let current: Phase | null = null;

  for (const year of sortedYears) {
    const product = yearProduct.get(year)!;

    if (current === null) {
      current = { product, startYear: year, endYear: year };
    } else if (current.product === product && year - current.endYear <= 2) {
      // Same product and gap of at most 1 missing year → extend span
      current.endYear = year;
    } else {
      // Different product OR gap > 1 year → close current span, start new
      phases.push(current);
      current = { product, startYear: year, endYear: year };
    }
  }
  if (current) phases.push(current);

  return phases.map((phase) => ({
    id: `product-almanakken-${slugify(phase.product)}-${phase.startYear}`,
    value: phase.product,
    source: SOURCE_ID,
    startYear: phase.startYear,
    endYear: phase.endYear !== phase.startYear ? phase.endYear : undefined,
    note: null,
  }));
}

// Build lookup: Q-ID → derived ProductAssertion[]
const derivedByQid = new Map<string, ProductAssertion[]>();
for (const [qid, plantationRows] of byQid) {
  const derived = deriveProductAssertions(plantationRows);
  if (derived.length > 0) {
    derivedByQid.set(qid, derived);
  }
}

console.log(
  `  Derived product assertions for ${derivedByQid.size} plantations`,
);

// ── Read gazetteer and patch ───────────────────────────────────────────────

console.log('Reading gazetteer...');
const gazetteerRaw = readFileSync(GAZETTEER_PATH, 'utf-8');
const gazetteerJsonld = JSON.parse(gazetteerRaw);
const graph: GazetteerPlace[] = gazetteerJsonld['@graph'] || [];

let patched = 0;
let skipped = 0;
let noMatch = 0;

for (const entry of graph) {
  if (entry.type !== 'plantation') continue;

  const qid = entry.wikidataQid;
  if (!qid) {
    noMatch++;
    continue;
  }

  const derived = derivedByQid.get(qid);
  if (!derived || derived.length === 0) {
    noMatch++;
    continue;
  }

  // Skip if already has manual assertions (unless --force)
  const existing = entry.productAssertions ?? [];
  if (existing.length > 0 && !FORCE) {
    skipped++;
    continue;
  }

  entry.productAssertions = derived;
  patched++;
}

console.log(
  `  Patched: ${patched}  Skipped (has manual assertions): ${skipped}  No almanakken match: ${noMatch}`,
);

if (patched === 0) {
  console.log(
    '  Nothing to write. Run with --force to overwrite existing assertions.',
  );
  process.exit(0);
}

// ── Write out ──────────────────────────────────────────────────────────────

const outStr = JSON.stringify(gazetteerJsonld, null, 2);
writeFileSync(GAZETTEER_PATH, outStr, 'utf-8');
console.log(`  Wrote ${GAZETTEER_PATH}`);

try {
  writeFileSync(PUBLIC_GAZETTEER, outStr, 'utf-8');
  console.log(`  Wrote public copy: ${PUBLIC_GAZETTEER}`);
} catch (err) {
  console.error(
    `Error: could not write public copy at ${PUBLIC_GAZETTEER}`,
    err,
  );
  process.exit(1);
}

console.log('Done.');
