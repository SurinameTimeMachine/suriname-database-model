/**
 * Derive StatusAssertion lifecycle events from the Almanakken CSV and patch
 * them into places-gazetteer.jsonld for all plantation entries.
 *
 * CRM alignment:
 *   StatusAssertion → E17 Type Assignment
 *     P41 classified  → E25 Plantation (physical thing)
 *     P42 assigned    → E55 Type (type/plantation-status/{status})
 *     P4 has time-span → E52 Time-Span (startYear / endYear)
 *     prov:hadPrimarySource → E22 almanakken
 *
 * Derivation rules (per plantation, grouped by Wikidata Q-ID):
 *   1. built      — first contiguous run of years with a product_std value.
 *                   Start = earliest product year, end = last product year
 *                   before any verlaten. One assertion per contiguous active
 *                   period (gaps > MAX_GAP_YEARS trigger a new assertion).
 *   2. abandoned  — each contiguous span of years where deserted = 'verlaten'.
 *                   Collapsed into a single assertion: { startYear, endYear }.
 *   3. reactivated — the first year with a product_std value that occurs
 *                    after a verlaten span.
 *
 * Skips: entries whose statusAssertions array is already non-empty (manual
 *        edits take precedence). Pass --force to overwrite.
 *
 * Run with:
 *   pnpm derive-lifecycle
 *   pnpm derive-lifecycle -- --force
 */

import { parse } from 'csv-parse/sync';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type {
  GazetteerPlace,
  PlantationStatusType,
  StatusAssertion,
} from '../lib/types';

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

// ── Types ──────────────────────────────────────────────────────────────────

interface AlmanakRow {
  qid: string;
  year: number;
  product: string; // product_std (empty string if none)
  verlaten: boolean; // deserted column = 'verlaten'
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

// Keep only rows with a Q-ID and a valid year
const rows: AlmanakRow[] = rawRows
  .map((r) => ({
    qid: (r['plantation_id'] ?? '').trim(),
    year: parseInt((r['year'] ?? '').trim(), 10),
    product: (r['product_std'] ?? '').trim(),
    verlaten: (r['deserted'] ?? '').trim().toLowerCase() === 'verlaten',
  }))
  .filter((r) => r.qid && !isNaN(r.year));

console.log(
  `  ${rows.length} usable rows across ${new Set(rows.map((r) => r.qid)).size} Q-IDs`,
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

// ── Derive status assertions per Q-ID ─────────────────────────────────────

/**
 * Determine the state of a plantation in each recorded year, then emit
 * StatusAssertions by walking year-by-year state transitions.
 *
 * Per-year state (priority order):
 *   abandoned — row has deserted='verlaten' (wins over product if both present)
 *   active    — row has product_std
 *   neutral   — row appears in almanakken but has neither product nor verlaten
 *
 * Neutral years are skipped during span-building; only active/abandoned years
 * affect the lifecycle. Consecutive years of the same state (gap ≤ 1 interim
 * year) are collapsed into one span.
 *
 * Assertions emitted:
 *   built        — first contiguous run of active years
 *   abandoned    — each contiguous run of abandoned years
 *   reactivated  — active run that begins after at least one abandoned span
 */
function deriveStatusAssertions(
  plantationRows: AlmanakRow[],
): StatusAssertion[] {
  if (plantationRows.length === 0) return [];

  // Build per-year state: 'abandoned' takes priority when multiple rows for same year
  const yearState = new Map<number, 'active' | 'abandoned' | 'neutral'>();
  for (const r of plantationRows) {
    if (r.verlaten) {
      yearState.set(r.year, 'abandoned');
    } else if (r.product && yearState.get(r.year) !== 'abandoned') {
      yearState.set(r.year, 'active');
    } else if (!yearState.has(r.year)) {
      yearState.set(r.year, 'neutral');
    }
  }

  const sortedYears = [...yearState.keys()].sort((a, b) => a - b);

  // Walk year sequence and build spans, skipping neutral years
  type Phase = {
    state: 'active' | 'abandoned';
    startYear: number;
    endYear: number;
  };
  const phases: Phase[] = [];
  let current: Phase | null = null;

  for (const year of sortedYears) {
    const state = yearState.get(year)!;
    if (state === 'neutral') continue; // neutral years don't form spans

    if (current === null) {
      current = { state, startYear: year, endYear: year };
    } else if (current.state === state && year - current.endYear <= 2) {
      // Same state with gap of at most 1 intermediate year → extend span
      current.endYear = year;
    } else {
      // State change or large gap → close current, start new
      phases.push(current);
      current = { state, startYear: year, endYear: year };
    }
  }
  if (current) phases.push(current);

  // Convert phases to StatusAssertions, tracking whether an abandoned phase
  // has been seen so subsequent active phases become 'reactivated'.
  // 'built' is emitted only once (the very first active observation).
  const assertions: StatusAssertion[] = [];
  let seenAbandoned = false;
  let seenBuilt = false;

  for (const phase of phases) {
    if (phase.state === 'abandoned') {
      assertions.push({
        id: `status-almanakken-abandoned-${phase.startYear}`,
        status: 'abandoned' as PlantationStatusType,
        source: SOURCE_ID,
        startYear: phase.startYear,
        endYear: phase.endYear !== phase.startYear ? phase.endYear : undefined,
        note: null,
      });
      seenAbandoned = true;
    } else {
      // 'built' and 'reactivated' are point-in-time founding events — they mark
      // when a plantation was established or re-established, not how long it
      // operated. The operational period is already captured by productAssertions.
      const status: PlantationStatusType = seenAbandoned
        ? 'reactivated'
        : 'built';

      // 'built' only fires once (the very first active observation).
      // If there are gaps in coverage but no abandonment, skip subsequent phases.
      if (status === 'built' && seenBuilt) continue;

      assertions.push({
        id: `status-almanakken-${status}-${phase.startYear}`,
        status,
        source: SOURCE_ID,
        startYear: phase.startYear,
        // No endYear: built/reactivated are point-in-time events, not duration spans
        note: null,
      });
      seenBuilt = true;
    }
  }

  return assertions;
}

// Build lookup: Q-ID → derived StatusAssertion[]
const derivedByQid = new Map<string, StatusAssertion[]>();
for (const [qid, plantationRows] of byQid) {
  const derived = deriveStatusAssertions(plantationRows);
  if (derived.length > 0) {
    derivedByQid.set(qid, derived);
  }
}

console.log(
  `  Derived lifecycle assertions for ${derivedByQid.size} plantations`,
);

// ── Read gazetteer and patch ───────────────────────────────────────────────

console.log('Reading gazetteer...');
const gazeteerRaw = readFileSync(GAZETTEER_PATH, 'utf-8');
const gazetteerJsonld = JSON.parse(gazeteerRaw);
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
  const existing = entry.statusAssertions ?? [];
  if (existing.length > 0 && !FORCE) {
    skipped++;
    continue;
  }

  entry.statusAssertions = derived;
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
