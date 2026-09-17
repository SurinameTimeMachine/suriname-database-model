/**
 * Build the Paramaribo address concordance dataset that links Concordans
 * Paramaribo (Muntjewerff) rows to the imported 1885 address-point gazetteer
 * places (see import-paramaribo-address-points-1885.ts).
 *
 * The relationship is many-to-many: a concordans row may match zero, one, or
 * more 1885 place points, and a place point may be the match target of
 * multiple concordans rows (the same physical address recorded across
 * periods). Split/merge markers from the concordans are carried through so
 * the UI can surface them.
 *
 * This builder reads ONLY committed derived artifacts under
 * data/concordans-paramaribo/ so it can run inside `pnpm pipeline` on CI:
 * the raw concordans source stays outside Git per the project's data policy.
 * Only the resulting era-address values + place links are published here,
 * which is the permitted use per the Muntjewerff license terms (attribution
 * required, see MUNTJEWERFF_ATTRIBUTION below).
 *
 * Run with: npx tsx scripts/link-concordans-1885-places.ts
 */
import { parse } from 'csv-parse/sync';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const CONCORDANS_DERIVED_CSV = join(
  __dirname,
  '../../data/concordans-paramaribo/concordans-paramaribo-derived.csv',
);
const LP_CANDIDATES_CSV = join(
  __dirname,
  '../../data/concordans-paramaribo/locatiepunten1885-concordans-candidates.csv',
);
const LP_DERIVED_CSV = join(
  __dirname,
  '../../data/concordans-paramaribo/locatiepunten1885-derived.csv',
);
const OUT_PATH = join(__dirname, '../../data/paramaribo-address-concordance.json');

const STM = 'https://data.surinametijdmachine.org/';

/** Registry source authority for the Concordans Paramaribo (Muntjewerff).
 * Stored on every link so downstream projections and UI attribution read
 * from data instead of a hardcoded URL. */
export const CONCORDANS_SOURCE_ID = 'concordans-paramaribo';

export const MUNTJEWERFF_ATTRIBUTION =
  'For historical addresses in Paramaribo we are grateful for the Concordans by Dr. Muntjewerff, see https://www.concordansparamaribo.info/. This is a pilot version and can contain mistakes that are not attributable to Dr. Muntjewerff.';

function clean(value: string | undefined): string {
  return (value ?? '').replace(/^\uFEFF/, '').trim();
}

function placeIdForLp(lpId: string): string {
  return `stm-1885-address-${String(Number(lpId)).padStart(4, '0')}`;
}

type ConcordansRow = Record<string, string>;

type EraDetail = {
  address: string | null;
  parcel?: Record<string, string>;
};

type LinkCertainty = 'certain' | 'probable' | 'unresolved';

type AddressLink = {
  id: string;
  sourceRow: string | null;
  source: string;
  key1885: string | null;
  placeIds: string[];
  certaintyByPlace: Record<string, LinkCertainty>;
  eras: Record<string, EraDetail>;
  splitMarker: string | null;
  newMarker: string | null;
  project: { code: string; number: string; suffix: string } | null;
  note?: string;
};

/**
 * Per-place certainty accessor. The certainty of a link holds for the
 * (sourceRow, place) relationship, since a concordans row may match one
 * LP exactly (certain) and another LP only by core number (probable).
 */
function linkCertaintyForPlace(
  link: AddressLink,
  placeId: string,
): LinkCertainty {
  return link.certaintyByPlace[placeId] ?? 'probable';
}

/** Build one era entry; omit when neither an address nor parcel components
 * are recorded so the UI only renders attested regimes. */
function eraDetail(address: string, parcel: Record<string, string>): EraDetail | null {
  const cleanedAddress = clean(address) || null;
  const cleanedParcel: Record<string, string> = {};
  for (const [key, value] of Object.entries(parcel)) {
    const cleanedValue = clean(value);
    if (cleanedValue) cleanedParcel[key] = cleanedValue;
  }
  if (!cleanedAddress && Object.keys(cleanedParcel).length === 0) return null;
  if (Object.keys(cleanedParcel).length === 0) return { address: cleanedAddress };
  return { address: cleanedAddress, parcel: cleanedParcel };
}

