/**
 * Link Ward Register rows (1828-1847) through the derived Concordans
 * Paramaribo to 1885 address-point places, and model every recorded
 * inhabitant — free and enslaved — as an individual person attestation on
 * the resolved location point.
 *
 * Personhood principle: enslaved individuals in the registers are real human
 * beings. Each counted person in the household matrix (Xma/Xfa/Xmc/Xfc /
 * Bma/Bfa/Bmc/Bfc/Unk) is individualized as one observed-person attestation
 * carrying the recorded demographic categories (recorded category, sex, age
 * group), the household context (head of household, address, year, scan),
 * and a stable id for future linkage with the Slave Registers. Counts are
 * never stored as bare numbers without their individualized attestations.
 *
 * Address resolution reads ONLY committed derived artifacts:
 *   data/04-ward-registers - Paramaribo Ward Registers 1828-1847/WR28-47.csv
 *   data/04-ward-registers .../Standardization of street names/street standardization 20240328.csv
 *   data/concordans-paramaribo/concordans-paramaribo-derived.csv
 *   data/paramaribo-address-concordance.json
 * so the script runs inside `pnpm pipeline` on CI.
 *
 * Regime-aware strategy ladder (certainty is per relationship):
 *   OW pre-1837: (buurt, wijkletter, number, suffix) exact -> certain;
 *     drop buurt -> probable; drop suffix -> probable.
 *   NW post-1837: (wijkletter, number, suffix) exact -> certain;
 *     drop suffix -> probable.
 * Street-name cross-check demotes mismatches one level, never promotes.
 *
 * Run with: npx tsx scripts/link-ward-registers-to-addresses.ts
 */
import { parse } from 'csv-parse/sync';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const WARD_REGISTERS_CSV = join(
  __dirname,
  '../../data/04-ward-registers - Paramaribo Ward Registers 1828-1847/WR28-47.csv',
);
const STREET_STD_CSV = join(
  __dirname,
  '../../data/04-ward-registers - Paramaribo Ward Registers 1828-1847/Standardization of street names/street standardization 20240328.csv',
);
const CONCORDANS_DERIVED_CSV = join(
  __dirname,
  '../../data/concordans-paramaribo/concordans-paramaribo-derived.csv',
);
const CONCORDANCE_PATH = join(
  __dirname,
  '../../data/paramaribo-address-concordance.json',
);
const OUT_PATH = join(
  __dirname,
  '../../data/paramaribo-ward-register-address-links.json',
);

const STM = 'https://data.surinametijdmachine.org/';
export const WARD_REGISTERS_SOURCE_ID = 'ward-registers';
export const CONCORDANS_SOURCE_ID = 'concordans-paramaribo';
export const MUNTJEWERFF_ATTRIBUTION =
  'For historical addresses in Paramaribo we are grateful for the Concordans by Dr. Muntjewerff, see https://www.concordansparamaribo.info/. This is a pilot version and can contain mistakes that are not attributable to Dr. Muntjewerff.';

type Certainty = 'certain' | 'probable' | 'unresolved';
type MatchStrategy =
  | 'ow-exact'
  | 'ow-without-buurt'
  | 'ow-without-suffix'
  | 'nw-exact'
  | 'nw-without-suffix'
  | 'unresolved';

type ConcordansRow = Record<string, string>;
type WardRow = Record<string, string>;

type ConcordanceLink = {
  id: string;
  sourceRow: string | null;
  placeIds: string[];
  certaintyByPlace: Record<string, Certainty>;
  key1885: string | null;
};

type ObservedPerson = {
  id: string;
  status: 'free' | 'enslaved';
  name: string | null;
  age: string | null;
  sex: string | null;
  recordedCategory: string | null;
  ageGroup: 'adult' | 'child' | 'unknown' | null;
  ethnicity: string | null;
  occupation: string | null;
  origin: string | null;
  religion: string | null;
  householdContext: string | null;
  notes: string | null;
};

type WardAddressLink = {
  id: string;
  sourceRecordId: string;
  year: number;
  regime: 'ow' | 'nw';
  sourceAddress: {
    addressFull: string | null;
    streetName: string | null;
    ward: string | null;
    wardLetter: string;
    houseNumber: string;
    addition: string | null;
    room: string | null;
    neighbourhoodCode: string | null;
    locationNote: string | null;
    addressRemarks: string | null;
  };
  observedPersons: ObservedPerson[];
  enslavedRemarks: string | null;
  sourceScan: string | null;
  householdHead: string | null;
  concordansIds: string[];
  placeIds: string[];
  matchStrategy: MatchStrategy;
  certainty: Certainty;
};

