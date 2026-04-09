'use client';

import { useEffect, useState } from 'react';

// ---------- Types ----------

export interface SourceCategory {
  id: string;
  categoryId: string;
  prefLabel: string;
  description: string;
}

export interface Source {
  id: string;
  sourceId: string;
  prefLabel: string;
  type: string;
  mapYear: number | null;
  timeSpan: string | null;
  maker: string | null;
  publisher: string | null;
  publicationPlace: string | null;
  holdingArchive: string | null;
  handleUrl: string | null;
  iiifManifest: string | null;
  iiifInfoUrl: string | null;
  sameAs: string | null;
  description: string | null;
  linkedToGazetteer: boolean;
}

export interface SourceRegistryData {
  prefLabel: string;
  description: string;
  categories: SourceCategory[];
  sources: Source[];
}

// ---------- Parser ----------

/* eslint-disable @typescript-eslint/no-explicit-any */
function toArray(val: any): string[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

const BASE = 'https://data.suriname-timemachine.org/';

function extractCategoryId(uri: string): string {
  return uri.replace(`${BASE}type/source-type/`, '');
}

export function parseSourceRegistry(data: any): SourceRegistryData {
  const graph: any[] = data['@graph'] || [];

  const categories: SourceCategory[] = [];
  const sources: Source[] = [];

  for (const entry of graph) {
    const types = toArray(entry['@type']);

    if (types.includes('crm:E55_Type')) {
      categories.push({
        id: entry['@id'] || '',
        categoryId: extractCategoryId(entry['@id'] || ''),
        prefLabel: entry.prefLabel || '',
        description: entry.description || '',
      });
    }

    if (types.includes('crm:E22_Human-Made_Object')) {
      sources.push({
        id: entry['@id'] || '',
        sourceId: entry.sourceId || '',
        prefLabel: entry.prefLabel || '',
        type: entry.P2_has_type || '',
        mapYear: entry.mapYear ?? null,
        timeSpan: entry.timeSpan ?? null,
        maker: entry.maker ?? null,
        publisher: entry.publisher ?? null,
        publicationPlace: entry.publicationPlace ?? null,
        holdingArchive: entry.holdingArchive ?? null,
        handleUrl: entry.handleUrl ?? null,
        iiifManifest: entry.iiifManifest ?? null,
        iiifInfoUrl: entry.iiifInfoUrl ?? null,
        sameAs: entry.sameAs ?? null,
        description: entry.description ?? null,
        linkedToGazetteer: entry.linkedToGazetteer === true,
      });
    }
  }

  return {
    prefLabel: data.prefLabel || '',
    description: data.description || '',
    categories,
    sources,
  };
}

export function getSourcesByCategory(
  sources: Source[],
  categories: SourceCategory[],
): Map<string, Source[]> {
  const map = new Map<string, Source[]>();
  for (const cat of categories) {
    map.set(cat.id, []);
  }
  for (const src of sources) {
    const list = map.get(src.type);
    if (list) {
      list.push(src);
    }
  }
  // Sort each category's sources by year (ascending), then by label
  for (const [, list] of map) {
    list.sort((a, b) => {
      if (a.mapYear && b.mapYear) return a.mapYear - b.mapYear;
      if (a.mapYear) return -1;
      if (b.mapYear) return 1;
      return a.prefLabel.localeCompare(b.prefLabel);
    });
  }
  return map;
}

export function getActiveSources(sources: Source[]): Source[] {
  return sources.filter((s) => s.linkedToGazetteer);
}

export function getFutureSources(sources: Source[]): Source[] {
  return sources.filter((s) => !s.linkedToGazetteer);
}

export function getCategoryLabel(
  typeUri: string,
  categories: SourceCategory[],
): string {
  const cat = categories.find((c) => c.id === typeUri);
  return cat?.prefLabel || typeUri.split('/').pop() || '';
}

// ---------- Hook ----------

export function useSourceRegistry(): SourceRegistryData & { loading: boolean } {
  const [data, setData] = useState<SourceRegistryData>({
    prefLabel: '',
    description: '',
    categories: [],
    sources: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/data/sources-registry.jsonld')
      .then((r) => r.json())
      .then((raw) => {
        setData(parseSourceRegistry(raw));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { ...data, loading };
}
