'use client';

import { useEffect, useState } from 'react';

// ---------- Types ----------

/** Language-tagged string map: { en: "...", nl: "...", srn: "..." } */
export interface LangMap {
  [lang: string]: string | undefined;
}

/** Language-tagged string array map: { en: ["..."], nl: ["...", "..."] } */
export interface LangArrayMap {
  [lang: string]: string[] | undefined;
}

export interface PlaceTypeConcept {
  id: string;
  typeId: string;
  prefLabel: LangMap;
  altLabels: LangArrayMap;
  definition: LangMap;
  editorialNote: LangMap;
  historyNote: string | null;
  color: string;
  crmClass: string;
  crmBadge: string;
  sortOrder: number;
  broader: string | null;
  related: string[];
  exactMatch: string[];
  closeMatch: string[];
  created: string | null;
  modified: string | null;
  /** Present and true when the concept has been deprecated (soft-deleted). */
  deprecated?: true;
}

export interface ThesaurusScheme {
  id: string;
  prefLabel: LangMap;
  scopeNote: LangMap;
  created: string | null;
  modified: string | null;
}

export interface ThesaurusData {
  scheme: ThesaurusScheme;
  concepts: PlaceTypeConcept[];
}

/** Derived lookup maps for UI consumption (English labels by default) */
export interface PlaceTypeMaps {
  colors: Record<string, string>;
  labels: Record<string, string>;
  crmBadges: Record<string, string>;
  crmClasses: Record<string, string>;
  biasTypes: Record<string, { altTerms: string[]; editorialNote: string }>;
  allTypes: string[];
  typeOrder: Record<string, number>;
  concepts: PlaceTypeConcept[];
  scheme: ThesaurusScheme | null;
  loading: boolean;
}

// ---------- Parser ----------