function eraAddresses(row: ConcordansRow): Record<string, EraDetail> {
  const eras: Record<string, EraDetail> = {};
  const entries: Array<[string, EraDetail | null]> = [
    [
      'wijk1782',
      eraDetail(row.wijk1782Street, {
        code: row.wijk1782Code,
        districtNumber: row.wijk1782DistrictNumber,
        parcelLetter: row.wijk1782ParcelLetter,
        parcelNumber: row.wijk1782ParcelNumber,
        parcelPlus: row.wijk1782ParcelPlus,
        side: row.wijk1782Side,
      }),
    ],
    [
      'ow1817',
      eraDetail(row.address1817, {
        districtCode: row.ow1817DistrictCode,
        buurtLetter: row.ow1817BuurtLetter,
        buurtNumber: row.ow1817BuurtNumber,
        parcelLetter: row.ow1817ParcelLetter,
        parcelNumber: row.ow1817ParcelNumber,
        parcelSuffix: row.ow1817ParcelSuffix,
      }),
    ],
    [
      'nw1837',
      eraDetail(row.address1837, {
        districtCode: row.nw1837DistrictCode,
        outerDistrict: row.nw1837OuterDistrict,
        parcelLetter: row.nw1837ParcelLetter,
        parcelNumber: row.nw1837ParcelNumber,
        parcelSuffix: row.nw1837ParcelSuffix,
      }),
    ],
    [
      'nw1885',
      eraDetail(clean(row.address1885Derived) || clean(row.address1885Cell), {
        zone: row.nw1885Zone,
        parcelNumber: row.nw1885ParcelNumber,
        parcelSuffix: row.nw1885ParcelSuffix,
      }),
    ],
    ['volkstelling1921', eraDetail(row.address1921, {})],
    ['modern2022', eraDetail(row.address2022, {})],
  ];
  for (const [era, detail] of entries) {
    if (detail) eras[era] = detail;
  }
  return eras;
}

