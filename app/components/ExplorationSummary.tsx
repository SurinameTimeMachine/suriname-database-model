'use client';

import { getPhysicalFeatures } from '@/lib/data';
import type { RankedPersonHit } from '@/lib/person-search';
import { usePlaceTypes } from '@/lib/thesaurus';
import type { GeoJSONFeature } from '@/lib/types';
import { useEffect, useId, useState } from 'react';

interface ExplorationSummaryProps {
  feature: GeoJSONFeature | null;
  person: RankedPersonHit | null;
  features: GeoJSONFeature[];
  onSelectPlace: (feature: GeoJSONFeature) => void;
  onClose: () => void;
}

export default function ExplorationSummary({
  feature,
  person,
  features,
  onSelectPlace,
  onClose,
}: ExplorationSummaryProps) {
  const titleId = useId();
  const { labels } = usePlaceTypes();
  const [description, setDescription] = useState<string>();
  const place = feature?.properties;
  const physicalFeatureUri = place?.featureUri ?? place?.placeUri;

  useEffect(() => {
    if (!physicalFeatureUri) return;
    let active = true;
    getPhysicalFeatures()
      .then((records) => {
        if (active) setDescription(records[physicalFeatureUri]?.description);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [physicalFeatureUri]);

  const title = place?.name ?? person?.display;
  const type = place?.featureType;
  const otherNames = Array.from(new Set(place?.allNames ?? [])).filter(
    (name) => name.trim() && name.toLowerCase() !== title?.toLowerCase(),
  );
  const firstYear = person?.years[0];
  const lastYear = person?.years.at(-1);
  const placeIds = new Set(person?.placeIds);
  const relatedPlaces = person
    ? Array.from(new Map(
        features
          .filter(({ properties }) => properties.stmId && placeIds.has(properties.stmId))
          .map((related) => [related.properties.stmId, related]),
      ).values()).sort((a, b) => a.properties.name.localeCompare(b.properties.name))
    : [];

  return (
    <aside
      aria-labelledby={titleId}
      className="site-panel absolute inset-x-3 bottom-7 z-1001 max-h-[min(12rem,40%)] overflow-y-auto rounded-xl p-4 shadow-lg md:inset-x-auto md:top-5 md:right-5 md:bottom-auto md:max-h-[calc(100%-2.5rem)] md:w-[min(22rem,40%)] md:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div aria-live="polite">
          <p className="text-sm text-ink/70">{type ? (labels[type] ?? type.replaceAll('-', ' ')) : person ? 'Person search result' : 'Place'}</p>
          <h2 id={titleId} className="mt-0.5 text-xl font-semibold tracking-tight text-ink">{title}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close summary"
          className="-mt-1 -mr-1 shrink-0 rounded-md p-2 text-ink/75 hover:bg-ink/10 focus-visible:outline-2"
        >
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {place && (
        <div className="mt-3 space-y-2 text-sm leading-relaxed text-ink/85">
          {description && <p>{description}</p>}
          {place.mainBodyWater && <p><strong>Connected waterway</strong> · {place.mainBodyWater}</p>}
          {place.mapYear && <p><strong>Map year</strong> · {place.mapYear}</p>}
          {otherNames.length > 0 && <p><strong>Also recorded as</strong> · {otherNames.join(', ')}</p>}
        </div>
      )}

      {person && (
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink/85">
          <p>
            {firstYear
              ? `This name appears in records dated ${firstYear === lastYear ? firstYear : `${firstYear}–${lastYear}`}.`
              : 'This name appears in historical records.'}
            {' '}Records with the same name may refer to different people.
          </p>
          {relatedPlaces.length > 0 && (
            <div>
              <h3 className="font-semibold">Places linked to these records</h3>
              <ul className="mt-1">
                {relatedPlaces.map((related) => (
                  <li key={`related-${related.id}`} className="border-t border-ink/10">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-1 py-2 text-left text-teal-strong hover:bg-teal-soft/25 focus-visible:outline-2"
                      onClick={() => onSelectPlace(related)}
                    >
                      {related.properties.name}
                      <span aria-hidden="true">→</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
