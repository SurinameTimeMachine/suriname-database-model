export const vocabularyProfileContext =
  'https://data.surinametijdmachine.org/data/context/stm-v1.jsonld';

type JsonObject = Record<string, unknown>;

const conceptFields: Record<string, string> = {
  'skos:prefLabel': 'prefLabel',
  'skos:altLabel': 'altLabel',
  'skos:definition': 'definition',
  'skos:editorialNote': 'editorialNote',
  'skos:example': 'example',
  'skos:hiddenLabel': 'hiddenLabel',
  'skos:scopeNote': 'scopeNote',
  'skos:historyNote': 'historyNote',
  'skos:broader': 'broader',
  'skos:narrower': 'narrower',
  'skos:related': 'related',
  'skos:inScheme': 'inScheme',
  'skos:topConceptOf': 'topConceptOf',
  'skos:hasTopConcept': 'hasTopConcept',
  'skos:exactMatch': 'exactMatch',
  'skos:closeMatch': 'closeMatch',
  'skos:broadMatch': 'broadMatch',
  'skos:narrowMatch': 'narrowMatch',
  'skos:relatedMatch': 'relatedMatch',
  'skos:notation': 'notation',
  'dcterms:created': 'created',
  'dcterms:modified': 'modified',
  'dcterms:isReplacedBy': 'replacedBy',
  'owl:deprecated': 'deprecated',
  'prov:invalidatedAtTime': 'deprecatedAt',
};

const arrayFields = new Set([
  'altLabel',
  'broadMatch',
  'broader',
  'closeMatch',
  'definition',
  'editorialNote',
  'example',
  'exactMatch',
  'hasTopConcept',
  'hiddenLabel',
  'inScheme',
  'narrowMatch',
  'narrower',
  'notation',
  'prefLabel',
  'related',
  'relatedMatch',
  'scopeNote',
  'topConceptOf',
]);

function values(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function compactType(value: unknown): unknown {
  const types = values(value).map((type) => {
    if (type === 'skos:Concept') return 'Concept';
    if (type === 'skos:ConceptScheme') return 'ConceptScheme';
    return type;
  });
  return types.length === 1 ? types[0] : types;
}

function compactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compactValue);
  if (!value || typeof value !== 'object') return value;

  const object = value as JsonObject;
  if ('@value' in object) return { ...object };

  const compact: JsonObject = {};
  for (const [key, child] of Object.entries(object)) {
    if (key === '@id') compact.id = child;
    else if (key === '@type') compact.type = compactType(child);
    else compact[conceptFields[key] ?? key] = compactValue(child);
  }
  return compact;
}

export function isVocabularyEntity(entity: JsonObject): boolean {
  const types = values(entity['@type']);
  return (
    typeof entity['@id'] === 'string' &&
    entity['@id'].startsWith('https://data.surinametijdmachine.org/') &&
    (types.includes('skos:Concept') || types.includes('skos:ConceptScheme'))
  );
}

/**
 * Build the readable per-concept representation while preserving STM
 * identifiers and STM-specific editorial data.
 */
export function buildReadableVocabularyObject(
  entity: JsonObject,
  context = vocabularyProfileContext,
): JsonObject {
  if (!isVocabularyEntity(entity)) {
    throw new Error('The readable vocabulary profile only supports concepts');
  }

  const compact = compactValue(entity) as JsonObject;
  const result: JsonObject = {
    '@context': context,
    id: compact.id,
    type: compact.type,
    _label: compact._label,
  };

  for (const field of [
    'altLabel',
    'broadMatch',
    'broader',
    'closeMatch',
    'definition',
    'editorialNote',
    'example',
    'exactMatch',
    'hiddenLabel',
    'inScheme',
    'narrowMatch',
    'narrower',
    'notation',
    'prefLabel',
    'related',
    'relatedMatch',
    'scopeNote',
    'topConceptOf',
    'hasTopConcept',
  ]) {
    result[field] = values(compact[field]);
  }

  for (const [key, value] of Object.entries(compact)) {
    if (
      key === 'id' ||
      key === 'type' ||
      key === '_label' ||
      arrayFields.has(key)
    ) {
      continue;
    }
    result[key] = value;
  }

  return result;
}