function clean(value: string | undefined): string {
  return (value ?? '').replace(/^﻿/, '').trim();
}

function normalizeComponent(value: string | undefined): string {
  return clean(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
    .replace(/^0+(\d)/, '$1');
}

function normalizeStreet(value: string | undefined): string {
  return clean(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.]/g, '')
    .toLowerCase();
}

function parseCoreAndSuffix(raw: string): { core: string; suffix: string } {
  const compact = normalizeComponent(raw);
  const match = compact.match(/^(.+?)(\d+)([a-z]*)$/);
  if (!match) return { core: compact, suffix: '' };
  return { core: `${match[1]}${match[2]}`, suffix: match[3] ?? '' };
}

function valueOrNull(value: string | undefined): string | null {
  return clean(value) || null;
}

function countField(value: string | undefined): number {
  const cleaned = clean(value);
  if (!cleaned || !/^\d+$/.test(cleaned)) return 0;
  return Number(cleaned);
}

function namedFreePerson(row: WardRow, kaartHead: string | null): ObservedPerson | null {
  // Rows flagged Enslaved=1 describe an enslaved resident — they are
  // attested by namedEnslavedPerson() below, never as free.
  if (clean(row.Enslaved) === '1') return null;
  const name = [
    clean(row.Voornaam),
    clean(row.Tussenvoegsel),
    clean(row.Achternaam),
    clean(row.Suffix),
  ]
    .filter(Boolean)
    .join(' ');
  if (!name) return null;
  const remarks = [clean(row.Freeperson_Remarks), clean(row.Annotaties)]
    .filter(Boolean)
    .join(' · ');
  return {
    id: `ward-register-${clean(row.Id)}-free`,
    status: 'free',
    name,
    age: valueOrNull(row.Leeftijd),
    sex: valueOrNull(row.Sex),
    recordedCategory: valueOrNull(row.Etniciteit),
    ageGroup: null,
    ethnicity: valueOrNull(row.Etniciteit),
    occupation: valueOrNull(row.Beroep),
    origin: valueOrNull(row.Herkomst),
    religion: valueOrNull(row.Religie),
    householdContext: kaartHead,
    notes: remarks || null,
  };
}

function namedEnslavedPerson(row: WardRow, kaartHead: string | null): ObservedPerson | null {
  if (clean(row.Enslaved) !== '1') return null;
  const name = [
    clean(row.Voornaam),
    clean(row.Tussenvoegsel),
    clean(row.Achternaam),
    clean(row.Suffix),
  ]
    .filter(Boolean)
    .join(' ');
  const remarks = [
    clean(row.Diversen),
    clean(row.Enslaved_Remarks),
    clean(row.Annotaties),
  ]
    .filter(Boolean)
    .join(' · ');
  return {
    id: `ward-register-${clean(row.Id)}-enslaved-named`,
    status: 'enslaved',
    name: name || null,
    age: valueOrNull(row.Leeftijd),
    sex: valueOrNull(row.Sex),
    recordedCategory: valueOrNull(row.Etniciteit),
    ageGroup: null,
    ethnicity: valueOrNull(row.Etniciteit),
    occupation: valueOrNull(row.Beroep),
    origin: valueOrNull(row.Herkomst),
    religion: valueOrNull(row.Religie),
    householdContext: kaartHead,
    notes: remarks || null,
  };
}

/**
 * Individualize every counted enslaved person in the household matrix.
 * Each counted person becomes one observed-person attestation carrying the
 * recorded demographic categories; the stable per-category index supports
 * future linkage with the Slave Registers.
 */
function individualizedEnslavedPersons(
  row: WardRow,
  kaartHead: string | null,
): ObservedPerson[] {
  const categories = [
    ['Xma', 'kleurling', 'male', 'adult'],
    ['Xfa', 'kleurling', 'female', 'adult'],
    ['Xmc', 'kleurling', 'male', 'child'],
    ['Xfc', 'kleurling', 'female', 'child'],
    ['Bma', 'zwarte', 'male', 'adult'],
    ['Bfa', 'zwarte', 'female', 'adult'],
    ['Bmc', 'zwarte', 'male', 'child'],
    ['Bfc', 'zwarte', 'female', 'child'],
    ['Unk', 'unknown', 'unknown', 'unknown'],
  ] as const;
  const persons: ObservedPerson[] = [];
  const remarks = [clean(row.Enslaved_Remarks), clean(row.Diversen)]
    .filter(Boolean)
    .join(' · ');
  for (const [column, recordedCategory, sex, ageGroup] of categories) {
    const count = countField(row[column]);
    for (let index = 0; index < count; index++) {
      persons.push({
        id: `ward-register-${clean(row.Id)}-enslaved-${column.toLowerCase()}-${index + 1}`,
        status: 'enslaved',
        name: null,
        age: null,
        sex,
        recordedCategory,
        ageGroup,
        ethnicity: recordedCategory,
        occupation: null,
        origin: null,
        religion: null,
        householdContext: kaartHead,
        notes: remarks || null,
      });
    }
  }
  return persons;
}

