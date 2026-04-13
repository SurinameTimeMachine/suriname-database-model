'use client';

import type { GeoJSONCollection, GeoJSONFeature } from '@/lib/types';
import { useMemo, useState } from 'react';

interface SearchBarProps {
  geojson: GeoJSONCollection | null;
  onSelect: (feature: GeoJSONFeature) => void;
  onHighlightName?: (name: string) => void;
}

export default function SearchBar({
  geojson,
  onSelect,
  onHighlightName,
}: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    if (!geojson || query.length < 2) return [];
    const q = query.toLowerCase();
    return geojson.features
      .filter((f) => {
        if (f.properties.name?.toLowerCase().includes(q)) return true;
        // Also search all historical/vernacular name variants
        return (f.properties.allNames ?? []).some((n: string) =>
          n.toLowerCase().includes(q),
        );
      })
      .slice(0, 20);
  }, [geojson, query]);

  return (
    <div className="absolute top-4 left-14 z-1000 w-72">
      <input
        type="text"
        placeholder="Search plantations..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && query.length >= 2 && onHighlightName) {
            onHighlightName(query);
            setOpen(false);
          }
        }}
        onFocus={() => setOpen(true)}
        aria-label="Search plantations by name"
        aria-autocomplete="list"
        role="combobox"
        aria-expanded={open && results.length > 0}
        className="w-full px-3 py-2 border border-stm-warm-300 bg-white/95 backdrop-blur-sm shadow-md text-sm text-stm-warm-900 placeholder:text-stm-warm-400 focus:outline-none focus:ring-2 focus:ring-stm-sepia-400"
      />
      {open && results.length > 0 && (
        <ul
          className="mt-1 bg-white/98 backdrop-blur-sm border border-stm-warm-200 shadow-lg max-h-64 overflow-y-auto"
          role="listbox"
        >
          {results.map((f) => (
            <li key={f.id} role="option">
              <button
                className="w-full text-left px-3 py-2 text-sm text-stm-warm-800 hover:bg-stm-sepia-50 transition-colors"
                onClick={() => {
                  onSelect(f);
                  setQuery(f.properties.name);
                  setOpen(false);
                }}
              >
                <span className="font-medium">{f.properties.name}</span>
                {f.properties.organizationQid && (
                  <span className="ml-2 text-xs text-stm-warm-400">
                    {f.properties.organizationQid}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
