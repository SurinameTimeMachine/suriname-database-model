import type { AlmanakkenPlantationObservation } from './types';

export const PLACE_FUNCTION_SCHEME_URI =
  'https://data.surinametijdmachine.org/vocabulary/place-function';

export type PlaceFunctionEvidenceKind =
  | 'production'
  | 'recorded-function';

export interface PlaceFunctionAssertion {
  id: string;
  functionId: string;
  functionUri: string;
  label: string;
  sourceLabel: string;
  evidenceKinds: PlaceFunctionEvidenceKind[];
  source: string;
  sourceRows: string[];
  certainty: 'certain' | 'probable' | 'uncertain';
  startYear?: number;
  endYear?: number;
  note?: string | null;
}

export interface PlaceFunctionLabels {
  nl: string;
  en: string;
}

export interface RelatedPlaceType {
  id: string;
  uri: string;
}

export interface PlaceFunctionSource {
  productAssertions?: Array<{
    id?: string;
    value?: string;
    source?: string;
    startYear?: number;
    endYear?: number;
    note?: string | null;
    certainty?: string;
    sourceRows?: string[];
  }>;
  almanakkenObservations?: AlmanakkenPlantationObservation[];
}

const labels: Record<string, PlaceFunctionLabels> = {
  bos: { nl: 'Bosbouw', en: 'Forestry' },
  brandhout: { nl: 'Brandhoutproductie', en: 'Firewood production' },
  cacao: { nl: 'Cacaoteelt', en: 'Cacao cultivation' },
  centralisatie: { nl: 'Centralisatie', en: 'Centralized production' },
  'centraal-fabriek': { nl: 'Centrale fabriek', en: 'Central factory' },
  'chirurgisch-etablissement': {
    nl: 'Chirurgisch etablissement',
    en: 'Surgical establishment',
  },
  etablissement: { nl: 'Etablissement', en: 'Establishment' },
  heelmeester: { nl: 'Heelmeester', en: 'Medical practice' },
  hout: { nl: 'Houtproductie', en: 'Timber production' },
  'ijzersmelterij': { nl: 'IJzersmelterij', en: 'Iron smelting' },
  indigo: { nl: 'Indigoteelt', en: 'Indigo cultivation' },
  'ingenieurs-etablissement': {
    nl: 'Ingenieursetablissement',
    en: 'Engineering establishment',
  },
  katoen: { nl: 'Katoenteelt', en: 'Cotton cultivation' },
  kerk: { nl: 'Kerk', en: 'Church' },
  koffie: { nl: 'Koffieteelt', en: 'Coffee cultivation' },
  kollegietuin: { nl: 'Kollegietuin', en: 'College garden' },
  kost: { nl: 'Kostgrondteelt', en: 'Food-crop cultivation' },
  kweek: { nl: 'Kweek', en: 'Cultivation' },
  'militaire-post': { nl: 'Militaire post', en: 'Military post' },
  'portugees-israelitische-gemeente': {
    nl: 'Portugees-Israëlitische gemeente',
    en: 'Portuguese Jewish community',
  },
  post: { nl: 'Post', en: 'Post' },
  'post-van-de-indianen': {
    nl: 'Post van de Indianen',
    en: 'Colonial Indigenous post',
  },
  'quarantaine-etablissement': {
    nl: 'Quarantaine-etablissement',
    en: 'Quarantine establishment',
  },
  rijst: { nl: 'Rijstteelt', en: 'Rice cultivation' },
  settlement: { nl: 'Nederzettingsfunctie', en: 'Settlement function' },
  steen: { nl: 'Steenproductie', en: 'Stone production' },
  steenfabriek: { nl: 'Steenfabriek', en: 'Brickworks' },
  steenspringerij: { nl: 'Steenspringerij', en: 'Stone quarrying' },
  suiker: { nl: 'Suikerproductie', en: 'Sugar production' },
  synagoge: { nl: 'Synagoge', en: 'Synagogue' },
  werkplaats: { nl: 'Werkplaats', en: 'Workshop' },
};

const nonFunctionValues = new Set(['onbebouwd', 'onbekend']);