/* eslint-disable @typescript-eslint/no-explicit-any */
function toArray(val: any): string[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

/** Extract a language map from a JSON-LD value. Handles both plain strings (backward compat) and { en: "...", nl: "..." } objects. */
function toLangMap(val: any): LangMap {
  if (!val) return {};
  if (typeof val === 'string') return { en: val };
  if (typeof val === 'object' && !Array.isArray(val)) return val as LangMap;
  return {};
}

/** Extract a language-tagged array map. Handles plain arrays (backward compat) and { en: ["..."], nl: ["...", "..."] } objects. */
function toLangArrayMap(val: any): LangArrayMap {
  if (!val) return {};
  if (Array.isArray(val)) return { en: val };
  if (typeof val === 'string') return { en: [val] };
  if (typeof val === 'object') {
    const result: LangArrayMap = {};
    for (const [lang, v] of Object.entries(val)) {
      result[lang] = Array.isArray(v) ? (v as string[]) : [v as string];
    }
    return result;
  }
  return {};
}

/** Get the English value from a LangMap, with fallback to first available language. */
export function langEn(map: LangMap): string {
  return map.en || Object.values(map).find((v) => v) || '';
}

/** Flatten a LangArrayMap into a single string array (all languages). */
function flattenLangArrayMap(map: LangArrayMap): string[] {
  return Object.values(map).flat().filter(Boolean) as string[];
}

export function parseThesaurus(data: any): ThesaurusData {
  const graph: any[] = data['@graph'] || [];

  const schemeEntry = graph.find((e) => {
    const t = toArray(e['@type']);
    return t.includes('skos:ConceptScheme');
  });

  const concepts: PlaceTypeConcept[] = graph
    .filter((e) => e.typeId)
    .map((e) => ({
      id: e['@id'],
      typeId: e.typeId,
      prefLabel: toLangMap(e.prefLabel),
      altLabels: toLangArrayMap(e.altLabel),
      definition: toLangMap(e.definition),
      editorialNote: toLangMap(e.editorialNote),
      historyNote: e.historyNote || null,
      color: e.color || '#888888',
      crmClass: e.crmClass || 'E53_Place',
      crmBadge: e.crmBadge || 'E53',
      sortOrder: typeof e.sortOrder === 'number' ? e.sortOrder : 99,
      broader: e.broader || null,
      related: toArray(e.related),
      exactMatch: toArray(e.exactMatch),
      closeMatch: toArray(e.closeMatch),
      created: e.created || null,
      modified: e.modified || null,
      ...(e.deprecated === true ? { deprecated: true as const } : {}),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    scheme: schemeEntry
      ? {
          id: schemeEntry['@id'],
          prefLabel: toLangMap(schemeEntry.prefLabel),
          scopeNote: toLangMap(schemeEntry.scopeNote),
          created: schemeEntry.created || null,
          modified: schemeEntry.modified || null,
        }
      : { id: '', prefLabel: {}, scopeNote: {}, created: null, modified: null },
    concepts,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------- Derived maps ----------

function deriveMaps(data: ThesaurusData, loadingState: boolean): PlaceTypeMaps {
  const { concepts, scheme } = data;
  return {
    colors: Object.fromEntries(concepts.map((c) => [c.typeId, c.color])),
    labels: Object.fromEntries(
      concepts.map((c) => [c.typeId, langEn(c.prefLabel)]),
    ),
    crmBadges: Object.fromEntries(concepts.map((c) => [c.typeId, c.crmBadge])),
    crmClasses: Object.fromEntries(concepts.map((c) => [c.typeId, c.crmClass])),
    biasTypes: Object.fromEntries(
      concepts
        .filter((c) => Object.keys(c.editorialNote).length > 0)
        .map((c) => [
          c.typeId,
          {
            altTerms: flattenLangArrayMap(c.altLabels),
            editorialNote: langEn(c.editorialNote),
          },
        ]),
    ),
    allTypes: concepts.map((c) => c.typeId),
    typeOrder: Object.fromEntries(concepts.map((c) => [c.typeId, c.sortOrder])),
    concepts,
    scheme,
    loading: loadingState,
  };
}

// ---------- Module-level cache ----------

let _cache: ThesaurusData | null = null;
let _promise: Promise<ThesaurusData> | null = null;

export function loadThesaurus(): Promise<ThesaurusData> {
  if (_cache) return Promise.resolve(_cache);
  if (!_promise) {
    _promise = fetch('/data/place-types-thesaurus.jsonld')
      .then((r) => r.json())
      .then((data) => {
        _cache = parseThesaurus(data);
        return _cache;
      });
  }
  return _promise;
}

/** Invalidate the client-side cache so the next call to loadThesaurus re-fetches. */
export function invalidateThesaurusCache(): void {
  _cache = null;
  _promise = null;
}

// ---------- Static fallback (matches initial thesaurus values) ----------

const FALLBACK_DATA: ThesaurusData = {
  scheme: {
    id: 'stm:vocabulary/place-type',
    prefLabel: { en: 'Geographical Features Thesaurus' },
    scopeNote: {},
    created: null,
    modified: null,
  },
  concepts: [
    {
      id: '',
      typeId: 'district',
      prefLabel: { en: 'District' },
      altLabels: {},
      definition: {},
      editorialNote: {},
      historyNote: null,
      color: '#7ab56a',
      crmClass: 'E53_Place',
      crmBadge: 'E53',
      sortOrder: 0,
      broader: 'stm:vocabulary/place-type/administrative',
      related: [],
      exactMatch: [],
      closeMatch: [],
      created: null,
      modified: null,
    },
    {
      id: '',
      typeId: 'plantation',
      prefLabel: { en: 'Plantation' },
      altLabels: {},
      definition: {},
      editorialNote: {},
      historyNote: null,
      color: '#e6956b',
      crmClass: 'E25_Human-Made_Feature',
      crmBadge: 'E25',
      sortOrder: 1,
      broader: 'stm:vocabulary/place-type/human-made',
      related: [],
      exactMatch: [],
      closeMatch: [],
      created: null,
      modified: null,
    },
    {
      id: '',
      typeId: 'military-post',
      prefLabel: { en: 'Military Post' },
      altLabels: {},
      definition: {},
      editorialNote: {},
      historyNote: null,
      color: '#c47a55',
      crmClass: 'E25_Human-Made_Feature',
      crmBadge: 'E25',
      sortOrder: 2,
      broader: 'stm:vocabulary/place-type/human-made',
      related: [],
      exactMatch: [],
      closeMatch: [],
      created: null,
      modified: null,
    },
    {
      id: '',
      typeId: 'transport-infrastructure',
      prefLabel: { en: 'Transport Infrastructure' },
      altLabels: {},
      definition: {
        en: 'Human-made linear infrastructure used for overland movement and connection between places.',
      },
      editorialNote: {},
      historyNote: null,
      color: '#ad7444',
      crmClass: 'E25_Human-Made_Feature',
      crmBadge: 'E25',
      sortOrder: 3,
      broader: 'stm:vocabulary/place-type/human-made',
      related: [],
      exactMatch: [],
      closeMatch: [],
      created: null,
      modified: null,
    },
    {
      id: '',
      typeId: 'road',
      prefLabel: { en: 'Road' },
      altLabels: { en: ['Street'], nl: ['Straat'] },
      definition: {
        en: 'A constructed path or route for transportation between settlements.',
      },
      editorialNote: {
        en: 'Urban streets are currently normalized under road because the available source data does not support a stable distinction between road and street.',
      },
      historyNote: null,
      color: '#b87d4a',
      crmClass: 'E25_Human-Made_Feature',
      crmBadge: 'E25',
      sortOrder: 4,
      broader: 'stm:vocabulary/place-type/transport-infrastructure',
      related: [],
      exactMatch: [],
      closeMatch: [],
      created: null,
      modified: null,
    },
    {
      id: '',
      typeId: 'railroad',
      prefLabel: { en: 'Railroad' },
      altLabels: {},
      definition: {},
      editorialNote: {},
      historyNote: null,
      color: '#a06040',
      crmClass: 'E25_Human-Made_Feature',
      crmBadge: 'E25',
      sortOrder: 5,
      broader: 'stm:vocabulary/place-type/transport-infrastructure',
      related: [],
      exactMatch: [],
      closeMatch: [],
      created: null,
      modified: null,
    },
    {
      id: '',
      typeId: 'station',
      prefLabel: { en: 'Astronomical Station' },
      altLabels: {},
      definition: {},
      editorialNote: {},
      historyNote: null,
      color: '#d4a882',
      crmClass: 'E25_Human-Made_Feature',
      crmBadge: 'E25',
      sortOrder: 6,
      broader: 'stm:vocabulary/place-type/human-made',
      related: [],
      exactMatch: [],
      closeMatch: [],
      created: null,
      modified: null,
    },
    {
      id: '',
      typeId: 'settlement',
      prefLabel: { en: 'Settlement' },
      altLabels: {},
      definition: {},
      editorialNote: {},
      historyNote: null,
      color: '#cf8860',
      crmClass: 'E25_Human-Made_Feature',
      crmBadge: 'E25',
      sortOrder: 7,
      broader: 'stm:vocabulary/place-type/human-made',
      related: [],
      exactMatch: [],
      closeMatch: [],
      created: null,
      modified: null,
    },
    {
      id: '',
      typeId: 'town',
      prefLabel: { en: 'Town' },
      altLabels: {},
      definition: {},
      editorialNote: {},
      historyNote: null,
      color: '#d4a074',
      crmClass: 'E25_Human-Made_Feature',
      crmBadge: 'E25',
      sortOrder: 8,
      broader: 'stm:vocabulary/place-type/settlement',
      related: [],
      exactMatch: [],
      closeMatch: [],
      created: null,
      modified: null,
    },
    {
      id: '',
      typeId: 'indigenous-village',
      prefLabel: { en: 'Indigenous Village' },
      altLabels: {},
      definition: {},
      editorialNote: {},
      historyNote: null,
      color: '#e8ad80',
      crmClass: 'E25_Human-Made_Feature',
      crmBadge: 'E25',
      sortOrder: 9,
      broader: 'stm:vocabulary/place-type/settlement',
      related: [],
      exactMatch: [],
      closeMatch: [],
      created: null,
      modified: null,
    },
    {
      id: '',
      typeId: 'maroon-village',
      prefLabel: { en: 'Maroon Village' },
      altLabels: {},
      definition: {},
      editorialNote: {},
      historyNote: null,
      color: '#d09070',
      crmClass: 'E25_Human-Made_Feature',
      crmBadge: 'E25',
      sortOrder: 10,
      broader: 'stm:vocabulary/place-type/settlement',
      related: [],
      exactMatch: [],
      closeMatch: [],
      created: null,
      modified: null,
    },
    {
      id: '',
      typeId: 'river',
      prefLabel: { en: 'River' },
      altLabels: {},
      definition: {},
      editorialNote: {},
      historyNote: null,
      color: '#4a88bf',
      crmClass: 'E26_Physical_Feature',
      crmBadge: 'E26',
      sortOrder: 11,
      broader: 'stm:vocabulary/place-type/natural',
      related: [],
      exactMatch: [],
      closeMatch: [],
      created: null,
      modified: null,
    },
    {
      id: '',
      typeId: 'creek',
      prefLabel: { en: 'Creek' },
      altLabels: {},
      definition: {},
      editorialNote: {},
      historyNote: null,
      color: '#8dbde0',
      crmClass: 'E26_Physical_Feature',
      crmBadge: 'E26',
      sortOrder: 12,
      broader: 'stm:vocabulary/place-type/natural',
      related: [],
      exactMatch: [],
      closeMatch: [],
      created: null,
      modified: null,
    },
  ],
};

const FALLBACK_MAPS: PlaceTypeMaps = deriveMaps(FALLBACK_DATA, true);

// ---------- React hook ----------

export function usePlaceTypes(): PlaceTypeMaps {
  const [maps, setMaps] = useState<PlaceTypeMaps>(() => {
    if (_cache) return deriveMaps(_cache, false);
    return FALLBACK_MAPS;
  });

  useEffect(() => {
    let mounted = true;
    loadThesaurus().then((data) => {
      if (mounted) setMaps(deriveMaps(data, false));
    });
    return () => {
      mounted = false;
    };
  }, []);

  return maps;
}
