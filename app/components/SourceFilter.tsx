'use client';

import type { Source, SourceCategory } from '@/lib/sources';
import { getSourcesByCategory } from '@/lib/sources';
import { useState } from 'react';

export interface SourceFilterState {
  mode: 'and' | 'or';
  selected: Set<string>;
  excludeMode: boolean;
}

interface SourceFilterProps {
  sources: Source[];
  categories: SourceCategory[];
  value: SourceFilterState;
  onChange: (state: SourceFilterState) => void;
}

const CATEGORY_ORDER = ['map', 'register', 'almanac', 'dataset', 'external'];

export function emptyFilterState(): SourceFilterState {
  return { mode: 'or', selected: new Set(), excludeMode: false };
}

export default function SourceFilter({
  sources,
  categories,
  value,
  onChange,
}: SourceFilterProps) {
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const byCategory = getSourcesByCategory(sources, categories);

  const sortedCats = [...categories].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.categoryId);
    const bi = CATEGORY_ORDER.indexOf(b.categoryId);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const toggleSource = (sourceId: string) => {
    const next = new Set(value.selected);
    if (next.has(sourceId)) {
      next.delete(sourceId);
    } else {
      next.add(sourceId);
    }
    onChange({ ...value, selected: next });
  };

  const toggleCategory = (catId: string) => {
    const catSources = byCategory.get(catId) || [];
    const catSourceIds = catSources.map((s) => s.sourceId);
    const allSelected = catSourceIds.every((id) => value.selected.has(id));
    const next = new Set(value.selected);
    if (allSelected) {
      for (const id of catSourceIds) next.delete(id);
    } else {
      for (const id of catSourceIds) next.add(id);
    }
    onChange({ ...value, selected: next });
  };

  const toggleMode = () => {
    onChange({
      ...value,
      mode: value.mode === 'or' ? 'and' : 'or',
    });
  };

  const toggleExclude = () => {
    onChange({ ...value, excludeMode: !value.excludeMode });
  };

  const clearAll = () => {
    onChange(emptyFilterState());
  };

  const hasSelection = value.selected.size > 0;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[10px] text-stm-warm-400 uppercase tracking-wide shrink-0">
        Sources:
      </span>

      {/* Category groups with expandable sources */}
      {sortedCats.map((cat) => {
        const catSources = byCategory.get(cat.id) || [];
        if (catSources.length === 0) return null;
        const isExpanded = expandedCat === cat.id;
        const selectedInCat = catSources.filter((s) =>
          value.selected.has(s.sourceId),
        );
        const allSelected = selectedInCat.length === catSources.length;
        const someSelected =
          selectedInCat.length > 0 && selectedInCat.length < catSources.length;

        return (
          <div key={cat.id} className="relative">
            <button
              onClick={() => setExpandedCat(isExpanded ? null : cat.id)}
              className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded border transition-colors ${
                selectedInCat.length > 0
                  ? value.excludeMode
                    ? 'bg-red-50 border-red-300 text-red-700 font-medium'
                    : 'bg-stm-teal-50 border-stm-teal-300 text-stm-teal-700 font-medium'
                  : 'bg-white border-stm-warm-200 text-stm-warm-500 hover:border-stm-warm-300'
              }`}
            >
              <span
                className={`w-2.5 h-2.5 rounded-sm flex items-center justify-center text-white text-[8px] font-bold ${
                  allSelected
                    ? value.excludeMode
                      ? 'bg-red-500'
                      : 'bg-stm-teal-600'
                    : someSelected
                      ? value.excludeMode
                        ? 'bg-red-300'
                        : 'bg-stm-teal-300'
                      : 'bg-stm-warm-100'
                }`}
              >
                {allSelected && (
                  <svg
                    className="w-2 h-2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={4}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
                {someSelected && !allSelected && (
                  <svg
                    className="w-2 h-2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={4}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 12h14"
                    />
                  </svg>
                )}
              </span>
              {cat.prefLabel}
              {selectedInCat.length > 0 && (
                <span className="text-[10px] opacity-60">
                  {selectedInCat.length}/{catSources.length}
                </span>
              )}
              <svg
                className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {/* Dropdown with individual sources */}
            {isExpanded && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-stm-warm-200 rounded-lg shadow-lg py-1 min-w-50 max-h-60 overflow-y-auto">
                {/* Select all in category */}
                <button
                  onClick={() => toggleCategory(cat.id)}
                  className="w-full text-left px-3 py-1.5 text-xs text-stm-warm-500 hover:bg-stm-warm-50 border-b border-stm-warm-100 font-medium"
                >
                  {allSelected ? 'Deselect all' : 'Select all'}{' '}
                  {cat.prefLabel.toLowerCase()}
                </button>

                {catSources.map((src) => {
                  const isSelected = value.selected.has(src.sourceId);
                  return (
                    <button
                      key={src.sourceId}
                      onClick={() => toggleSource(src.sourceId)}
                      className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-stm-warm-50 transition-colors ${
                        isSelected
                          ? 'text-stm-warm-800 font-medium'
                          : 'text-stm-warm-500'
                      }`}
                    >
                      <span
                        className={`w-3 h-3 rounded border flex items-center justify-center shrink-0 ${
                          isSelected
                            ? value.excludeMode
                              ? 'bg-red-500 border-red-500'
                              : 'bg-stm-teal-600 border-stm-teal-600'
                            : 'border-stm-warm-300'
                        }`}
                      >
                        {isSelected && (
                          <svg
                            className="w-2 h-2 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={4}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </span>
                      <span className="flex-1 truncate">{src.prefLabel}</span>
                      {src.mapYear && (
                        <span className="text-[10px] text-stm-warm-400 font-mono shrink-0">
                          {src.mapYear}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* AND/OR toggle */}
      {hasSelection && (
        <>
          <button
            onClick={toggleMode}
            title={
              value.mode === 'or'
                ? 'OR: places from ANY selected source'
                : 'AND: places from ALL selected sources'
            }
            className="px-1.5 py-0.5 text-[10px] font-bold rounded border border-stm-warm-200 text-stm-warm-500 hover:bg-stm-warm-100 transition-colors uppercase"
          >
            {value.mode}
          </button>

          {/* Include/Exclude toggle */}
          <button
            onClick={toggleExclude}
            title={
              value.excludeMode
                ? 'Excluding: showing places NOT in selected sources'
                : 'Including: showing places in selected sources'
            }
            className={`px-1.5 py-0.5 text-[10px] font-medium rounded border transition-colors ${
              value.excludeMode
                ? 'border-red-300 text-red-600 bg-red-50 hover:bg-red-100'
                : 'border-stm-warm-200 text-stm-warm-500 hover:bg-stm-warm-100'
            }`}
          >
            {value.excludeMode ? 'Exclude' : 'Include'}
          </button>

          {/* Clear */}
          <button
            onClick={clearAll}
            className="text-[10px] text-stm-warm-400 hover:text-stm-warm-600 underline"
          >
            Clear
          </button>
        </>
      )}
    </div>
  );
}