const relatedPlaceTypeIds: Record<string, string> = {
  'centraal-fabriek': 'central-factory',
  'chirurgisch-etablissement': 'medical-facility',
  'ijzersmelterij': 'ironworks',
  kerk: 'church',
  'militaire-post': 'military-post',
  'quarantaine-etablissement': 'quarantine-station',
  settlement: 'settlement',
  steenfabriek: 'brickworks',
  steenspringerij: 'quarry',
};

export function placeFunctionId(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function placeFunctionUri(functionId: string): string {
  return `${PLACE_FUNCTION_SCHEME_URI}/${functionId}`;
}

export function relatedPlaceType(
  functionId: string,
): RelatedPlaceType | undefined {
  const id = relatedPlaceTypeIds[functionId];
  return id
    ? {
        id,
        uri: `https://data.surinametijdmachine.org/vocabulary/place-type/${id}`,
      }
    : undefined;
}

export function placeFunctionLabels(
  functionId: string,
  sourceLabel?: string,
): PlaceFunctionLabels {
  if (Object.hasOwn(labels, functionId)) {
    return labels[functionId];
  }
  const fallback = sourceLabel?.trim() || functionId.replaceAll('-', ' ');
  return { nl: fallback, en: fallback };
}

function recognizedFunctionId(sourceLabel: string): string {
  const functionId = placeFunctionId(sourceLabel);
  if (!functionId || nonFunctionValues.has(functionId)) return '';
  if (!Object.hasOwn(labels, functionId)) {
    throw new Error(
      `Unreviewed place-function source term "${sourceLabel}" (${functionId}). Add an explicit vocabulary mapping before publication.`,
    );
  }
  return functionId;
}

function recognizedCertainty(
  value: string | undefined,
  fallback: PlaceFunctionAssertion['certainty'],
): PlaceFunctionAssertion['certainty'] {
  if (value == null) return fallback;
  if (value === 'certain' || value === 'probable' || value === 'uncertain') {
    return value;
  }
  throw new Error(`Unsupported place-function certainty "${value}".`);
}

export function splitProductionFunctions(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/\s*(?:,|\ben\b)\s*/i)
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ];
}

function contiguousSpans(years: number[]): Array<{
  startYear: number;
  endYear?: number;
  observedYears: number[];
}> {
  const sorted = [...new Set(years)].sort((a, b) => a - b);
  const spans: Array<{
    startYear: number;
    endYear?: number;
    observedYears: number[];
  }> = [];
  let start: number | undefined;
  let end: number | undefined;
  let observedYears: number[] = [];
  for (const year of sorted) {
    if (start == null) {
      start = year;
      end = year;
      observedYears = [year];
    } else if (end != null && year - end <= 2) {
      end = year;
      observedYears.push(year);
    } else {
      spans.push({
        startYear: start,
        ...(end !== start ? { endYear: end } : {}),
        observedYears,
      });
      start = year;
      end = year;
      observedYears = [year];
    }
  }
  if (start != null) {
    spans.push({
      startYear: start,
      ...(end != null && end !== start ? { endYear: end } : {}),
      observedYears,
    });
  }
  return spans;
}

function observedFunctionSpans(
  observations: AlmanakkenPlantationObservation[],
): PlaceFunctionAssertion[] {
  const observationsByFunction = new Map<
    string,
    {
      sourceLabel: string;
      evidence: Array<{ year: number; recordId: string }>;
    }
  >();
  for (const observation of observations) {
    const sourceValue = observation.function?.trim();
    if (!sourceValue || observation.year == null) continue;
    for (const sourceLabel of splitProductionFunctions(sourceValue)) {
      const functionId = recognizedFunctionId(sourceLabel);
      if (!functionId) continue;
      const current = observationsByFunction.get(functionId) ?? {
        sourceLabel,
        evidence: [],
      };
      current.evidence.push({
        year: observation.year,
        recordId: observation.recordId,
      });
      observationsByFunction.set(functionId, current);
    }
  }

  return [...observationsByFunction.entries()].flatMap(
    ([functionId, observation]) =>
      contiguousSpans(observation.evidence.map((item) => item.year)).map(
        ({ observedYears, ...span }) => ({
          id: `function-almanakken-${functionId}-${span.startYear}`,
          functionId,
          functionUri: placeFunctionUri(functionId),
          label: placeFunctionLabels(functionId, observation.sourceLabel).en,
          sourceLabel: observation.sourceLabel,
          evidenceKinds: ['recorded-function'] as PlaceFunctionEvidenceKind[],
          source: 'almanakken',
          sourceRows: [
            ...new Set(
              observation.evidence
                .filter((item) => observedYears.includes(item.year))
                .map((item) => item.recordId),
            ),
          ].sort(),
          certainty: 'probable' as const,
          ...span,
          note: 'Derived from the Almanakken function field.',
        }),
      ),
  );
}

