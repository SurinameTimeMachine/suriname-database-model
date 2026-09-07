'use client';

import { useMemo, useState } from 'react';

interface LinkedPersonObservation {
  id: string;
  nameEnslaved?: string;
  sex?: string;
  age?: string;
  plantationText?: string;
  ownerName?: string;
  startDay?: string;
  startMonth?: string;
  startYear?: string;
  startEvent?: string;
  startInfo?: string;
  endDay?: string;
  endMonth?: string;
  endYear?: string;
  endEvent?: string;
  endEventDetailed?: string;
  endInfo?: string;
  registerType?: string;
}

interface LinkedPerson {
  id: string;
  label: string;
  sex?: string;
  dayBirth?: string;
  monthBirth?: string;
  yearBirth?: string;
  dayDeath?: string;
  monthDeath?: string;
  yearDeath?: string;
  nameMother?: string;
  observations: LinkedPersonObservation[];
}

function formatDate(day?: string, month?: string, year?: string): string {
  return [day, month, year].filter(Boolean).join('-') || '';
}

function birthDisplay(person: LinkedPerson, referenceYear?: string): string {
  const date = formatDate(person.dayBirth, person.monthBirth, person.yearBirth);
  if (date) return date;
  const age = person.observations.find((o) => o.age)?.age;
  if (age && referenceYear) return `age ${age} (in ${referenceYear})`;
  if (age) return `age ${age}`;
  return '';
}

function deathDisplay(person: LinkedPerson): string {
  return formatDate(person.dayDeath, person.monthDeath, person.yearDeath);
}

function PersonRow({ person }: { person: LinkedPerson }) {
  const [open, setOpen] = useState(false);
  const firstObservationYear =
    person.observations.find((o) => o.startYear)?.startYear ??
    person.observations.find((o) => o.endYear)?.endYear;
  const birth = birthDisplay(person, firstObservationYear);
  const death = deathDisplay(person);

  return (
    <li className="border-l-2 border-teal-strong pl-3 py-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-baseline gap-x-2 gap-y-0.5 text-left text-sm"
        aria-expanded={open}
      >
        <span className="font-semibold">{person.label}</span>
        {person.sex && <span className="text-ink/55">({person.sex})</span>}
        {birth && <span className="text-ink/65">b. {birth}</span>}
        {death && <span className="text-ink/65">d. {death}</span>}
        {person.nameMother && (
          <span className="text-ink/65">mother: {person.nameMother}</span>
        )}
        <span className="ml-auto text-xs text-teal-strong">
          {open
            ? 'Hide observations'
            : `Show observations (${person.observations.length})`}
        </span>
      </button>
      {open && (
        <ol className="mt-2 space-y-2 border-t border-ink/10 pt-2 text-xs text-ink/75">
          {person.observations.map((observation) => (
            <li key={observation.id} className="border-l border-ink/20 pl-2">
              <div>
                <span className="font-semibold">
                  {formatDate(
                    observation.startDay,
                    observation.startMonth,
                    observation.startYear,
                  ) || 'undated'}
                </span>
                {observation.startEvent && ` · ${observation.startEvent}`}
                {observation.startInfo && (
                  <p className="mt-0.5 text-ink/60">{observation.startInfo}</p>
                )}
              </div>
              <div className="mt-1">
                <span className="font-semibold">
                  {formatDate(
                    observation.endDay,
                    observation.endMonth,
                    observation.endYear,
                  ) || 'undated'}
                </span>
                {observation.endEventDetailed
                  ? ` · ${observation.endEventDetailed}`
                  : observation.endEvent
                    ? ` · ${observation.endEvent}`
                    : ''}
                {observation.endInfo && (
                  <p className="mt-0.5 text-ink/60">{observation.endInfo}</p>
                )}
              </div>
              {observation.registerType && (
                <p className="mt-0.5 text-ink/45">{observation.registerType}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

export default function LinkedPersonsSection({
  persons,
}: {
  persons: LinkedPerson[];
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return persons;
    return persons.filter((person) =>
      [person.label, person.nameMother]
        .filter(Boolean)
        .some((text) => text!.toLowerCase().includes(q)),
    );
  }, [persons, query]);

  return (
    <section className="mt-10 border-t border-ink/10 pt-6">
      <h2 className="text-xl font-semibold">Enslaved persons</h2>
      <p className="mt-2 text-sm text-ink/65">
        Persons linked to this plantation via the Suriname Slave and
        Emancipation Registers (1830-1863), matched by PSUR identifier.
        {' '}
        {persons.length} {persons.length === 1 ? 'person' : 'persons'} found.
      </p>
      {persons.length > 5 && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or mother's name"
          className="mt-3 w-full max-w-sm border border-ink/20 px-3 py-2 text-sm"
        />
      )}
      <ul className="mt-4 max-h-[32rem] space-y-2 overflow-y-auto pr-1">
        {filtered.map((person) => (
          <PersonRow key={person.id} person={person} />
        ))}
        {filtered.length === 0 && (
          <p className="text-sm text-ink/55">No matches.</p>
        )}
      </ul>
    </section>
  );
}
