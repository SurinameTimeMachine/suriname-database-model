/**
 * v1 observational transform for civil registration records (births & deaths).
 *
 * Reads:
 *   data/02-death-certificates .../Suriname_death_certificates_1845_1915.csv
 *     (75,542 rows)
 *   data/03-birth-certificates .../Paramaribo_birth_certificates_V1.0.csv
 *     (63,240 rows)
 *
 * Ontology: docs/modeling/enslaved-pico-guidelines.md (Enslaved-PiCo).
 * Strategy per civil-records-ingestion-plan.md: STRICTLY OBSERVATIONAL —
 * one picom:PersonObservation per person-role cell, direct kinship edges
 * with provenance blocks, deterministic overlijden:/erkenning: note edges,
 * OW/NW/Brt address resolution with plantation/district precision flags,
 * address derivation for persons without own address, and an unmapped
 * location todo-list export.
 *
 * No E21_Person merges, no cross-certificate identity resolution in v1.
 *
 * Run standalone: tsx scripts/transform-civil-records.ts
 * Or via package script: pnpm transform:civil-records
 */
import { parse } from 'csv-parse/sync';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';

const BASE_DIR = join(__dirname, '../..');
const DEATH_CSV = join(
  BASE_DIR,
  'data/02-death-certificates - Suriname Death Certificates 1845-1915 Version 1.0/Suriname_death_certificates_1845_1915.csv',
);
const BIRTH_CSV = join(
  BASE_DIR,
  'data/03-birth-certificates - Paramaribo Birth Certificates 1828-1921 Version 1.0/Paramaribo_birth_certificates_V1.0.csv',
);
const OUT_DIR = join(BASE_DIR, 'data');
const OBSERVATIONS_OUT = join(OUT_DIR, 'civil-records-observations.json');
const UNMAPPED_OUT = join(OUT_DIR, 'unmapped-civil-locations.json');

const STM = 'https://data.surinametijdmachine.org/';

// --- Types ---

export type ProvenanceConfidence = 'certain' | 'probable' | 'unresolved';

export interface EdgeProvenance {
  method:
    | 'record-co-occurrence'
    | 'deterministic-note-parse'
    | 'address-ladder-ow'
    | 'address-ladder-nw'
    | 'address-ladder-brt'
    | 'plantation-normalize'
    | 'derived-inheritance'
    | 'signature-flag';
  rawText: string;
  confidence: ProvenanceConfidence;
}

export interface KinshipEdge {
  from: string;
  relation:
    | 'sdo:parent'
    | 'sdo:children'
    | 'sdo:spouse'
    | 'sdo:sameAs'
    | 'iisg:isLegallyRepresentedBy'
    | 'civil:deathReference'
    | 'civil:fatherRecognition';
  to: string;
  provenance: EdgeProvenance;
}

export type LocationPrecision =
  | 'street-address'
  | 'street'
  | 'plantation'
  | 'district'
  | 'unresolved';

export interface ResolvedLocation {
  raw: string;
  precision: LocationPrecision;
  strategy: string;
  placeId: string | null;
  derivedFrom: string | null;
  provenance: EdgeProvenance;
}

export type CivilRole =
  | 'deceased'
  | 'child'
  | 'mother'
  | 'father'
  | 'informant'
  | 'witness'
  | 'parent'
  | 'spouse';

export interface CivilObservation {
  uri: string;
  recordId: string;
  source: 'death-certificates' | 'birth-certificates';
  role: CivilRole;
  givenName: string;
  prefix: string;
  familyName: string;
  fullName: string;
  sex: string;
  ageRaw: string;
  occupation: string;
  eventDate: string;
  certDate: string;
  literate: boolean | null;
  literacyRaw: string;
  location: ResolvedLocation | null;
  eventType: string;
}

export interface UnmappedLocation {
  raw: string;
  count: number;
  fieldOrigin: string;
  exampleRecordIds: string[];
}

export interface CivilTransformResult {
  observations: CivilObservation[];
  edges: KinshipEdge[];
  unmappedLocations: UnmappedLocation[];
  stats: {
    deathRows: number;
    birthRows: number;
    observations: number;
    edges: number;
    deterministicDeathLinks: number;
    fatherRecognitions: number;
    unmappedUnique: number;
  };
}

