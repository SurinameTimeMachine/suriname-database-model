import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'csv-parse/sync';

type ConcordansRow = Record<string, string>;

interface GeoJsonFeature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  } | null;
}

interface GeoJsonCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

const DEFAULT_LP_INPUT =
  '/home/thunnis/Projecten/STM/concordans paramaribo/locatiepunten1885.geojson';
const DEFAULT_CONCORDANS_INPUT = join(
  __dirname,
  '../..',
  'data',
  'concordans-paramaribo',
  'concordans-paramaribo-derived.csv',
);
const DEFAULT_OUTPUT_DIR = join(
  __dirname,
  '../..',
  'data',
  'concordans-paramaribo',
);

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
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

function normalizeAddressCode(value: string): string {
  return normalizeForMatch(value).replace(/\s+/g, '');
}

function normalizeComponent(value: string): string {
  return normalizeAddressCode(value).replace(/^0+(\d)/, '$1');
}

function normalizeAreaCode(value: string): string {
  const normalized = normalizeComponent(value);
  if (!normalized) return '';

  // Canonicalize first/second buitenwijk abbreviations across datasets.
  if (normalized === 'ebw' || normalized === 'eerstebuitenwijk') return '1ebw';
  if (normalized === 'tbw' || normalized === 'tweedebuitenwijk') return '2ebw';

  return normalized;
}

function parseAddressComponents(value: string) {
  const normalized = normalizeAddressCode(value);
  if (!normalized) {
    return {
      area: '',
      number: '',
      suffix: '',
    };
  }

  const match = normalized.match(/^(.+?)(\d+)([a-z]*)$/);
  if (!match) {
    return {
      area: '',
      number: '',
      suffix: '',
    };
  }

  return {
    area: normalizeAreaCode(match[1]),
    number: normalizeComponent(match[2]),
    suffix: normalizeComponent(match[3]),
  };
}

function classifyLpAddressStatus(
  area: string,
  number: string,
): 'address' | 'non-address-annotation' | 'insufficient-address-components' {
  if (area && !number) {
    return 'non-address-annotation';
  }
  if (!area || !number) {
    return 'insufficient-address-components';
  }
  return 'address';
}