function parseCsvFile(path: string, encoding: BufferEncoding = 'utf-8'): ConcordansRow[] {
  const raw = readFileSync(path, encoding);
  return parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as ConcordansRow[];
}

function loadWardRows(): WardRow[] {
  // Quote-aware parse (csv-parse, same as the rest of the pipeline):
  // free-text remarks (Remarks_Orig) contain quoted fields with embedded
  // semicolons (e.g. "vendumeester; [overleden ...]") that naive
  // line.split(';') would shred into the wrong columns.
  const raw = readFileSync(WARD_REGISTERS_CSV, 'utf-8').replace(/^﻿/, '');
  return parse(raw, {
    columns: (header: string[]) =>
      header.map((column) =>
        column
          .trim()
          .replace(/^'/, '')
          .replace(/'$/, '')
          .trim(),
      ),
    skip_empty_lines: true,
    trim: true,
    delimiter: ';',
    relax_column_count: true,
  }) as WardRow[];
}

function streetIndex(): Map<string, string> {
  // latin1: the file contains Windows-1252 bytes (e.g. Dominéstraat); the
  // header has no quotes ('id;unique streetname;standardized streetname').
  const raw = readFileSync(STREET_STD_CSV, 'latin1').replace(/^﻿/, '');
  const lines = raw.split('\n').filter((line) => line.trim().length > 0);
  const index = new Map<string, string>();
  for (const line of lines.slice(1)) {
    const fields = line.split(';');
    const variant = (fields[1] ?? '').trim();
    const canonical = (fields[2] ?? '').trim();
    if (variant && canonical) index.set(normalizeStreet(variant), canonical);
  }
  return index;
}

function lowerCertainty(a: Certainty, b: Certainty): Certainty {
  const rank: Record<Certainty, number> = {
    certain: 2,
    probable: 1,
    unresolved: 0,
  };
  return rank[a] <= rank[b] ? a : b;
}

function main() {
  const concordance = JSON.parse(
    readFileSync(CONCORDANCE_PATH, 'utf-8'),
  ) as { links: ConcordanceLink[] };
  const concordansRows = parseCsvFile(CONCORDANS_DERIVED_CSV);
  const wardRows = loadWardRows();
  const streetStdIndex = streetIndex();
  console.log(
    `Loaded ${concordance.links.length} concordance links, ${concordansRows.length} concordans rows, ${wardRows.length} ward rows, ${streetStdIndex.size} street variants`,
  );

  const rowBySourceRow = new Map<string, ConcordansRow>();
  for (const row of concordansRows) rowBySourceRow.set(clean(row.sourceRow), row);
  const linkBySourceRow = new Map<string, ConcordanceLink>();
  for (const link of concordance.links) {
    if (link.sourceRow) linkBySourceRow.set(link.sourceRow, link);
  }

  // Regime indexes over the derived concordans components.
  const owExact = new Map<string, ConcordansRow[]>();
  const owWithoutBuurt = new Map<string, ConcordansRow[]>();
  const owWithoutSuffix = new Map<string, ConcordansRow[]>();
  const nwExact = new Map<string, ConcordansRow[]>();
  const nwWithoutSuffix = new Map<string, ConcordansRow[]>();
  const pushTo = (index: Map<string, ConcordansRow[]>, key: string, row: ConcordansRow) => {
    if (!key.replace(/\|/g, '')) return;
    index.set(key, [...(index.get(key) ?? []), row]);
  };
  for (const row of concordansRows) {
    const owBuurt = normalizeComponent(row.ow1817BuurtLetter);
    const owLetter = normalizeComponent(row.ow1817ParcelLetter);
    const { core: owCore, suffix: owSuffix } = parseCoreAndSuffix(
      `${row.ow1817ParcelLetter}${row.ow1817ParcelNumber}`,
    );
    pushTo(owExact, `${owBuurt}|${owLetter}|${owCore}|${owSuffix}`, row);
    pushTo(owWithoutBuurt, `${owLetter}|${owCore}|${owSuffix}`, row);
    pushTo(owWithoutSuffix, `${owBuurt}|${owLetter}|${owCore}`, row);
    const nwLetter = normalizeComponent(row.nw1837ParcelLetter);
    const { core: nwCore, suffix: nwSuffix } = parseCoreAndSuffix(
      `${row.nw1837ParcelLetter}${row.nw1837ParcelNumber}`,
    );
    pushTo(nwExact, `${nwLetter}|${nwCore}|${nwSuffix}`, row);
    pushTo(nwWithoutSuffix, `${nwLetter}|${nwCore}`, row);
  }

  // Household heads per Kaart Id (first named person on the card).
  const headByKaart = new Map<string, string>();
  for (const row of wardRows) {
    const kaart = clean(row['Kaart Id']);
    if (!kaart || headByKaart.has(kaart)) continue;
    const head = [
      clean(row.Voornaam),
      clean(row.Tussenvoegsel),
      clean(row.Achternaam),
    ]
      .filter(Boolean)
      .join(' ');
    if (head) headByKaart.set(kaart, head);
  }

  const outputLinks: WardAddressLink[] = [];
  const counts: Record<MatchStrategy, number> = {
    'ow-exact': 0,
    'ow-without-buurt': 0,
    'ow-without-suffix': 0,
    'nw-exact': 0,
    'nw-without-suffix': 0,
    unresolved: 0,
  };
  const byYear: Record<string, { linked: number; total: number }> = {};
  let freeAttestations = 0;
  let namedEnslavedAttestations = 0;
  let individualizedEnslavedAttestations = 0;
  let skippedWithoutKey = 0;

  for (const row of wardRows) {
    const id = clean(row.Id);
    const year = Number(clean(row.Jaar));
    const wardLetter = clean(row.Wijkletter);
    const houseNumber = clean(row.Huisnummer);
    if (!id || !Number.isFinite(year) || !wardLetter || !houseNumber) {
      skippedWithoutKey++;
      continue;
    }
    const regime = year < 1837 ? 'ow' : 'nw';
    const { core, suffix } = parseCoreAndSuffix(
      `${wardLetter}${houseNumber}`,
    );
    const letter = normalizeComponent(wardLetter);
    const buurt = normalizeComponent(row.Brt);
    const addition = clean(row.Adres_Aanvulling);
    const streetStd =
      streetStdIndex.get(normalizeStreet(row.Straatnaam)) ??
      streetStdIndex.get(normalizeStreet(row.Address_Full?.split(/\d/)?.[0] ?? ''));

    let matched: ConcordansRow[] = [];
    let strategy: MatchStrategy = 'unresolved';
    if (regime === 'ow') {
      matched =
        owExact.get(`${buurt}|${letter}|${core}|${suffix}`) ?? [];
      if (matched.length > 0) {
        strategy = 'ow-exact';
      } else {
        matched =
          owWithoutBuurt.get(`${letter}|${core}|${suffix}`) ?? [];
        if (matched.length > 0) {
          strategy = 'ow-without-buurt';
        } else {
          matched =
            owWithoutSuffix.get(`${buurt}|${letter}|${core}`) ?? [];
          if (matched.length > 0) strategy = 'ow-without-suffix';
        }
      }
    } else {
      matched = nwExact.get(`${letter}|${core}|${suffix}`) ?? [];
      if (matched.length > 0) {
        strategy = 'nw-exact';
      } else {
        matched = nwWithoutSuffix.get(`${letter}|${core}`) ?? [];
        if (matched.length > 0) strategy = 'nw-without-suffix';
      }
    }

    counts[strategy]++;
    const yearKey = String(year);
    byYear[yearKey] ??= { linked: 0, total: 0 };
    byYear[yearKey].total++;

    // Resolve concordans rows -> place ids via the committed concordance,
    // keeping the weaker of the WR-side strategy and the stored
    // per-relationship certainty.
    const placeCertainty = new Map<string, Certainty>();
    const concordansIds: string[] = [];
    for (const match of matched) {
      const sourceRow = clean(match.sourceRow);
      const link = linkBySourceRow.get(sourceRow);
      if (!link) continue;
      concordansIds.push(link.id);
      const base: Certainty =
        strategy === 'ow-exact' || strategy === 'nw-exact'
          ? 'certain'
          : 'probable';
      for (const placeId of link.placeIds) {
        const stored = link.certaintyByPlace[placeId] ?? 'probable';
        const combined = lowerCertainty(base, stored);
        const existing = placeCertainty.get(placeId);
        placeCertainty.set(
          placeId,
          existing == null ? combined : lowerCertainty(existing, combined),
        );
      }
    }
    // Street cross-check: demote one level on mismatch, never promote.
    if (placeCertainty.size > 0 && streetStd) {
      const streetHit = matched.some((match) => {
        const eraStreets = regime === 'ow'
          ? [match.street1830, match.ow1817DistrictCode]
          : [match.street1837, match.nw1837DistrictCode];
        return eraStreets.some(
          (candidate) =>
            candidate && normalizeStreet(candidate) === normalizeStreet(streetStd),
        );
      });
      if (!streetHit) {
        for (const [placeId, certainty] of placeCertainty) {
          if (certainty === 'certain') placeCertainty.set(placeId, 'probable');
        }
      }
    }

    const placeIds = [...placeCertainty.keys()].sort();
    const certainty: Certainty =
      placeIds.length === 0
        ? 'unresolved'
        : placeIds.every((placeId) => placeCertainty.get(placeId) === 'certain')
          ? 'certain'
          : 'probable';
    if (placeIds.length > 0) byYear[yearKey].linked++;

    const kaartHead = headByKaart.get(clean(row['Kaart Id'])) ?? null;
    const observedPersons: ObservedPerson[] = [];
    const free = namedFreePerson(row, kaartHead);
    if (free) {
      observedPersons.push(free);
      freeAttestations++;
    }
    const namedEnslaved = namedEnslavedPerson(row, kaartHead);
    if (namedEnslaved) {
      observedPersons.push(namedEnslaved);
      namedEnslavedAttestations++;
    }
    const individualized = individualizedEnslavedPersons(row, kaartHead);
    observedPersons.push(...individualized);
    individualizedEnslavedAttestations += individualized.length;

    outputLinks.push({
      id: `ward-register-${id}`,
      sourceRecordId: id,
      year,
      regime,
      sourceAddress: {
        addressFull: valueOrNull(row.Address_Full),
        streetName: valueOrNull(row.Straatnaam),
        ward: valueOrNull(row.Wijk),
        wardLetter,
        houseNumber,
        addition: addition || null,
        room: valueOrNull(row.Kamer),
        neighbourhoodCode: clean(row.Brt) || null,
        locationNote: valueOrNull(row.Locatie),
        addressRemarks: valueOrNull(row.Adress_Remarks),
      },
      observedPersons,
      enslavedRemarks: valueOrNull(row.Enslaved_Remarks),
      sourceScan: valueOrNull(row.Scan),
      householdHead: kaartHead,
      concordansIds: [...new Set(concordansIds)].sort(),
      placeIds,
      matchStrategy: strategy,
      certainty,
    });
  }

  const linked = outputLinks.filter((link) => link.placeIds.length > 0).length;
  console.log(`Ward Register rows processed: ${outputLinks.length} (skipped without key: ${skippedWithoutKey})`);
  console.log(`Linked to 1885 location point(s): ${linked}/${outputLinks.length}`);
  for (const [strategy, count] of Object.entries(counts)) {
    console.log(`  ${strategy.padEnd(20)} ${count}`);
  }
  console.log('By year (linked/total):');
  for (const year of Object.keys(byYear).sort()) {
    console.log(`  ${year}: ${byYear[year].linked}/${byYear[year].total}`);
  }
  console.log('Individual person attestations:');
  console.log(`  free residents: ${freeAttestations}`);
  console.log(`  named enslaved residents: ${namedEnslavedAttestations}`);
  console.log(`  individualized enslaved persons (matrix): ${individualizedEnslavedAttestations}`);
  console.log(
    `  total observed persons: ${freeAttestations + namedEnslavedAttestations + individualizedEnslavedAttestations}`,
  );

  const document = {
    '@id': `${STM}database/paramaribo-ward-register-address-links`,
    '@type': 'sdo:Dataset',
    'sdo:name': 'Paramaribo Ward Register address links (derived)',
    'sdo:description':
      'Derived links from Paramaribo Ward Register address observations (1828-1847) to 1885 address-point places, via the Concordans Paramaribo, with individualized person attestations for free and enslaved residents. ' +
      MUNTJEWERFF_ATTRIBUTION,
    'sdo:dateModified': new Date().toISOString(),
    attribution: MUNTJEWERFF_ATTRIBUTION,
    sources: [WARD_REGISTERS_SOURCE_ID, CONCORDANS_SOURCE_ID],
    links: outputLinks,
  };
  writeFileSync(OUT_PATH, `${JSON.stringify(document)}\n`, 'utf-8');
  console.log(`\nWrote ${OUT_PATH} (${outputLinks.length} source-address links)`);
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
