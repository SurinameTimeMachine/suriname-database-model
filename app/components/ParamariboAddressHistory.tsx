'use client';

import { useMemo } from 'react';

export type EraDetail = {
  address: string | null;
  parcel?: Record<string, string>;
};

export type HistoricalAddress = {
  id: string;
  sourceRow: string | null;
  key1885: string | null;
  certainty: 'certain' | 'probable' | 'unresolved';
  eras: Record<string, EraDetail>;
  splitMarker?: string | null;
  newMarker?: string | null;
  project?: { code?: string | null; number?: string | null; suffix?: string | null } | null;
  note?: string | null;
};

const ERA_ORDER = [
  'wijk1782',
  'ow1817',
  'nw1837',
  'nw1885',
  'volkstelling1921',
  'modern2022',
] as const;

const ERA_LABELS: Record<string, string> = {
  wijk1782: '1782',
  ow1817: '1817 (Oude Wijk)',
  nw1837: '1837 (Nieuwe Wijk)',
  nw1885: '1885 (Nieuwe Wijk)',
  volkstelling1921: '1921',
  modern2022: '2022',
};

const PARCEL_LABELS: Record<string, string> = {
  code: 'wijkcode',
  districtNumber: 'wijknr.',
  districtCode: 'district',
  outerDistrict: 'buitendistrict',
  buurtLetter: 'buurt',
  buurtNumber: 'buurtnr.',
  parcelLetter: 'perceel',
  parcelNumber: 'perceelnr.',
  parcelPlus: 'perceel+',
  parcelSuffix: 'toevoeging',
  zone: 'zone',
  side: 'zijde',
};

function certaintyClass(certainty: HistoricalAddress['certainty']) {
  if (certainty === 'certain') return 'bg-green-100 text-green-800';
  if (certainty === 'probable') return 'bg-orange-100 text-orange-800';
  return 'bg-red-100 text-red-800';
}

export default function ParamariboAddressHistory({
  historicalAddresses,
}: {
  historicalAddresses: HistoricalAddress[];
}) {
  const rows = useMemo(() => {
    const unique = new Map<string, HistoricalAddress>();
    for (const address of historicalAddresses) {
      const key = JSON.stringify([
        address.eras,
        address.splitMarker ?? null,
        address.newMarker ?? null,
        address.project ?? null,
      ]);
      if (!unique.has(key)) unique.set(key, address);
    }
    return [...unique.values()];
  }, [historicalAddresses]);

  if (rows.length === 0) return null;

  return (
    <section className="mt-10 border-t border-ink/10 pt-6">
      <h2 className="text-xl font-semibold">Paramaribo address history</h2>
      <p className="mt-2 text-sm text-ink/65">
        Historical address designations for this location point, linked through
        the Concordans ({rows.length}{' '}
        {rows.length === 1 ? 'entry' : 'entries'}). Expand an entry to see the
        chronological address and regime parcel components.
      </p>
      <div className="mt-3 space-y-2">
        {rows.map((address) => {
          const eras = ERA_ORDER.filter((era) => address.eras[era]);
          return (
            <details
              key={address.id}
              className="border border-ink/10 bg-white/70 p-3"
            >
              <summary className="cursor-pointer text-sm font-semibold">
                <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span>{address.key1885 ?? '1885 location point'}</span>
                  <span
                    className={`px-1.5 py-0.5 text-[10px] font-semibold uppercase ${certaintyClass(address.certainty)}`}
                  >
                    {address.certainty}
                  </span>
                  {address.sourceRow && (
                    <span className="font-mono text-xs text-ink/45">
                      concordans rij {address.sourceRow}
                    </span>
                  )}
                  {address.splitMarker && (
                    <span className="bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                      gesplitst in: {address.splitMarker}
                    </span>
                  )}
                  {address.newMarker && (
                    <span className="bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-sky-800">
                      nieuw in: {address.newMarker}
                    </span>
                  )}
                </span>
              </summary>
              {address.certainty === 'unresolved' && eras.length === 0 ? (
                <p className="mt-2 text-sm text-ink/65">
                  {address.note ??
                    'No Concordans Paramaribo row matched this 1885 location point.'}
                </p>
              ) : (
                <dl className="mt-3 space-y-3 text-sm">
                  {eras.map((era) => {
                    const detail = address.eras[era];
                    return (
                      <div
                        key={era}
                        className="border-l-2 border-ink/15 pl-3"
                      >
                        <dt className="text-xs font-semibold uppercase tracking-wide text-ink/55">
                          {ERA_LABELS[era] ?? era}
                        </dt>
                        <dd className="mt-0.5">
                          {detail.address || (
                            <span className="text-ink/45">Not recorded</span>
                          )}
                        </dd>
                        {detail.parcel && (
                          <dd className="mt-1 flex flex-wrap gap-1.5">
                            {Object.entries(detail.parcel).map(
                              ([component, value]) => (
                                <span
                                  key={component}
                                  className="border border-ink/15 px-1.5 py-0.5 text-[11px] text-ink/70"
                                >
                                  {PARCEL_LABELS[component] ?? component}:{' '}
                                  <span className="font-mono">{value}</span>
                                </span>
                              ),
                            )}
                          </dd>
                        )}
                      </div>
                    );
                  })}
                  {address.project &&
                    (address.project.code ||
                      address.project.number ||
                      address.project.suffix) && (
                      <div className="border-l-2 border-ink/15 pl-3">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-ink/55">
                          Taakproject / project
                        </dt>
                        <dd className="mt-0.5 font-mono text-[13px]">
                          {[address.project.code, address.project.number, address.project.suffix]
                            .filter(Boolean)
                            .join(' ')}
                        </dd>
                      </div>
                    )}
                </dl>
              )}
            </details>
          );
        })}
      </div>
      <p className="mt-5 text-xs leading-relaxed text-ink/50">
        For historical addresses in Paramaribo we are grateful for the Concordans by Dr. Muntjewerff, see{' '}
        <a
          href="https://www.concordansparamaribo.info/"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          concordansparamaribo.info
        </a>
        . This is a pilot version and can contain mistakes that are not attributable to Dr. Muntjewerff.
      </p>
    </section>
  );
}