// --- Helpers ---

function clean(value: string | undefined): string {
  return (value ?? '').trim();
}

function joinName(fname: string, prefix: string, sname: string): string {
  return [fname, prefix, sname].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function parseSignature(sig: string, sigOther: string): boolean | null {
  const normalized = `${sig} ${sigOther}`.toLowerCase();
  if (!normalized.trim() || normalized.trim() === '#') return null;
  if (normalized.includes('illiteracy') || normalized.includes('analfabeet')) return false;
  if (normalized.includes('signed') || normalized.includes('getekend')) return true;
  return null;
}

function parseAgeCategory(ageRaw: string): string | null {
  const text = ageRaw.toLowerCase();
  if (!text || text === '#') return null;
  if (/(week|weken|maand|maanden|day|dagen|hour|uren)/.test(text)) {
    const years = Number(text.match(/(\d+)\s*(jaar|jaren|year)/)?.[1] ?? NaN);
    if (Number.isFinite(years)) return years < 2 ? 'Infant' : 'Child';
    return 'Infant';
  }
  const years = Number(text.match(/(\d+)/)?.[1] ?? NaN);
  if (!Number.isFinite(years)) return null;
  if (years < 2) return 'Infant';
  if (years < 14) return 'Child';
  if (years < 60) return 'Adult';
  return 'OlderPerson';
}

function normalizePlantationName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^plantage\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// OW/NW/Brt street ladder (mirrors link-ward-registers-to-addresses.ts
// normalizers; concordans cross-check happens downstream, not here).
const STREET_ADDRESS_RE =
  /^(.+?)\s+([a-z])\s+(\d+)\s*([a-z]*)\s*(\(.*\))?\s*$/i;
const BRT_CODE_RE = /^[a-z]\s*\d+\s*$/i;
const DISTRICT_RE = /\b(nickerie|coronie|saramacca|commewijne|marowijne|para|boven[-\s]suriname|beneden[-\s]suriname|dit district|post\s+[a-z]+)\b/i;

// Bare street names observed in the civil registers (street + optional
// parenthetical qualifier, no wijk-letter/number). Kept as an explicit
// allowlist so generic words never match this leg.
const KNOWN_STREETS = new Set(
  [
    'gravenstraat',
    'steenbakkerijstraat',
    'wagewegstraat',
    'wagenwegstraat',
    'weidestraat',
    'zwartenhovenbrugstraat',
    'zwartehovenbrugstraat',
    'saramaccastraat',
    'keizerstraat',
    'prinsenstraat',
    'princestraat',
    'maagdenstraat',
    'heerenstraat',
    'joodebreestraat',
    'jodenbreestraat',
    'waterkant',
    'knuffelsgracht',
    'drambrandersgracht',
    'zwartenhovenbrug',
    'tweede buitenwijk',
    'eerste buitenwijk',
    'combé',
    'frimangron',
    'oranjestraat',
    'hoogestraat',
    'prinsessestraat',
    'steenbakkersgracht',
    'burenstraat',
    'rust en vredestraat',
    'stoelmanstraat',
    'klipstenenstraat',
    'dominestraat',
    'wicherstraat',
    'zwartenhovenbrugstraat',
    'roseveltkade',
    'sommelsdijcksekreek',
    'grote combéweg',
    'kleine combéweg',
    'grote hoffstraat',
  ].map((street) => street),
);

function cleanStreetName(raw: string): string | null {
  // Strip parenthetical qualifiers ("Gravenstraat (militair hospitaal)").
  const base = raw.replace(/\s*\(.*\)\s*$/, '').trim();
  // Bare street: letters/spaces only — no digits, no wijk-letter prefix.
  if (!/^[a-zà-ÿ\s'’-]+$/i.test(base)) return null;
  const normalized = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return KNOWN_STREETS.has(normalized) ? base : null;
}

function resolveLocation(
  raw: string,
  fieldOrigin: string,
  unmapped: Map<string, UnmappedLocation>,
  recordId: string,
): ResolvedLocation | null {
  const text = clean(raw);
  if (!text || text === '#') return null;

  // Brt leg: pre-1836 buurt codes like "D 806".
  if (BRT_CODE_RE.test(text)) {
    return {
      raw: text,
      precision: 'street-address',
      strategy: 'address-ladder-brt',
      placeId: null,
      derivedFrom: null,
      provenance: {
        method: 'address-ladder-brt',
        rawText: text,
        confidence: 'probable',
      },
    };
  }

  // OW/NW leg: "Street W NNN" (suffix letters + parentheticals tolerated).
  const streetMatch = text.match(STREET_ADDRESS_RE);
  if (streetMatch) {
    const hasSuffix = Boolean(streetMatch[4]) || Boolean(streetMatch[5]);
    const method = hasSuffix ? 'address-ladder-nw' : 'address-ladder-ow';
    return {
      raw: text,
      precision: 'street-address',
      strategy: hasSuffix ? 'nw-without-suffix' : 'ow-exact',
      placeId: null,
      derivedFrom: null,
      provenance: {
        method,
        rawText: text,
        confidence: hasSuffix ? 'probable' : 'certain',
      },
    };
  }

  // Plantation leg: "plantage X" normalizes for PSUR matching downstream.
  if (/^plantage\s+/i.test(text)) {
    return {
      raw: text,
      precision: 'plantation',
      strategy: 'plantation-normalize',
      placeId: null,
      derivedFrom: null,
      provenance: {
        method: 'plantation-normalize',
        rawText: text,
        confidence: 'probable',
      },
    };
  }

  // Street-only leg: bare street names ("Gravenstraat", "Weidestraat",
  // "Zwartenhovenbrugstraat") carry no wijk-letter/number for the OW/NW
  // ladder, but they are street-level evidence — keep them as
  // precision "street" (probable) instead of dumping them as unmapped.
  const streetOnly = cleanStreetName(text);
  if (streetOnly) {
    return {
      raw: text,
      precision: 'street',
      strategy: 'street-name-only',
      placeId: null,
      derivedFrom: null,
      provenance: {
        method: 'address-ladder-ow',
        rawText: text,
        confidence: 'probable',
      },
    };
  }

  // Town/district leg: "Paramaribo", "Suriname", "alhier" and district
  // keywords resolve at district precision — they locate the event in
  // the town, not at a street address. Relative phrases ("in voormeld
  // huis", "in deze kolonie", "alhier in garnizoen") stay unmapped:
  // derivation already covers the person via the primary subject.
  const relativePhrase =
    /voormeld|voornoemd|bovengemeld|deze kolonie|dit district|garnizoen/i.test(
      text,
    );
  if (!relativePhrase && (/^(paramaribo|suriname|alhier|hier)$/i.test(text) || DISTRICT_RE.test(text))) {
    return {
      raw: text,
      precision: 'district',
      strategy: 'district-keyword',
      placeId: null,
      derivedFrom: null,
      provenance: {
        method: 'plantation-normalize',
        rawText: text,
        confidence: 'probable',
      },
    };
  }

  // Unresolvable: todo-list entry.
  const key = `${fieldOrigin}||${text}`;
  let entry = unmapped.get(key);
  if (!entry) {
    entry = { raw: text, count: 0, fieldOrigin, exampleRecordIds: [] };
    unmapped.set(key, entry);
  }
  entry.count += 1;
  if (entry.exampleRecordIds.length < 5) entry.exampleRecordIds.push(recordId);
  return {
    raw: text,
    precision: 'unresolved',
    strategy: 'unmapped',
    placeId: null,
    derivedFrom: null,
    provenance: {
      method: 'plantation-normalize',
      rawText: text,
      confidence: 'unresolved',
    },
  };
}

// Deterministic note parsing: "overlijden: Overleden te Paramaribo op
// 06-10-1907" / "Overl 21-11-1892 folio 953" / "O. Paramb 13-09-1902".
const DEATH_NOTE_RE =
  /(?:overlijden|overl\.?|o\.)\s*:?\s*(.*?)(?:\||$)/gi;
const DEATH_DATE_RE = /(\d{1,2})-(\d{1,2})-(?:\d{2})?(\d{2,4})/;
const FOLIO_RE = /folio\s+(\d+)/i;

export interface DeathNoteLink {
  date: string | null;
  folio: string | null;
  rawFragment: string;
}

export function parseDeathNotes(notesAll: string): DeathNoteLink[] {
  const links: DeathNoteLink[] = [];
  const text = clean(notesAll);
  if (!text || !/overlijden|overl\.?/i.test(text)) return links;
  for (const segment of text.split('|')) {
    if (!/overlijden|overl\.?|^o\.\s/i.test(segment)) continue;
    // Skip administrative misfilings ("per abuis ... overgebracht").
    if (/abuis/i.test(segment)) continue;
    const dateMatch = segment.match(DEATH_DATE_RE);
    const folioMatch = segment.match(FOLIO_RE);
    // Two-digit years in this corpus are 1800s (1828-1921 range), not 1900s.
    const rawYear = dateMatch ? dateMatch[3] : null;
    const fullYear =
      rawYear == null
        ? null
        : rawYear.length === 2
          ? `18${rawYear}`
          : rawYear;
    links.push({
      date:
        dateMatch && fullYear
          ? `${dateMatch[1].padStart(2, '0')}-${dateMatch[2].padStart(2, '0')}-${fullYear}`
          : null,
      folio: folioMatch ? folioMatch[1] : null,
      rawFragment: segment.trim(),
    });
  }
  return links;
}

const RECOGNITION_RE = /erkenning|wettiging|erkennen|gewittigd/i;

export function hasFatherRecognition(notesAll: string): boolean {
  return RECOGNITION_RE.test(clean(notesAll));
}

// --- Row transforms ---

type CsvRow = Record<string, string>;

function observe(
  recordId: string,
  source: CivilObservation['source'],
  role: CivilRole,
  parts: { fname: string; prefix: string; sname: string },
  extra: Partial<CivilObservation> & { eventDate: string; certDate: string },
  location: ResolvedLocation | null,
): CivilObservation {
  const fullName = joinName(parts.fname, parts.prefix, parts.sname);
  return {
    uri: `${STM}civil-observation/${recordId}-${role}`,
    recordId,
    source,
    role,
    givenName: parts.fname,
    prefix: parts.prefix,
    familyName: parts.sname,
    fullName,
    sex: extra.sex ?? '',
    ageRaw: extra.ageRaw ?? '',
    occupation: extra.occupation ?? '',
    eventDate: extra.eventDate,
    certDate: extra.certDate,
    literate: extra.literate ?? null,
    literacyRaw: extra.literacyRaw ?? '',
    location,
    eventType: extra.eventType ?? '',
  };
}

function deriveLocation(
  from: ResolvedLocation | null,
  toObsUri: string,
  relation: string,
): ResolvedLocation | null {
  if (!from || from.precision === 'unresolved') return null;
  return {
    ...from,
    derivedFrom: toObsUri,
    provenance: {
      method: 'derived-inheritance',
      rawText: `${relation}: ${from.raw}`,
      confidence: 'probable',
    },
  };
}

function edge(
  from: string,
  relation: KinshipEdge['relation'],
  to: string,
  provenance: EdgeProvenance,
): KinshipEdge {
  return { from, relation, to, provenance };
}

function transformDeathRow(
  row: CsvRow,
  unmapped: Map<string, UnmappedLocation>,
): { observations: CivilObservation[]; edges: KinshipEdge[] } {
  const recordId = clean(row.id);
  const certDate = clean(row.cert_date);
  const eventDate = clean(row.death_date);
  const observations: CivilObservation[] = [];
  const edges: KinshipEdge[] = [];
  const uri = (role: string) => `${STM}civil-observation/${recordId}-${role}`;

  // Primary subject first: its location anchors derivation for the rest.
  const decLocation = resolveLocation(
    clean(row.dec_place) || clean(row.death_place),
    'death:dec_place/death_place',
    unmapped,
    recordId,
  );
  observations.push(
    observe(
      recordId,
      'death-certificates',
      'deceased',
      {
        fname: clean(row.dec_fname),
        prefix: clean(row.dec_prefix),
        sname: clean(row.dec_sname),
      },
      {
        eventDate,
        certDate,
        sex: clean(row.dec_sex),
        ageRaw: clean(row.dec_age),
        occupation: clean(row.dec_occ),
        literate: null,
        literacyRaw: '',
        eventType: 'Death',
      },
      decLocation,
    ),
  );

  // Parents 1-2.
  for (const n of ['1', '2']) {
    const fname = clean(row[`parent_fname_${n}`]);
    const sname = clean(row[`parent_sname_${n}`]);
    if (!fname && !sname) continue;
    const role = `parent${n}`;
    const location = resolveLocation(
      clean(row[`parent_place_${n}`]),
      `death:parent_place_${n}`,
      unmapped,
      recordId,
    );
    observations.push(
      observe(
        recordId,
        'death-certificates',
        'parent',
        {
          fname,
          prefix: clean(row[`parent_prefix_${n}`]),
          sname,
        },
        {
          eventDate,
          certDate,
          sex: clean(row[`parent_sex_${n}`]),
          occupation: clean(row[`parent_occ_${n}`]),
          eventType: 'Death',
        },
        location ??
          deriveLocation(decLocation, uri(role), 'derived_from_deceased'),
      ),
    );
    edges.push(
      edge(uri(role), 'sdo:children', uri('deceased'), {
        method: 'record-co-occurrence',
        rawText: `parent_${n}: ${joinName(fname, clean(row[`parent_prefix_${n}`]), sname)}`,
        confidence: 'certain',
      }),
      edge(uri('deceased'), 'sdo:parent', uri(role), {
        method: 'record-co-occurrence',
        rawText: `parent_${n}: ${joinName(fname, clean(row[`parent_prefix_${n}`]), sname)}`,
        confidence: 'certain',
      }),
    );
  }

  // Spouses 1-4.
  for (const n of ['1', '2', '3', '4']) {
    const fname = clean(row[`spouse_fname_${n}`]);
    const sname = clean(row[`spouse_sname_${n}`]);
    if ((!fname && !sname) || fname === '#' || sname === '#') continue;
    const role = `spouse${n}`;
    observations.push(
      observe(
        recordId,
        'death-certificates',
        'spouse',
        {
          fname,
          prefix: clean(row[`spouse_prefix_${n}`]),
          sname,
        },
        { eventDate, certDate, eventType: 'Death' },
        deriveLocation(decLocation, uri(role), 'derived_from_deceased'),
      ),
    );
    edges.push(
      edge(uri('deceased'), 'sdo:spouse', uri(role), {
        method: 'record-co-occurrence',
        rawText: `spouse_${n}: ${joinName(fname, clean(row[`spouse_prefix_${n}`]), sname)}`,
        confidence: 'certain',
      }),
    );
  }

  // Informant (with literacy flag).
  {
    const fname = clean(row.inf_fname);
    const sname = clean(row.inf_sname);
    if (fname || sname) {
      const location = resolveLocation(
        clean(row.inf_place),
        'death:inf_place',
        unmapped,
        recordId,
      );
      observations.push(
        observe(
          recordId,
          'death-certificates',
          'informant',
          {
            fname,
            prefix: clean(row.inf_prefix),
            sname,
          },
          {
            eventDate,
            certDate,
            ageRaw: clean(row.inf_age),
            occupation: clean(row.inf_occ),
            literate: parseSignature(clean(row.inf_sig), ''),
            literacyRaw: clean(row.inf_sig),
            eventType: 'Death',
          },
          location ??
            deriveLocation(decLocation, uri('informant'), 'derived_from_deceased'),
        ),
      );
      // Legal-representation edge only when the relation states it.
      const relation = clean(row.inf_relation).toLowerCase();
      if (/vader|moeder|voogd|echtgenoot|echtgenoote/.test(relation)) {
        edges.push(
          edge(uri('deceased'), 'iisg:isLegallyRepresentedBy', uri('informant'), {
            method: 'record-co-occurrence',
            rawText: `inf_relation: ${clean(row.inf_relation)}`,
            confidence: 'probable',
          }),
        );
      }
    }
  }

  // Witnesses 1-2 (with literacy flags).
  for (const n of ['1', '2']) {
    const fname = clean(row[`witn_fname_${n}`]);
    const sname = clean(row[`witn_sname_${n}`]);
    if (!fname && !sname) continue;
    const role = `witness${n}`;
    const location = resolveLocation(
      clean(row[`witn_place_${n}`]),
      `death:witn_place_${n}`,
      unmapped,
      recordId,
    );
    observations.push(
      observe(
        recordId,
        'death-certificates',
        'witness',
        {
          fname,
          prefix: clean(row[`witn_prefix_${n}`]),
          sname,
        },
        {
          eventDate,
          certDate,
          ageRaw: clean(row[`witn_age_${n}`]),
          occupation: clean(row[`witn_occ_${n}`]),
          literate: parseSignature(clean(row[`witn_sig_${n}`]), ''),
          literacyRaw: clean(row[`witn_sig_${n}`]),
          eventType: 'Death',
        },
        location ??
          deriveLocation(decLocation, uri(role), 'derived_from_deceased'),
      ),
    );
  }

  return { observations, edges };
}

function transformBirthRow(
  row: CsvRow,
  unmapped: Map<string, UnmappedLocation>,
): { observations: CivilObservation[]; edges: KinshipEdge[] } {
  const recordId = clean(row.id);
  const certDate = clean(row.cert_date);
  const eventDate = clean(row.birth_date);
  const observations: CivilObservation[] = [];
  const edges: KinshipEdge[] = [];
  const uri = (role: string) => `${STM}civil-observation/${recordId}-${role}`;

  // Mother first: her address anchors derivation for the child.
  const mothLocation = resolveLocation(
    clean(row.moth_place) || clean(row.birth_place),
    'birth:moth_place/birth_place',
    unmapped,
    recordId,
  );
  const mothFname = clean(row.moth_fname);
  const mothSname = clean(row.moth_sname);
  const hasMother = Boolean(mothFname || mothSname);
  if (hasMother) {
    observations.push(
      observe(
        recordId,
        'birth-certificates',
        'mother',
        {
          fname: mothFname,
          prefix: clean(row.moth_prefix),
          sname: mothSname,
        },
        {
          eventDate,
          certDate,
          occupation: clean(row.moth_occ),
          eventType: 'Birth',
        },
        mothLocation,
      ),
    );
  }

  // Child.
  {
    const childLocation = resolveLocation(
      clean(row.birth_place),
      'birth:birth_place',
      unmapped,
      recordId,
    );
    observations.push(
      observe(
        recordId,
        'birth-certificates',
        'child',
        {
          fname: clean(row.child_fname),
          prefix: clean(row.child_prefix),
          sname: clean(row.child_sname),
        },
        { eventDate, certDate, sex: clean(row.child_sex), eventType: 'Birth' },
        childLocation ??
          (hasMother
            ? deriveLocation(mothLocation, uri('child'), 'derived_from_mother')
            : null),
      ),
    );
    if (hasMother) {
      edges.push(
        edge(uri('child'), 'sdo:parent', uri('mother'), {
          method: 'record-co-occurrence',
          rawText: `mother: ${joinName(mothFname, clean(row.moth_prefix), mothSname)}`,
          confidence: 'certain',
        }),
        edge(uri('mother'), 'sdo:children', uri('child'), {
          method: 'record-co-occurrence',
          rawText: `mother: ${joinName(mothFname, clean(row.moth_prefix), mothSname)}`,
          confidence: 'certain',
        }),
      );
    }
  }

  // Father (name only in source).
  {
    const fname = clean(row.fath_fname);
    const sname = clean(row.fath_sname);
    if (fname || sname) {
      observations.push(
        observe(
          recordId,
          'birth-certificates',
          'father',
          {
            fname,
            prefix: clean(row.fath_prefix),
            sname,
          },
          { eventDate, certDate, eventType: 'Birth' },
          hasMother
            ? deriveLocation(mothLocation, uri('father'), 'derived_from_mother')
            : null,
        ),
      );
      edges.push(
        edge(uri('child'), 'sdo:parent', uri('father'), {
          method: 'record-co-occurrence',
          rawText: `father: ${joinName(fname, clean(row.fath_prefix), sname)}`,
          confidence: 'certain',
        }),
      );
    }
  }

  // Informant (with literacy flag + presence-at-birth).
  {
    const fname = clean(row.inf_fname);
    const sname = clean(row.inf_sname);
    if (fname || sname) {
      const location = resolveLocation(
        clean(row.inf_place),
        'birth:inf_place',
        unmapped,
        recordId,
      );
      observations.push(
        observe(
          recordId,
          'birth-certificates',
          'informant',
          {
            fname,
            prefix: clean(row.inf_prefix),
            sname,
          },
          {
            eventDate,
            certDate,
            ageRaw: clean(row.inf_age),
            occupation: clean(row.inf_occ),
            literate: parseSignature(clean(row.inf_sig), clean(row.inf_sig_other)),
            literacyRaw: [clean(row.inf_sig), clean(row.inf_sig_other)]
              .filter(Boolean)
              .join(' · '),
            eventType: 'Birth',
          },
          location ??
            (hasMother
              ? deriveLocation(mothLocation, uri('informant'), 'derived_from_mother')
              : null),
        ),
      );
    }
  }

  // Witnesses 1-2.
  for (const n of ['1', '2']) {
    const fname = clean(row[`witn_fname_${n}`]);
    const sname = clean(row[`witn_sname_${n}`]);
    if (!fname && !sname) continue;
    const role = `witness${n}`;
    const location = resolveLocation(
      clean(row[`witn_place_${n}`]),
      `birth:witn_place_${n}`,
      unmapped,
      recordId,
    );
    observations.push(
      observe(
        recordId,
        'birth-certificates',
        'witness',
        {
          fname,
          prefix: clean(row[`witn_prefix_${n}`]),
          sname,
        },
        {
          eventDate,
          certDate,
          ageRaw: clean(row[`witn_age_${n}`]),
          occupation: clean(row[`witn_occ_${n}`]),
          literate: parseSignature(
            clean(row[`witn_sig_${n}`]),
            clean(row[`witn_sig_other_${n}`]),
          ),
          literacyRaw: [
            clean(row[`witn_sig_${n}`]),
            clean(row[`witn_sig_other_${n}`]),
          ]
            .filter(Boolean)
            .join(' · '),
          eventType: 'Birth',
        },
        location ??
          (hasMother
            ? deriveLocation(mothLocation, uri(role), 'derived_from_mother')
            : null),
      ),
    );
  }

  // Deterministic note edges: overlijden: (birth -> death) + erkenning:.
  const notesAll = clean(row.notes_all);
  for (const link of parseDeathNotes(notesAll)) {
    edges.push(
      edge(uri('child'), 'civil:deathReference', `civil:death/${link.date ?? 'unknown'}`, {
        method: 'deterministic-note-parse',
        rawText: link.rawFragment,
        confidence: link.date ? 'probable' : 'unresolved',
      }),
    );
  }
  if (hasFatherRecognition(notesAll)) {
    edges.push(
      edge(uri('father'), 'civil:fatherRecognition', uri('child'), {
        method: 'deterministic-note-parse',
        rawText: notesAll.split('|').find((s) => RECOGNITION_RE.test(s))?.trim() ?? notesAll.slice(0, 200),
        confidence: 'certain',
      }),
    );
  }

  return { observations, edges };
}

// --- Main ---

export function transformCivilRecords(): CivilTransformResult {
  const deathCsv = readFileSync(DEATH_CSV, 'utf-8');
  const birthCsv = readFileSync(BIRTH_CSV, 'utf-8');
  const deathRows: CsvRow[] = parse(deathCsv, {
    columns: true,
    delimiter: ',',
    skip_empty_lines: true,
    relax_column_count: true,
  });
  const birthRows: CsvRow[] = parse(birthCsv, {
    columns: true,
    delimiter: ',',
    skip_empty_lines: true,
    relax_column_count: true,
  });
  console.log(
    `Loaded ${deathRows.length} death rows, ${birthRows.length} birth rows`,
  );

  const observations: CivilObservation[] = [];
  const edges: KinshipEdge[] = [];
  const unmapped = new Map<string, UnmappedLocation>();

  for (const row of deathRows) {
    const result = transformDeathRow(row, unmapped);
    observations.push(...result.observations);
    edges.push(...result.edges);
  }
  for (const row of birthRows) {
    const result = transformBirthRow(row, unmapped);
    observations.push(...result.observations);
    edges.push(...result.edges);
  }

  const unmappedLocations = [...unmapped.values()].sort(
    (a, b) => b.count - a.count,
  );
  const deterministicDeathLinks = edges.filter(
    (e) => e.relation === 'civil:deathReference',
  ).length;
  const fatherRecognitions = edges.filter(
    (e) => e.relation === 'civil:fatherRecognition',
  ).length;

  console.log(`  Civil observations:       ${observations.length}`);
  console.log(`  Kinship/note edges:       ${edges.length}`);
  console.log(`  Deterministic death links: ${deterministicDeathLinks}`);
  console.log(`  Father recognitions:       ${fatherRecognitions}`);
  console.log(`  Unique unmapped locations: ${unmappedLocations.length}`);

  mkdirSync(OUT_DIR, { recursive: true });
  // File sizes (~795k observations + ~491k edges) exceed both V8's max
  // string length and the default heap when held as one JSON document.
  // Write NDJSON sidecars incrementally, then stream-convert to JSON.
  // NDJSON is also the friendlier format for downstream consumers.
  const OBS_NDJSON = join(OUT_DIR, 'civil-records-observations.ndjson');
  const EDGE_NDJSON = join(OUT_DIR, 'civil-records-edges.ndjson');
  const writeNdjson = (path: string, items: unknown[]): void => {
    const stream = createWriteStream(path, { encoding: 'utf-8' });
    const CHUNK = 5000;
    for (let start = 0; start < items.length; start += CHUNK) {
      stream.write(
        items
          .slice(start, start + CHUNK)
          .map((item) => JSON.stringify(item))
          .join('\n') + '\n',
      );
    }
    stream.end();
  };
  writeNdjson(OBS_NDJSON, observations);
  writeNdjson(EDGE_NDJSON, edges);
  console.log(`  Wrote ${OBS_NDJSON}`);
  console.log(`  Wrote ${EDGE_NDJSON}`);

  // Compact summary JSON (counts + config, no per-record payload).
  writeFileSync(
    OBSERVATIONS_OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        provenance:
          'transform-civil-records.ts v1 (observational, Enslaved-PiCo)',
        formats: {
          observationsNdjson: 'civil-records-observations.ndjson',
          edgesNdjson: 'civil-records-edges.ndjson',
        },
        stats: {
          deathRows: deathRows.length,
          birthRows: birthRows.length,
          observations: observations.length,
          edges: edges.length,
          deterministicDeathLinks,
          fatherRecognitions,
          unmappedUnique: unmappedLocations.length,
        },
      },
      null,
      1,
    ),
  );
  writeFileSync(
    UNMAPPED_OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        count: unmappedLocations.length,
        locations: unmappedLocations,
      },
      null,
      1,
    ),
  );
  console.log(`  Wrote ${OBSERVATIONS_OUT}`);
  console.log(`  Wrote ${UNMAPPED_OUT}`);

  return {
    observations,
    edges,
    unmappedLocations,
    stats: {
      deathRows: deathRows.length,
      birthRows: birthRows.length,
      observations: observations.length,
      edges: edges.length,
      deterministicDeathLinks,
      fatherRecognitions,
      unmappedUnique: unmappedLocations.length,
    },
  };
}

// Run standalone
if (require.main === module) {
  console.log('=== Civil Records Transformation (v1, observational) ===\n');
  const result = transformCivilRecords();
  if (result.unmappedLocations.length > 0) {
    console.log('\nTop unmapped locations:');
    for (const { raw, count, fieldOrigin } of result.unmappedLocations.slice(0, 20)) {
      console.log(
        `  ${count.toString().padStart(6)}  [${fieldOrigin}] ${raw.slice(0, 90)}`,
      );
    }
  }
  console.log('\n=== Done ===');
}