function parseCsvFile(path: string): ConcordansRow[] {
  return parse(readFileSync(path, 'utf-8'), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as ConcordansRow[];
}

function main() {
  const derivedRows = parseCsvFile(CONCORDANS_DERIVED_CSV);
  const candidateRows = parseCsvFile(LP_CANDIDATES_CSV);
  const lpRows = parseCsvFile(LP_DERIVED_CSV);
  console.log(
    `Loaded ${derivedRows.length} concordans rows, ${candidateRows.length} LP candidates, ${lpRows.length} LP rows`,
  );

  const rowBySourceRow = new Map<string, ConcordansRow>();
  for (const row of derivedRows) {
    rowBySourceRow.set(clean(row.sourceRow), row);
  }

  const lpLinkableById = new Map<string, { lpAdres1885: string }>();
  for (const row of lpRows) {
    if (clean(row.isLinkableAddress) !== 'yes') continue;
    lpLinkableById.set(clean(row.lpId), {
      lpAdres1885: clean(row.adres1885),
    });
  }

  // Many-to-many index: concordans source row -> matched LP ids, tracking
  // the certainty of each (sourceRow, place) relationship separately. A
  // source row may match one LP exactly (certain) and another LP only by
  // core number (probable); a row-level flag would wrongly promote the
  // fallback match, so exactness is recorded per relationship.
  const certaintyByPlaceAndSourceRow = new Map<string, LinkCertainty>();
  const placeIdsBySourceRow = new Map<string, Set<string>>();
  for (const candidate of candidateRows) {
    const sourceRow = clean(candidate.concordansSourceRow);
    const lpId = clean(candidate.lpId);
    if (!sourceRow || !lpId) continue;
    if (!rowBySourceRow.has(sourceRow)) {
      throw new Error(
        `Candidate references unknown concordans source row: ${sourceRow}`,
      );
    }
    if (!lpLinkableById.has(lpId)) {
      throw new Error(
        `Candidate references unknown or non-linkable LP id: ${lpId}`,
      );
    }
    const placeId = placeIdForLp(lpId);
    const relationshipCertainty =
      clean(candidate.matchLayer) === 'exact-components' ? 'certain' : 'probable';
    const key = `${sourceRow}${placeId}`;
    if (certaintyByPlaceAndSourceRow.get(key) !== 'certain') {
      certaintyByPlaceAndSourceRow.set(key, relationshipCertainty);
    }
    const placeIds = placeIdsBySourceRow.get(sourceRow) ?? new Set<string>();
    placeIds.add(placeId);
    placeIdsBySourceRow.set(sourceRow, placeIds);
  }

  const links: AddressLink[] = [];

  for (const [sourceRow, row] of rowBySourceRow) {
    const placeIds = placeIdsBySourceRow.get(sourceRow);
    if (!placeIds || placeIds.size === 0) continue;
    const certaintyByPlace: Record<string, LinkCertainty> = {};
    for (const placeId of [...placeIds].sort()) {
      certaintyByPlace[placeId] =
        certaintyByPlaceAndSourceRow.get(`${sourceRow}${placeId}`) ?? 'probable';
    }
    links.push({
      id: `concordans-${sourceRow}`,
      sourceRow,
      source: CONCORDANS_SOURCE_ID,
      key1885: clean(row.address1885Derived) || clean(row.address1885Cell) || clean(row.address1837) || null,
      placeIds: [...placeIds].sort(),
      certaintyByPlace,
      eras: eraAddresses(row),
      splitMarker: clean(row.splitMarker) || null,
      newMarker: clean(row.newMarker) || null,
      project:
        clean(row.projectCode) || clean(row.projectNumber) || clean(row.projectSuffix)
          ? {
              code: clean(row.projectCode),
              number: clean(row.projectNumber),
              suffix: clean(row.projectSuffix),
            }
          : null,
    });
  }

  // Linkable LPs without any concordans candidate stay explicitly unresolved
  // so the UI can surface them instead of silently omitting them.
  const resolvedPlaceIds = new Set(links.flatMap((link) => link.placeIds));
  for (const [lpId, lp] of [...lpLinkableById.entries()].sort(
    (a, b) => Number(a[0]) - Number(b[0]),
  )) {
    const placeId = placeIdForLp(lpId);
    if (resolvedPlaceIds.has(placeId)) continue;
    links.push({
      id: `unresolved-${placeId}`,
      sourceRow: null,
      source: CONCORDANS_SOURCE_ID,
      key1885: lp.lpAdres1885 || null,
      placeIds: [placeId],
      certaintyByPlace: { [placeId]: 'unresolved' },
      eras: {},
      splitMarker: null,
      newMarker: null,
      project: null,
      note: 'No Concordans Paramaribo row matched this 1885 location point.',
    });
  }

  // Many-to-many report.
  const rowCountByPlaceId = new Map<string, number>();
  for (const link of links) {
    for (const placeId of link.placeIds) {
      rowCountByPlaceId.set(placeId, (rowCountByPlaceId.get(placeId) ?? 0) + 1);
    }
  }
  const placesWithMultipleRows = [...rowCountByPlaceId.values()].filter(
    (count) => count > 1,
  ).length;
  const rowsWithMultiplePlaces = links.filter(
    (link) => link.placeIds.length > 1,
  ).length;
  const relationshipCertainties = links.flatMap((link) =>
    link.placeIds.map((placeId) => linkCertaintyForPlace(link, placeId)),
  );
  const certainCount = relationshipCertainties.filter(
    (certainty) => certainty === 'certain',
  ).length;
  const probableCount = relationshipCertainties.filter(
    (certainty) => certainty === 'probable',
  ).length;
  const unresolvedCount = relationshipCertainties.filter(
    (certainty) => certainty === 'unresolved',
  ).length;

  console.log(`Links: ${links.length}`);
  console.log(`  relationship-certain (exact component match): ${certainCount}`);
  console.log(`  relationship-probable (core-number fallback): ${probableCount}`);
  console.log(`  relationship-unresolved (no candidate):       ${unresolvedCount}`);
  console.log(`Place points matched by >1 concordans row: ${placesWithMultipleRows}`);
  console.log(`Concordans rows matching >1 place point: ${rowsWithMultiplePlaces}`);

  const document = {
    '@id': `${STM}database/paramaribo-address-concordance`,
    '@type': 'sdo:Dataset',
    'sdo:name': 'Paramaribo historical address concordance (derived)',
    'sdo:description':
      'Derived era-address values, regime parcel components, and 1885 place-point links, generated from committed Concordans Paramaribo derived artifacts. ' +
      MUNTJEWERFF_ATTRIBUTION,
    attribution: MUNTJEWERFF_ATTRIBUTION,
    sources: [
      'data/concordans-paramaribo/concordans-paramaribo-derived.csv',
      'data/concordans-paramaribo/locatiepunten1885-concordans-candidates.csv',
      'data/concordans-paramaribo/locatiepunten1885-derived.csv',
    ],
    links,
  };
  writeFileSync(OUT_PATH, `${JSON.stringify(document, null, 2)}\n`, 'utf-8');
  console.log(`\nWrote ${OUT_PATH} (${links.length} links)`);
}

main();
