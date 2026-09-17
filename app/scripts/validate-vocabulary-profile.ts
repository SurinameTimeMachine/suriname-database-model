import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import jsonld from 'jsonld';
import { buildGlobaliseVocabularyObject } from '../lib/vocabulary-profile';
import { BASE, buildContext } from './lod-context';

type JsonObject = Record<string, unknown>;
type JsonLdDocument = {
  '@graph'?: JsonObject[];
};

const DATA_PATH = join(__dirname, '../../data/place-types-thesaurus.jsonld');
const DATABASE_PATH = join(__dirname, '../lod/database.jsonld');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function values(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function expandUri(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  if (value.startsWith('stm:')) return `${BASE}${value.slice(4)}`;
  if (!value.includes(':')) return `${BASE}vocabulary/place-type/${value}`;
  return value;
}

function normalizedLanguageValues(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value as JsonObject)
    .flatMap(([language, labels]) =>
      values(labels).flatMap((label) =>
        typeof label === 'string' ? [`${language}\u0000${label}`] : [],
      ),
    )
    .sort();
}

function normalizedPublishedLanguageValues(value: unknown): string[] {
  return values(value)
    .flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const record = item as JsonObject;
      return typeof record['@language'] === 'string' &&
        typeof record['@value'] === 'string'
        ? [`${record['@language']}\u0000${record['@value']}`]
        : [];
    })
    .sort();
}

function normalizedUris(value: unknown): string[] {
  return values(value)
    .flatMap((item) => {
      const uri = expandUri(item);
      return uri ? [uri] : [];
    })
    .sort();
}

function normalizedPublishedUris(value: unknown): string[] {
  return values(value)
    .flatMap((item) => {
      if (typeof item === 'string') return [item];
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const id = (item as JsonObject)['@id'];
      return typeof id === 'string' ? [id] : [];
    })
    .sort();
}

