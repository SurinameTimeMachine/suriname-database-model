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
  evidenceKind: PlaceFunctionEvidenceKind;
  source: string;
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
}> {
  const sorted = [...new Set(years)].sort((a, b) => a - b);
  const spans: Array<{ startYear: number; endYear?: number }> = [];
  let start: number | undefined;
  let end: number | undefined;
  for (const year of sorted) {
    if (start == null) {
      start = year;
      end = year;
    } else if (end != null && year - end <= 2) {
      end = year;
    } else {
      spans.push({
        startYear: start,
        ...(end !== start ? { endYear: end } : {}),
      });
      start = year;
      end = year;
    }
  }
  if (start != null) {
    spans.push({
      startYear: start,
      ...(end != null && end !== start ? { endYear: end } : {}),
    });
  }
  return spans;
}

function observedFunctionSpans(
  observations: AlmanakkenPlantationObservation[],
): PlaceFunctionAssertion[] {
  const observationsByFunction = new Map<
    string,
    { sourceLabel: string; years: number[] }
  >();
  for (const observation of observations) {
    const sourceValue = observation.function?.trim();
    if (!sourceValue || observation.year == null) continue;
    for (const sourceLabel of splitProductionFunctions(sourceValue)) {
      const functionId = placeFunctionId(sourceLabel);
      if (!functionId || nonFunctionValues.has(functionId)) continue;
      const current = observationsByFunction.get(functionId) ?? {
        sourceLabel,
        years: [],
      };
      current.years.push(observation.year);
      observationsByFunction.set(functionId, current);
    }
  }

  return [...observationsByFunction.entries()].flatMap(
    ([functionId, observation]) =>
      contiguousSpans(observation.years).map((span) => ({
        id: `function-almanakken-${functionId}-${span.startYear}`,
        functionId,
        functionUri: placeFunctionUri(functionId),
        label: placeFunctionLabels(functionId, observation.sourceLabel).en,
        sourceLabel: observation.sourceLabel,
        evidenceKind: 'recorded-function' as const,
        source: 'almanakken',
        ...span,
        note: 'Derived from the Almanakken function field.',
      })),
  );
}

export function derivePlaceFunctionAssertions(
  place: PlaceFunctionSource,
): PlaceFunctionAssertion[] {
  const productionAssertions = (place.productAssertions ?? []).flatMap(
    (assertion, assertionIndex) =>
      splitProductionFunctions(assertion.value ?? '').flatMap((sourceLabel) => {
        const functionId = placeFunctionId(sourceLabel);
        if (!functionId || nonFunctionValues.has(functionId)) return [];
        return [
          {
            id: `${assertion.id || `production-${assertionIndex + 1}`}-${functionId}`,
            functionId,
            functionUri: placeFunctionUri(functionId),
            label: placeFunctionLabels(functionId, sourceLabel).en,
            sourceLabel,
            evidenceKind: 'production' as const,
            source: assertion.source || 'almanakken',
            startYear: assertion.startYear,
            endYear: assertion.endYear,
            note: assertion.note,
          },
        ];
      }),
  );

  return [
    ...productionAssertions,
    ...observedFunctionSpans(place.almanakkenObservations ?? []),
  ].sort(
    (a, b) =>
      (a.startYear ?? Number.POSITIVE_INFINITY) -
        (b.startYear ?? Number.POSITIVE_INFINITY) ||
      a.functionId.localeCompare(b.functionId),
  );
}