function csvEscape(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function classify1885Zone(wijk1885: string): 'renumbered-1885' | 'older-regime' | 'unknown' {
  const normalized = normalizeForMatch(wijk1885);
  if (!normalized) return 'unknown';
  if (
    normalized === 'f' ||
    normalized === '1e bw' ||
    normalized === '2e bw' ||
    normalized === 'ebw' ||
    normalized === 'tbw' ||
    normalized === 'eerste buitenwijk' ||
    normalized === 'tweede buitenwijk'
  ) {
    return 'renumbered-1885';
  }
  return 'older-regime';
}

function deriveLpRows(lpData: GeoJsonCollection) {
  return lpData.features.map((feature, index) => {
    const wijk1885 = clean(feature.properties.wijk1885);
    const huisnummer1885 = clean(feature.properties.huisnummer1885);
    const toevoeging1885 = clean(feature.properties.toevoeging1885);
    const adres1885 = clean(feature.properties.adres1885);
    const straatnaam1885 = clean(feature.properties.straatnaam1885);
    const beschrijving1885 = clean(feature.properties.beschrijving1885);
    const redCommentaar = clean(feature.properties.red_commentaar);
    const lng = feature.geometry?.coordinates?.[0];
    const lat = feature.geometry?.coordinates?.[1];
    const parsedFromAdres = parseAddressComponents(adres1885);
    const lpArea = normalizeAreaCode(wijk1885) || parsedFromAdres.area;
    const lpNumber = normalizeComponent(huisnummer1885) || parsedFromAdres.number;
    const lpSuffix = normalizeComponent(toevoeging1885) || parsedFromAdres.suffix;
    const lpAddressStatus = classifyLpAddressStatus(lpArea, lpNumber);

    return {
      lpId: String(index + 1),
      wijk1885,
      huisnummer1885,
      toevoeging1885,
      adres1885,
      normalizedAdres1885: normalizeAddressCode(adres1885),
      straatnaam1885,
      normalizedStraatnaam1885: normalizeForMatch(straatnaam1885),
      beschrijving1885,
      redCommentaar,
      zoneType: classify1885Zone(wijk1885),
      normalizedLpArea: lpArea,
      normalizedLpNumber: lpNumber,
      normalizedLpSuffix: lpSuffix,
      normalizedLpCore: lpArea && lpNumber ? `${lpArea}${lpNumber}` : '',
      lpAddressStatus,
      isLinkableAddress: lpAddressStatus === 'address' ? 'yes' : 'no',
      hasGeometry: lng != null && lat != null ? 'yes' : 'no',
      lng: lng != null ? String(lng) : '',
      lat: lat != null ? String(lat) : '',
    };
  });
}

function buildCandidateRows(lpRows: ReturnType<typeof deriveLpRows>, concordansRows: ConcordansRow[]) {
  const candidates: Record<string, string>[] = [];

  const rankCandidate = (candidate: Record<string, string>) => {
    const regimeScore = candidate.matchedRegime === '1885' ? 2 : 1;
    const layerScore = candidate.matchLayer === 'exact-components' ? 2 : 1;
    const streetScore = candidate.streetMatch === 'yes' ? 1 : 0;
    return regimeScore * 100 + layerScore * 10 + streetScore;
  };

  const evaluateRegime = (
    lp: ReturnType<typeof deriveLpRows>[number],
    row: ConcordansRow,
    regime: '1885' | '1837',
  ) => {
    const rowArea = normalizeAreaCode(
      regime === '1885' ? clean(row.nw1885Zone) : clean(row.nw1837ParcelLetter),
    );
    const rowNumber = normalizeComponent(
      regime === '1885' ? clean(row.nw1885ParcelNumber) : clean(row.nw1837ParcelNumber),
    );
    const rowSuffix = normalizeComponent(
      regime === '1885' ? clean(row.nw1885ParcelSuffix) : clean(row.nw1837ParcelSuffix),
    );

    if (!lp.normalizedLpArea || !lp.normalizedLpNumber || !rowArea || !rowNumber) {
      return null;
    }

    const baseMatch = lp.normalizedLpArea === rowArea && lp.normalizedLpNumber === rowNumber;
    if (!baseMatch) {
      return null;
    }

    const exactComponentMatch = lp.normalizedLpSuffix === rowSuffix;
    const matchLayer = exactComponentMatch ? 'exact-components' : 'fallback-core-only';

    return {
      regime,
      rowArea,
      rowNumber,
      rowSuffix,
      matchLayer,
      exactComponentMatch,
    };
  };

  for (const lp of lpRows) {
    if (lp.isLinkableAddress !== 'yes') {
      continue;
    }

    for (const row of concordansRows) {
      const lpStreet = lp.normalizedStraatnaam1885;
      const street1885 = clean(row.normalizedStreet1885);
      const street1837 = clean(row.normalizedStreet1837);
      const streetMatch = Boolean(lpStreet && (lpStreet === street1885 || lpStreet === street1837));

      const regimeMatches = [
        evaluateRegime(lp, row, '1885'),
        evaluateRegime(lp, row, '1837'),
      ].filter((value): value is NonNullable<typeof value> => value != null);

      const rowCandidates: Record<string, string>[] = [];

      for (const regimeMatch of regimeMatches) {
        const candidateType = streetMatch
          ? `${regimeMatch.regime}-${regimeMatch.matchLayer}+street`
          : `${regimeMatch.regime}-${regimeMatch.matchLayer}`;

        rowCandidates.push({
          lpId: lp.lpId,
          lpAdres1885: lp.adres1885,
          lpStraatnaam1885: lp.straatnaam1885,
          lpZoneType: lp.zoneType,
          lpWijkLetter: lp.wijk1885,
          lpHuisnummer: lp.huisnummer1885,
          lpToevoeging: lp.toevoeging1885,
          concordansSourceRow: clean(row.sourceRow),
          concordansAdres1885: clean(row.address1885Derived),
          concordansAdres1837: clean(row.address1837),
          concordansStraat1885: clean(row.street1885),
          concordansStraat1837: clean(row.street1837),
          concordansWijkLetter: regimeMatch.rowArea,
          concordansHuisnummer: regimeMatch.rowNumber,
          concordansToevoeging: regimeMatch.rowSuffix,
          matchedRegime: regimeMatch.regime,
          matchLayer: regimeMatch.matchLayer,
          isSecondBest: regimeMatch.matchLayer === 'fallback-core-only' ? 'yes' : 'no',
          candidateType,
          streetMatch: streetMatch ? 'yes' : 'no',
        });
      }

      if (rowCandidates.length > 0) {
        rowCandidates.sort((a, b) => rankCandidate(b) - rankCandidate(a));
        candidates.push(rowCandidates[0]);
      }
    }
  }

  const candidateCountByLp = new Map<string, number>();
  for (const candidate of candidates) {
    candidateCountByLp.set(
      candidate.lpId,
      (candidateCountByLp.get(candidate.lpId) || 0) + 1,
    );
  }

  return candidates.map((candidate) => ({
    ...candidate,
    candidateCountForLp: String(candidateCountByLp.get(candidate.lpId) || 0),
  }));
}

function buildCsv(rows: Record<string, string>[]) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header] || '')).join(','));
  }
  return lines.join('\n');
}