function sameValues(left: unknown[], right: unknown[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertNoSameAs(value: unknown, id: string) {
  if (Array.isArray(value)) {
    value.forEach((item) => assertNoSameAs(item, id));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert(key !== 'sameAs' && key !== 'sdo:sameAs', `${id} introduces sameAs`);
    assertNoSameAs(child, id);
  }
}

async function main() {
  const editorial = JSON.parse(readFileSync(DATA_PATH, 'utf-8')) as JsonLdDocument;
  const database = JSON.parse(
    readFileSync(DATABASE_PATH, 'utf-8'),
  ) as JsonLdDocument;
  const editorialEntries = editorial['@graph'] ?? [];
  const editorialIds = new Set(
    editorialEntries.flatMap((entry) => {
      const id = expandUri(entry['@id']);
      return id ? [id] : [];
    }),
  );
  const publishedEntries = (database['@graph'] ?? []).filter(
    (entry) => typeof entry['@id'] === 'string' && editorialIds.has(entry['@id']),
  );
  const publishedById = new Map(
    publishedEntries.map((entry) => [entry['@id'] as string, entry]),
  );

  assert(
    publishedEntries.length === editorialEntries.length,
    `Published ${publishedEntries.length} vocabulary entries for ${editorialEntries.length} editorial entries`,
  );

  const languageFields = [
    ['prefLabel', 'skos:prefLabel'],
    ['altLabel', 'skos:altLabel'],
    ['definition', 'skos:definition'],
    ['scopeNote', 'skos:scopeNote'],
    ['editorialNote', 'skos:editorialNote'],
  ] as const;
  const relationFields = [
    ['inScheme', 'skos:inScheme'],
    ['topConceptOf', 'skos:topConceptOf'],
    ['hasTopConcept', 'skos:hasTopConcept'],
    ['broader', 'skos:broader'],
    ['narrower', 'skos:narrower'],
    ['related', 'skos:related'],
    ['exactMatch', 'skos:exactMatch'],
    ['closeMatch', 'skos:closeMatch'],
    ['broadMatch', 'skos:broadMatch'],
    ['narrowMatch', 'skos:narrowMatch'],
    ['relatedMatch', 'skos:relatedMatch'],
  ] as const;
  const scalarFields = [
    ['typeId', 'typeId'],
    ['color', 'color'],
    ['crmClass', 'crmClass'],
    ['crmBadge', 'crmBadge'],
    ['sortOrder', 'sortOrder'],
    ['created', 'dcterms:created'],
    ['modified', 'dcterms:modified'],
    ['deprecated', 'owl:deprecated'],
    ['deprecatedAt', 'prov:invalidatedAtTime'],
    ['deprecatedBy', 'deprecatedBy'],
    ['deprecationNote', 'deprecationNote'],
  ] as const;

  for (const source of editorialEntries) {
    const id = expandUri(source['@id']);
    assert(id, 'Editorial vocabulary entry has no usable @id');
    const published = publishedById.get(id);
    assert(published, `No published vocabulary object for ${id}`);
    assert(published['@id'] === id, `Canonical identifier changed for ${id}`);

    for (const [sourceField, publishedField] of languageFields) {
      assert(
        sameValues(
          normalizedLanguageValues(source[sourceField]),
          normalizedPublishedLanguageValues(published[publishedField]),
        ),
        `${id} does not preserve ${sourceField}`,
      );
    }
    for (const [sourceField, publishedField] of relationFields) {
      const expected = normalizedUris(source[sourceField]);
      const actual = normalizedPublishedUris(published[publishedField]);
      if (
        sourceField === 'inScheme' &&
        expected.length === 0 &&
        id.startsWith(`${BASE}vocabulary/place-type/`)
      ) {
        expected.push(`${BASE}vocabulary/place-type`);
      }
      assert(
        sameValues(expected.sort(), actual),
        `${id} does not preserve ${sourceField}`,
      );
    }
    for (const [sourceField, publishedField] of scalarFields) {
      assert(
        source[sourceField] === published[publishedField],
        `${id} does not preserve ${sourceField}`,
      );
    }

    if (typeof source.typeId === 'string') {
      assert(
        published['skos:notation'] === source.typeId,
        `${id} does not publish typeId as skos:notation`,
      );
    }
    if (source.replacedBy != null) {
      assert(
        normalizedPublishedUris(published['dcterms:isReplacedBy'])[0] ===
          expandUri(source.replacedBy),
        `${id} does not preserve replacedBy`,
      );
    }

    assertNoSameAs(published, id);
    const profile = buildGlobaliseVocabularyObject(published);
    assert(profile.id === id, `${id} profile changed the canonical identifier`);
    const expectedCompactType = values(published['@type']).includes(
      'skos:ConceptScheme',
    )
      ? 'ConceptScheme'
      : 'Concept';
    assert(
      values(profile.type).includes(expectedCompactType),
      `${id} profile has the wrong compact type`,
    );
    assert(
      typeof profile._label === 'string' && profile._label.length > 0,
      `${id} profile has no display label`,
    );
    const expanded = (await jsonld.expand({
      ...profile,
      '@context': buildContext(),
    } as jsonld.JsonLdDocument)) as unknown[];
    assert(expanded.length === 1, `${id} profile does not expand to one node`);
  }

  const plantationId = `${BASE}vocabulary/place-type/plantation`;
  const plantation = publishedById.get(plantationId);
  assert(plantation, 'Plantation concept is missing from publication');
  assert(
    values(plantation['skos:definition']).length > 0 &&
      values(plantation['skos:editorialNote']).length > 0 &&
      values(plantation['skos:closeMatch']).length > 0,
    'Plantation concept lost its definition, editorial note, or close match',
  );

  console.log(
    `Vocabulary profile OK: ${publishedEntries.length} stable concept objects preserve editorial labels, notes, hierarchy, mappings, dates, and metadata; every compact profile expands as JSON-LD.`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
