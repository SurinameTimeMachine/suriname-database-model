import { readFileSync } from 'fs';
import { join } from 'path';

import type { GazetteerPlace } from '@/lib/types';

const MATCH_TYPES = new Set([
  'exactMatch',
  'closeMatch',
  'broadMatch',
  'narrowMatch',
  'relatedMatch',
]);
const WIKIDATA_QID = /^Q\d+$/;

const THESAURUS_FILE = join(
  process.cwd(),
  '..',
  'data',
  'place-types-thesaurus.jsonld',
);
const SOURCES_FILE = join(
  process.cwd(),
  '..',
  'data',
  'sources-registry.jsonld',
);

type JsonObject = Record<string, unknown>;

function readGraph(path: string): JsonObject[] {
  try {
    const document = JSON.parse(readFileSync(path, 'utf-8')) as JsonObject;
    return Array.isArray(document['@graph'])
      ? (document['@graph'] as JsonObject[])
      : [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read JSON-LD graph from ${path}: ${message}`);
  }
}

export function loadCrmMapping(): Record<string, string> {
  return Object.fromEntries(
    readGraph(THESAURUS_FILE)
      .filter((entry) => typeof entry.typeId === 'string')
      .map((entry) => [entry.typeId as string, entry.crmClass as string]),
  );
}

export function loadTypeOrder(): Record<string, number> {
  return Object.fromEntries(
    readGraph(THESAURUS_FILE)
      .filter(
        (entry) =>
          typeof entry.typeId === 'string' && typeof entry.sortOrder === 'number',
      )
      .map((entry) => [entry.typeId as string, entry.sortOrder as number]),
  );
}

function knownSourceIds(): Set<string> {
  return new Set(
    readGraph(SOURCES_FILE)
      .map((entry) => entry.sourceId)
      .filter((sourceId): sourceId is string => typeof sourceId === 'string'),
  );
}

function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(
      values
        .filter(
          (value): value is string =>
            typeof value === 'string' && Boolean(value.trim()),
        )
        .map((value) => value.trim()),
    ),
  ];
}

function validYear(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= -10000 &&
    value <= 10000
  );
}

function assertionErrors(
  label: string,
  assertions: unknown,
  sourceIds: Set<string>,
  requireTime: boolean,
): string[] {
  if (!Array.isArray(assertions)) return [];
  const errors: string[] = [];
  const identifiers = new Set<string>();

  assertions.forEach((assertion, index) => {
    if (!assertion || typeof assertion !== 'object' || Array.isArray(assertion)) {
      errors.push(`${label} statement ${index + 1} is invalid`);
      return;
    }
    const value = assertion as Record<string, unknown>;
    const id = typeof value.id === 'string' ? value.id.trim() : '';
    if (!id) errors.push(`${label} statement ${index + 1} needs a stable ID`);
    else if (identifiers.has(id))
      errors.push(`${label} statement ID "${id}" is duplicated`);
    else identifiers.add(id);

    const source = typeof value.source === 'string' ? value.source.trim() : '';
    if (!source) errors.push(`${label} statement ${index + 1} needs a source`);
    else if (!sourceIds.has(source))
      errors.push(`${label} statement ${index + 1} uses unknown source "${source}"`);

    const start = value.startYear ?? value.sourceYear;
    const end = value.endYear;
    if (start != null && !validYear(start))
      errors.push(`${label} statement ${index + 1} has an invalid start year`);
    if (end != null && !validYear(end))
      errors.push(`${label} statement ${index + 1} has an invalid end year`);
    if (validYear(start) && validYear(end) && end < start)
      errors.push(`${label} statement ${index + 1} ends before it starts`);
    if (requireTime && start == null && end == null) {
      errors.push(`${label} statement ${index + 1} needs a source date or time span`);
    }
  });

  return errors;
}

/**
 * Keep the Gazetteer as the concise editorial source of truth. JSON-LD fields
 * are derived by the publication pipeline and must never be hand-edited here.
 */
export function prepareEditorialPlace(raw: unknown): {
  place?: GazetteerPlace;
  errors: string[];
} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return { errors: ['Place payload is invalid'] };

  const { wikidataQid: _legacyWikidataQid, ...candidate } = raw as Record<string, unknown>;
  const errors: string[] = [];
  const sourceIds = knownSourceIds();
  const crmMapping = loadCrmMapping();
  const place = candidate as unknown as GazetteerPlace & {
    '@id'?: string;
    '@type'?: string | string[];
  };

  if (!place.id || typeof place.id !== 'string')
    errors.push('A Gazetteer ID is required');
  if (!place.type || !crmMapping[place.type])
    errors.push('A valid place type is required');
  place.names = (Array.isArray(place.names) ? place.names : []).flatMap(
    (name, index) => {
      if (!name || typeof name !== 'object' || Array.isArray(name)) {
        errors.push(`Name ${index + 1} is invalid`);
        return [];
      }
      return [name];
    },
  );
  if (!Array.isArray(place.names) || place.names.length === 0)
    errors.push('At least one name is required');
  if (!place.names?.some((name) => name.isPreferred && name.text?.trim()))
    errors.push('One preferred name is required');

  place.sources = uniqueStrings(place.sources);
  const unknownRecordSources = place.sources.filter((source) => !sourceIds.has(source));
  if (unknownRecordSources.length > 0) {
    errors.push(`Unknown record source: ${unknownRecordSources.join(', ')}`);
  }

  const seenExternalLinks = new Set<string>();
  if (
    (candidate as Record<string, unknown>).externalLinks != null &&
    !Array.isArray((candidate as Record<string, unknown>).externalLinks)
  ) {
    errors.push('External links must be an array');
  }
  place.externalLinks = (Array.isArray(place.externalLinks)
    ? place.externalLinks
    : []
  ).flatMap((link) => {
    if (!link || typeof link !== 'object' || Array.isArray(link)) {
      errors.push('Every external link must be an object');
      return [];
    }
    const authority = typeof link.authority === 'string' ? link.authority.trim() : '';
    const identifier = typeof link.identifier === 'string' ? link.identifier.trim() : '';
    if (!authority || !identifier) {
      errors.push('Every external link needs both an authority and identifier');
      return [];
    }
    if (authority === 'wikidata' && !WIKIDATA_QID.test(identifier)) {
      errors.push(`External link ${authority}:${identifier} has an invalid QID`);
      return [];
    }
    if (!MATCH_TYPES.has(link.matchType)) {
      errors.push(`External link ${authority}:${identifier} has an invalid match type`);
      return [];
    }
    const key = JSON.stringify([authority, identifier, link.matchType]);
    if (seenExternalLinks.has(key)) {
      errors.push(`External link ${authority}:${identifier}:${link.matchType} is duplicated`);
      return [];
    }
    seenExternalLinks.add(key);
    return [{ ...link, authority, identifier }];
  });

  for (const [index, name] of (place.names ?? []).entries()) {
    if (!name.text?.trim()) errors.push(`Name ${index + 1} is empty`);
    if (name.source && !sourceIds.has(name.source))
      errors.push(`Name ${index + 1} uses unknown source "${name.source}"`);
    if (name.sourceYear != null && !validYear(name.sourceYear))
      errors.push(`Name ${index + 1} has an invalid source year`);
  }

  errors.push(
    ...assertionErrors('District', place.districtAssertions, sourceIds, false),
    ...assertionErrors('Product', place.productAssertions, sourceIds, true),
    ...assertionErrors('Location', place.locationAssertions, sourceIds, false),
    ...assertionErrors('Operational status', place.statusAssertions, sourceIds, true),
  );

  const assertionIds = new Set<string>();
  for (const assertions of [
    place.districtAssertions,
    place.locationAssertions,
    place.statusAssertions,
    place.productAssertions,
  ]) {
    for (const assertion of assertions ?? []) {
      if (!assertion || typeof assertion !== 'object' || Array.isArray(assertion)) {
        continue;
      }
      if (!assertion.id) continue;
      if (assertionIds.has(assertion.id)) {
        errors.push(`Assertion ID "${assertion.id}" is reused by more than one statement`);
      }
      assertionIds.add(assertion.id);
    }
  }

  if (errors.length > 0) return { errors };

  place['@id'] = `stm:place/${place.id}`;
  place['@type'] = crmMapping[place.type];
  return { place, errors: [] };
}

export function sortGazetteer(
  places: GazetteerPlace[],
  getLabel: (place: GazetteerPlace) => string,
) {
  const typeOrder = loadTypeOrder();
  places.sort((a, b) => {
    const retired =
      Number(Boolean(a.mergedInto)) - Number(Boolean(b.mergedInto));
    if (retired !== 0) return retired;
    const typeDifference =
      (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99);
    return typeDifference !== 0
      ? typeDifference
      : getLabel(a).localeCompare(getLabel(b));
  });
}