function buildReviewRows(
  lpRows: ReturnType<typeof deriveLpRows>,
  candidateRows: Record<string, string>[],
) {
  const candidatesByLp = new Map<string, Record<string, string>[]>();
  for (const candidate of candidateRows) {
    const list = candidatesByLp.get(candidate.lpId) || [];
    list.push(candidate);
    candidatesByLp.set(candidate.lpId, list);
  }

  const unresolvedRows: Record<string, string>[] = [];
  const nonAddressRows: Record<string, string>[] = [];
  const insufficientAddressRows: Record<string, string>[] = [];
  const multipleRows: Record<string, string>[] = [];
  const summaryRows: Record<string, string>[] = [];

  for (const lp of lpRows) {
    const candidates = candidatesByLp.get(lp.lpId) || [];
    const candidateCount = candidates.length;
    const linkingStatus =
      lp.isLinkableAddress !== 'yes'
        ? 'ignored-non-address-annotation'
        : candidateCount === 0
          ? 'unresolved-linkable-address'
          : 'matched';

    const summary = candidates
      .slice(0, 8)
      .map((candidate) =>
        [
          candidate.concordansSourceRow,
          candidate.matchedRegime,
          candidate.concordansAdres1885 || candidate.concordansAdres1837,
          candidate.concordansStraat1885 || candidate.concordansStraat1837,
          candidate.candidateType,
        ].join(' | '),
      )
      .join(' || ');

    summaryRows.push({
      lpId: lp.lpId,
      adres1885: lp.adres1885,
      straatnaam1885: lp.straatnaam1885,
      zoneType: lp.zoneType,
      lpAddressStatus: lp.lpAddressStatus,
      isLinkableAddress: lp.isLinkableAddress,
      linkingStatus,
      hasGeometry: lp.hasGeometry,
      candidateCount: String(candidateCount),
      candidateSummary: summary,
    });

    if (lp.isLinkableAddress !== 'yes') {
      const commonRow = {
        lpId: lp.lpId,
        adres1885: lp.adres1885,
        straatnaam1885: lp.straatnaam1885,
        normalizedAdres1885: lp.normalizedAdres1885,
        normalizedStraatnaam1885: lp.normalizedStraatnaam1885,
        wijk1885: lp.wijk1885,
        huisnummer1885: lp.huisnummer1885,
        toevoeging1885: lp.toevoeging1885,
        lpAddressStatus: lp.lpAddressStatus,
        isLinkableAddress: lp.isLinkableAddress,
        zoneType: lp.zoneType,
        hasGeometry: lp.hasGeometry,
        lng: lp.lng,
        lat: lp.lat,
        redCommentaar: lp.redCommentaar,
      };

      if (lp.lpAddressStatus === 'non-address-annotation') {
        nonAddressRows.push(commonRow);
      } else {
        insufficientAddressRows.push(commonRow);
      }
      continue;
    }

    if (candidateCount === 0) {
      unresolvedRows.push({
        lpId: lp.lpId,
        adres1885: lp.adres1885,
        straatnaam1885: lp.straatnaam1885,
        normalizedAdres1885: lp.normalizedAdres1885,
        normalizedStraatnaam1885: lp.normalizedStraatnaam1885,
        wijk1885: lp.wijk1885,
        huisnummer1885: lp.huisnummer1885,
        toevoeging1885: lp.toevoeging1885,
        lpAddressStatus: lp.lpAddressStatus,
        isLinkableAddress: lp.isLinkableAddress,
        zoneType: lp.zoneType,
        hasGeometry: lp.hasGeometry,
        lng: lp.lng,
        lat: lp.lat,
        redCommentaar: lp.redCommentaar,
      });
      continue;
    }

    if (candidateCount > 1) {
      multipleRows.push({
        lpId: lp.lpId,
        adres1885: lp.adres1885,
        straatnaam1885: lp.straatnaam1885,
        zoneType: lp.zoneType,
        candidateCount: String(candidateCount),
        candidateSummary: summary,
      });
    }
  }

  return {
    unresolvedRows,
    nonAddressRows,
    insufficientAddressRows,
    multipleRows,
    summaryRows,
  };
}