function supportingProductRows(
  place: PlaceFunctionSource,
  functionId: string,
  startYear?: number,
  endYear?: number,
): string[] {
  return [
    ...new Set(
      (place.almanakkenObservations ?? [])
        .filter(
          (observation) =>
            !observation.deserted &&
            observation.year != null &&
            (startYear == null || observation.year >= startYear) &&
            (endYear == null
              ? startYear == null || observation.year === startYear
              : observation.year <= endYear) &&
            splitProductionFunctions(observation.product ?? '').some(
              (sourceLabel) => placeFunctionId(sourceLabel) === functionId,
            ),
        )
        .map((observation) => observation.recordId),
    ),
  ].sort();
}

function mergeDuplicateAssertions(
  assertions: PlaceFunctionAssertion[],
): PlaceFunctionAssertion[] {
  const merged = new Map<string, PlaceFunctionAssertion>();
  for (const assertion of assertions) {
    const key = [
      assertion.functionId,
      assertion.source,
      assertion.startYear ?? '',
      assertion.endYear ?? '',
    ].join('|');
    const current = merged.get(key);
    if (!current) {
      merged.set(key, assertion);
      continue;
    }
    if (
      assertion.evidenceKinds.some((evidenceKind) =>
        current.evidenceKinds.includes(evidenceKind),
      )
    ) {
      merged.set(`${key}|${assertion.id}`, assertion);
      continue;
    }
    const evidenceKinds = [
      ...new Set([...current.evidenceKinds, ...assertion.evidenceKinds]),
    ].sort() as PlaceFunctionEvidenceKind[];
    merged.set(key, {
      ...current,
      ...(assertion.evidenceKinds.includes('recorded-function')
        ? { id: assertion.id }
        : {}),
      evidenceKinds,
      sourceRows: [...new Set([...current.sourceRows, ...assertion.sourceRows])].sort(),
      certainty:
        current.certainty === 'uncertain' || assertion.certainty === 'uncertain'
          ? 'uncertain'
          : current.certainty === 'probable' || assertion.certainty === 'probable'
            ? 'probable'
            : 'certain',
      note:
        evidenceKinds.length > 1
          ? 'Derived from matching Almanakken product and function fields.'
          : current.note,
    });
  }
  return [...merged.values()];
}

export function derivePlaceFunctionAssertions(
  place: PlaceFunctionSource,
): PlaceFunctionAssertion[] {
  const productionAssertions = (place.productAssertions ?? []).flatMap(
    (assertion, assertionIndex) =>
      splitProductionFunctions(assertion.value ?? '').flatMap((sourceLabel) => {
        const functionId = recognizedFunctionId(sourceLabel);
        if (!functionId) return [];
        const source = assertion.source || 'almanakken';
        return [
          {
            id: `${assertion.id || `production-${assertionIndex + 1}`}-${functionId}`,
            functionId,
            functionUri: placeFunctionUri(functionId),
            label: placeFunctionLabels(functionId, sourceLabel).en,
            sourceLabel,
            evidenceKinds: ['production'] as PlaceFunctionEvidenceKind[],
            source,
            sourceRows:
              assertion.sourceRows ??
              (source === 'almanakken'
                ? supportingProductRows(
                    place,
                    functionId,
                    assertion.startYear,
                    assertion.endYear,
                  )
                : []),
            certainty: recognizedCertainty(
              assertion.certainty,
              source === 'almanakken' ? 'probable' : 'certain',
            ),
            startYear: assertion.startYear,
            endYear: assertion.endYear,
            note: assertion.note,
          },
        ];
      }),
  );

  return mergeDuplicateAssertions([
    ...productionAssertions,
    ...observedFunctionSpans(place.almanakkenObservations ?? []),
  ]).sort(
    (a, b) =>
      (a.startYear ?? Number.POSITIVE_INFINITY) -
        (b.startYear ?? Number.POSITIVE_INFINITY) ||
      a.functionId.localeCompare(b.functionId),
  );
}
