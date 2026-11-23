'use client';

import styles from './RecordedYearsFilter.module.css';

export type YearRange = readonly [number, number];

interface RecordedYearsFilterProps {
  bounds: YearRange;
  range: YearRange | null;
  onChange: (range: YearRange | null) => void;
}

export default function RecordedYearsFilter({ bounds, range, onChange }: RecordedYearsFilterProps) {
  const [min, max] = bounds;
  const [from, to] = range ?? bounds;
  const span = max - min || 1;
  const start = ((from - min) / span) * 100;
  const end = ((to - min) / span) * 100;

  function change(nextFrom: number, nextTo: number) {
    onChange(nextFrom === min && nextTo === max ? null : [nextFrom, nextTo]);
  }

  return (
    <fieldset className="mt-3 min-w-0 border-t border-ink/10 pt-2">
      <legend className="sr-only">Recorded between</legend>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-medium text-ink">Recorded between</span>
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={!range}
          className="text-teal-strong underline underline-offset-2 disabled:text-ink/60 disabled:no-underline"
        >
          {range ? 'Reset' : 'All years'}
        </button>
      </div>
      <div className={styles.control}>
        <div aria-hidden="true" className={styles.track}>
          <div className={styles.selection} style={{ left: `${start}%`, right: `${100 - end}%` }} />
        </div>
        <input
          aria-label="From year"
          className={styles.thumb}
          style={{ zIndex: from === max ? 2 : 0 }}
          type="range"
          min={min}
          max={max}
          value={from}
          onChange={(event) => change(Math.min(event.target.valueAsNumber, to), to)}
        />
        <input
          aria-label="To year"
          className={styles.thumb}
          style={{ zIndex: 1 }}
          type="range"
          min={min}
          max={max}
          value={to}
          onChange={(event) => change(from, Math.max(event.target.valueAsNumber, from))}
        />
      </div>
      <div className="flex justify-between text-xs text-ink/75 tabular-nums">
        <span>{from}</span>
        <span>{to}</span>
      </div>
    </fieldset>
  );
}