function buildReport(lpRows: ReturnType<typeof deriveLpRows>, candidateRows: Record<string, string>[]) {
  const totalLp = lpRows.length;
  const linkableLp = lpRows.filter((row) => row.isLinkableAddress === 'yes').length;
  const ignoredNonAddressLp = lpRows.filter(
    (row) => row.lpAddressStatus === 'non-address-annotation',
  ).length;
  const ignoredInsufficientAddressLp = lpRows.filter(
    (row) => row.lpAddressStatus === 'insufficient-address-components',
  ).length;
  const withAddress1885 = lpRows.filter((row) => row.normalizedAdres1885).length;
  const withoutGeometry = lpRows.filter((row) => row.hasGeometry === 'no').length;
  const renumbered1885 = lpRows.filter((row) => row.zoneType === 'renumbered-1885').length;
  const olderRegime = lpRows.filter((row) => row.zoneType === 'older-regime').length;

  const candidateCountByLp = new Map<string, number>();
  for (const candidate of candidateRows) {
    candidateCountByLp.set(candidate.lpId, Number(candidate.candidateCountForLp));
  }

  const exactLayerCandidates = candidateRows.filter(
    (candidate) => candidate.matchLayer === 'exact-components',
  ).length;
  const fallbackLayerCandidates = candidateRows.filter(
    (candidate) => candidate.matchLayer === 'fallback-core-only',
  ).length;

  const lpWithExactLayer = new Set(
    candidateRows
      .filter((candidate) => candidate.matchLayer === 'exact-components')
      .map((candidate) => candidate.lpId),
  ).size;
  const lpWithFallbackOnly = lpRows.filter((row) => {
    const lpCandidates = candidateRows.filter((candidate) => candidate.lpId === row.lpId);
    if (lpCandidates.length === 0) return false;
    return lpCandidates.every((candidate) => candidate.matchLayer === 'fallback-core-only');
  }).length;

  const unresolvedLp = lpRows.filter(
    (row) => row.isLinkableAddress === 'yes' && !candidateCountByLp.has(row.lpId),
  ).length;
  const singleCandidateLp = lpRows.filter(
    (row) => row.isLinkableAddress === 'yes' && candidateCountByLp.get(row.lpId) === 1,
  ).length;
  const multipleCandidateLp = lpRows.filter(
    (row) => row.isLinkableAddress === 'yes' && (candidateCountByLp.get(row.lpId) || 0) > 1,
  ).length;

  const lines: string[] = [];
  lines.push('# Locatiepunten 1885 First Link Report');
  lines.push('');
  lines.push(`- Total LP rows: ${totalLp}`);
  lines.push(`- LP rows treated as linkable addresses: ${linkableLp}`);
  lines.push(`- LP rows ignored as non-address annotations (wijk only): ${ignoredNonAddressLp}`);
  lines.push(
    `- LP rows ignored due to insufficient address components: ${ignoredInsufficientAddressLp}`,
  );
  lines.push(`- LP rows with 1885 address: ${withAddress1885}`);
  lines.push(`- LP rows without geometry: ${withoutGeometry}`);
  lines.push(`- LP rows in explicit 1885 renumbered zones: ${renumbered1885}`);
  lines.push(`- LP rows outside explicit 1885 renumbered zones: ${olderRegime}`);
  lines.push(`- Linkable LP rows with at least one concordans candidate: ${linkableLp - unresolvedLp}`);
  lines.push(`- Candidate rows in exact layer (wijk + huisnummer + toevoeging): ${exactLayerCandidates}`);
  lines.push(`- Candidate rows in fallback layer (wijk + huisnummer only): ${fallbackLayerCandidates}`);
  lines.push(`- LP rows with at least one exact-layer candidate: ${lpWithExactLayer}`);
  lines.push(`- LP rows with fallback-only candidates: ${lpWithFallbackOnly}`);
  lines.push(`- LP rows with exactly one candidate: ${singleCandidateLp}`);
  lines.push(`- LP rows with multiple candidates: ${multipleCandidateLp}`);
  lines.push(`- Linkable LP rows unresolved (no wijk + huisnummer match): ${unresolvedLp}`);
  lines.push('');
  lines.push('Layered logic: exact layer matches wijk + huisnummer + toevoeging; fallback layer matches only wijk + huisnummer and is flagged as second-best. Wijk-only LP rows are labeled non-address annotations and excluded from linking.');
  return lines.join('\n');
}

function main() {
  const lpPath = process.env.LOCATIEPUNTEN1885_GEOJSON || DEFAULT_LP_INPUT;
  const concordansPath = process.env.CONCORDANS_DERIVED_CSV || DEFAULT_CONCORDANS_INPUT;
  const outputDir = process.env.CONCORDANS_PARAMARIBO_OUT || DEFAULT_OUTPUT_DIR;

  if (!existsSync(lpPath)) {
    throw new Error(`Locatiepunten 1885 GeoJSON not found: ${lpPath}`);
  }
  if (!existsSync(concordansPath)) {
    throw new Error(`Concordans derived CSV not found: ${concordansPath}`);
  }

  const lpData = JSON.parse(readFileSync(lpPath, 'utf-8')) as GeoJsonCollection;
  const concordansRows = parse(readFileSync(concordansPath, 'utf-8'), {
    columns: true,
    skip_empty_lines: true,
  }) as ConcordansRow[];

  const lpRows = deriveLpRows(lpData);
  const candidateRows = buildCandidateRows(lpRows, concordansRows);
  const reviewRows = buildReviewRows(lpRows, candidateRows);
  const lpCsv = buildCsv(lpRows);
  const candidateCsv = buildCsv(candidateRows);
  const unresolvedCsv = buildCsv(reviewRows.unresolvedRows);
  const nonAddressCsv = buildCsv(reviewRows.nonAddressRows);
  const insufficientAddressCsv = buildCsv(reviewRows.insufficientAddressRows);
  const multipleCsv = buildCsv(reviewRows.multipleRows);
  const summaryCsv = buildCsv(reviewRows.summaryRows);
  const report = buildReport(lpRows, candidateRows);

  mkdirSync(outputDir, { recursive: true });
  const lpOut = join(outputDir, 'locatiepunten1885-derived.csv');
  const candidateOut = join(outputDir, 'locatiepunten1885-concordans-candidates.csv');
  const unresolvedOut = join(outputDir, 'locatiepunten1885-unresolved.csv');
  const nonAddressOut = join(outputDir, 'locatiepunten1885-non-address-annotations.csv');
  const insufficientAddressOut = join(
    outputDir,
    'locatiepunten1885-insufficient-address-components.csv',
  );
  const multipleOut = join(outputDir, 'locatiepunten1885-multiple-candidates.csv');
  const summaryOut = join(outputDir, 'locatiepunten1885-candidate-summary.csv');
  const reportOut = join(outputDir, 'locatiepunten1885-link-report.md');

  writeFileSync(lpOut, lpCsv);
  writeFileSync(candidateOut, candidateCsv);
  writeFileSync(unresolvedOut, unresolvedCsv);
  writeFileSync(nonAddressOut, nonAddressCsv);
  writeFileSync(insufficientAddressOut, insufficientAddressCsv);
  writeFileSync(multipleOut, multipleCsv);
  writeFileSync(summaryOut, summaryCsv);
  writeFileSync(reportOut, report);

  console.log(`LP rows: ${lpRows.length}`);
  console.log(`Candidate rows: ${candidateRows.length}`);
  console.log(`Ignored non-address annotation rows: ${reviewRows.nonAddressRows.length}`);
  console.log(
    `Ignored rows with insufficient address components: ${reviewRows.insufficientAddressRows.length}`,
  );
  console.log(`Unresolved LP rows: ${reviewRows.unresolvedRows.length}`);
  console.log(`LP rows with multiple candidates: ${reviewRows.multipleRows.length}`);
  console.log(`Derived LP CSV written to: ${lpOut}`);
  console.log(`Candidate CSV written to: ${candidateOut}`);
  console.log(`Unresolved LP CSV written to: ${unresolvedOut}`);
  console.log(`Non-address annotations CSV written to: ${nonAddressOut}`);
  console.log(`Insufficient-address CSV written to: ${insufficientAddressOut}`);
  console.log(`Multiple-candidate LP CSV written to: ${multipleOut}`);
  console.log(`LP candidate summary CSV written to: ${summaryOut}`);
  console.log(`Link report written to: ${reportOut}`);
}

main();