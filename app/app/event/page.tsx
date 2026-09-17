'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LOCATION_TYPES, type AddedPlace, type LocationType } from '@/lib/event-types';

type EventTask = {
  taskId: string;
  detailId: string;
  mediaId: string;
  title: string;
  description: string;
  yearRaw: string;
  inventoryNumber: string;
  sourceUrl: string;
  lowResUrl: string;
  currentClaim: { claimId: string } | null;
};

const NAS_MEDIABANK_BASE_URL = 'https://nationaalarchief.sr/onderzoeken/mediabank/detail';

// Domain may change; update here only.
const STM_EXPLORE_URL = 'https://data.surinametijdmachine.org/explore';

function nasMediabankUrl(current: EventTask): string {
  if (!current.detailId || !current.mediaId) return '';
  return `${NAS_MEDIABANK_BASE_URL}/${current.detailId}/media/${current.mediaId}?mode=detail`;
}

type Stats = {
  total: number;
  completed: number;
  assigned: number;
  unoffered: number;
  pendingRound2: number;
  participants: number;
  round: 1 | 2;
};

const STORAGE_KEY = 'stm_annotate_participant_v1';

export default function EventPage() {
  const [nickname, setNickname] = useState('');
  const [participantId, setParticipantId] = useState('');
  const [status, setStatus] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [task, setTask] = useState<EventTask | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [done, setDone] = useState(false);
  const [addedPlaces, setAddedPlaces] = useState<AddedPlace[]>([]);
  const [addedDates, setAddedDates] = useState<string[]>([]);
  const [addedPersons, setAddedPersons] = useState<string[]>([]);
  const [locationUnknown, setLocationUnknown] = useState(true);
  const [notes, setNotes] = useState('');
  const [placeInput, setPlaceInput] = useState('');
  const [dateInput, setDateInput] = useState('');
  const [personInput, setPersonInput] = useState('');
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [descriptionTruncated, setDescriptionTruncated] = useState(false);
  const descriptionRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    localStorage.removeItem('stm_event_participant');
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as { participantId: string; nickname: string };
      setParticipantId(parsed.participantId);
      setNickname(parsed.nickname);
      setStatus(`Welkom terug, ${parsed.nickname}.`);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  function resetFormForTask(nextTask: EventTask | null) {
    setAddedPlaces([]);
    setAddedDates([]);
    setAddedPersons([]);
    setLocationUnknown(true);
    setDateInput(nextTask?.yearRaw || '');
    setPlaceInput('');
    setPersonInput('');
    setNotes('');
    setDescriptionExpanded(false);
  }

  // Measure against the clamped (collapsed) layout so the toggle only appears when needed.
  useLayoutEffect(() => {
    const el = descriptionRef.current;
    if (!el || descriptionExpanded) return;
    setDescriptionTruncated(el.scrollHeight > el.clientHeight + 1);
  }, [task?.taskId, task?.description, descriptionExpanded]);

  async function startSession() {
    if (!nickname.trim()) {
      setStatus('Vul eerst een nickname in.');
      return;
    }

    setBusy(true);
    setStatus('Sessie starten...');
    try {
      const res = await fetch('/api/event/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nickname.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Kon sessie niet starten.');

      setParticipantId(data.participantId);
      setStats(data.stats || null);
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ participantId: data.participantId, nickname: data.nickname }),
      );
      setStatus(`Sessie actief als ${data.nickname}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Onbekende fout bij starten.');
    } finally {
      setBusy(false);
    }
  }

  async function claimNextTask() {
    if (!participantId) {
      setStatus('Start eerst een sessie met nickname.');
      return;
    }

    setBusy(true);
    setStatus('Taak ophalen...');
    try {
      const res = await fetch('/api/event/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Kon taak niet ophalen.');

      setStats(data.stats || null);
      if (data.done || !data.task) {
        setDone(true);
        setTask(null);
        resetFormForTask(null);
        setStatus('Geen taak beschikbaar. Alles aangeboden of afgerond.');
        return;
      }

      setDone(false);
      setTask(data.task);
      resetFormForTask(data.task);
      setStatus('');
    } catch (error) {
      if (error instanceof Error && error.message.toLowerCase().includes('unknown participant')) {
        localStorage.removeItem(STORAGE_KEY);
        setParticipantId('');
        setTask(null);
        setStatus('Deze sessie is verlopen. Kies opnieuw een nickname.');
      } else {
        setStatus(error instanceof Error ? error.message : 'Onbekende fout bij claim.');
      }
    } finally {
      setBusy(false);
    }
  }

  function resetSession() {
    localStorage.removeItem(STORAGE_KEY);
    setParticipantId('');
    setTask(null);
    setDone(false);
    setStats(null);
    resetFormForTask(null);
    setStatus('Kies een nickname om te beginnen.');
  }

  function addDateTerm() {
    const term = dateInput.trim();
    if (!term) return;
    if (addedDates.includes(term)) {
      setDateInput('');
      return;
    }
    setAddedDates((prev) => [...prev, term]);
    setDateInput('');
  }

  function addPlaceTerm() {
    const term = placeInput.trim();
    if (!term) return;
    setAddedPlaces((prev) => (prev.some((place) => place.text === term) ? prev : [...prev, { text: term, type: '' }]));
    setLocationUnknown(false);
    setPlaceInput('');
  }

  function setPlaceType(text: string, type: LocationType) {
    setAddedPlaces((prev) => prev.map((place) => (place.text === text ? { ...place, type } : place)));
  }

  function addPersonTerm() {
    const term = personInput.trim();
    if (!term) return;
    if (!addedPersons.includes(term)) {
      setAddedPersons((prev) => [...prev, term]);
    }
    setPersonInput('');
  }

  async function submitCurrentTask(decision: 'confirm' | 'skip') {
    if (!task || !task.currentClaim) {
      setStatus('Geen actieve taak om in te dienen.');
      return;
    }

    setBusy(true);
    setStatus('Taak indienen...');
    try {
      const payload = {
        decision,
        locationUnknown,
        addedPlaces,
        addedDates,
        addedPersons,
        notes: notes.trim(),
      };

      const res = await fetch('/api/event/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId,
          taskId: task.taskId,
          claimId: task.currentClaim.claimId,
          payload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Kon taak niet indienen.');

      setStats(data.stats || null);
      if (data.completed === false && data.reason === 'missing_location') {
        setStatus('Locatie ontbreekt. De taak blijft open en komt later opnieuw langs.');
      } else {
        setStatus('Taak opgeslagen. Volgende taak laden...');
      }
      setTask(null);
      resetFormForTask(null);
      await claimNextTask();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Onbekende fout bij submit.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="h-full min-h-0 overflow-hidden bg-stm-warm-50 text-stm-warm-900">
      <div className="mx-auto flex h-full w-full max-w-xl flex-col">
        {!task ? (
          <header className="shrink-0 border-b border-stm-warm-200 bg-white px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">NAS foto-review</p>
              <div className="flex items-center gap-3">
                {stats ? <p className="text-xs text-stm-warm-500">{stats.completed}/{stats.total} afgerond</p> : null}
                <a href={STM_EXPLORE_URL} target="_blank" rel="noopener noreferrer" className="text-xs text-stm-sepia-700 underline">STM-kaart</a>
                {participantId ? <button type="button" onClick={resetSession} className="text-xs text-stm-warm-500 underline">Andere gebruiker</button> : null}
              </div>
            </div>
          </header>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col">
          {!participantId ? (
            <section className="m-3 border border-stm-warm-200 bg-white p-4">
              <p className="mb-3 text-sm text-stm-warm-700">Kies een nickname om te beginnen.</p>
              <div className="flex gap-2">
                <input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Bijv. Team-12"
                  className="min-w-0 flex-1 border border-stm-warm-300 px-3 py-2 text-sm"
                />
                <button onClick={startSession} disabled={busy} className="bg-stm-sepia-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  Start
                </button>
              </div>
            </section>
          ) : null}

          {participantId && !task && !done ? (
            <section className="m-3 border border-stm-warm-200 bg-white p-3">
              <button onClick={claimNextTask} disabled={busy} className="w-full bg-stm-warm-900 py-3 text-sm font-semibold text-white disabled:opacity-50">
                Volgende foto
              </button>
            </section>
          ) : null}

          {done ? <p className="m-3 border border-stm-warm-200 bg-white p-4 text-sm text-stm-warm-700">Geen foto&apos;s meer beschikbaar.</p> : null}

          {task ? (
            <section className="flex min-h-0 flex-1 flex-col bg-white">
              <div className="min-h-0 flex-1 overflow-y-auto">
                {task.lowResUrl ? (
                  <div className="flex min-h-[38vh] items-center justify-center bg-stm-warm-900">
                    <img src={task.lowResUrl} alt={task.title || 'Foto'} className="max-h-[52vh] w-full object-contain" />
                  </div>
                ) : <div className="flex min-h-[30vh] items-center justify-center bg-stm-warm-100 text-sm text-stm-warm-500">Geen preview beschikbaar</div>}

                <div className="space-y-3 p-3">
                  <div>
                    <h1 className="text-base font-semibold leading-tight">{task.title || '(zonder titel)'}</h1>
                    <p
                      ref={descriptionRef}
                      className={`mt-1 text-sm leading-snug text-stm-warm-700 ${descriptionExpanded ? '' : 'line-clamp-5'}`}
                    >
                      {task.description || '(geen beschrijving)'}
                    </p>
                    {descriptionTruncated || descriptionExpanded ? (
                      <button
                        type="button"
                        onClick={() => setDescriptionExpanded((expanded) => !expanded)}
                        className="min-h-11 text-sm font-semibold text-stm-sepia-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stm-sepia-700"
                      >
                        {descriptionExpanded ? 'Minder' : 'Meer'}
                      </button>
                    ) : null}
                    <p className="mt-1 text-xs text-stm-warm-500">{task.yearRaw || 'Datum onbekend'} · {task.inventoryNumber || 'Inventaris onbekend'}</p>
                  </div>
                  {nasMediabankUrl(task) ? (
                    <a
                      href={nasMediabankUrl(task)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block min-h-11 border-t border-stm-warm-200 pt-3 text-sm font-semibold text-stm-sepia-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stm-sepia-700"
                    >
                      Volledige metadata op de NAS-website (opent nieuw tabblad)
                    </a>
                  ) : null}

                  <div className="border-t border-stm-warm-200 pt-3">
                    <label className="mb-1 block text-sm font-semibold text-stm-warm-700">Datum</label>
                    <p className="min-h-11 flex items-center border border-stm-warm-300 bg-stm-warm-100 px-3 py-2 text-base text-stm-warm-600">
                      {task.yearRaw.trim() || 'Onbekend'}
                    </p>
                  </div>

                  <details className="border-t border-stm-warm-200 pt-3">
                    <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-stm-warm-700">Datum toevoegen</summary>
                    <div className="mt-2 flex gap-2">
                      <input id="event-date" aria-label="Datum" value={dateInput} onChange={(e) => setDateInput(e.target.value)} placeholder="Bijv. 15 juli 1975" className="min-h-11 min-w-0 flex-1 border border-stm-warm-300 px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stm-sepia-700" />
                      <button onClick={addDateTerm} className="min-h-11 bg-stm-warm-200 px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stm-sepia-700">Toevoegen</button>
                    </div>
                    {addedDates.length > 0 ? <p className="mt-1 text-xs text-stm-warm-600">{addedDates.join(' · ')}</p> : null}
                  </details>

                  <details className="border-t border-stm-warm-200 pt-3">
                    <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-stm-warm-700">Locatie toevoegen</summary>
                    <a href={STM_EXPLORE_URL} target="_blank" rel="noopener noreferrer" className="mt-2 block text-xs font-semibold text-stm-sepia-700 underline">Open STM-kaart (nieuw tabblad)</a>
                    <div className="mt-2 flex gap-2">
                      <input aria-label="Locatie" value={placeInput} onChange={(e) => setPlaceInput(e.target.value)} placeholder="Bijv. Paramaribo" className="min-h-11 min-w-0 flex-1 border border-stm-warm-300 px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stm-sepia-700" />
                      <button onClick={addPlaceTerm} className="min-h-11 bg-stm-warm-200 px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stm-sepia-700">Toevoegen</button>
                    </div>
                    {addedPlaces.map((place) => (
                      <div key={place.text} className="mt-2 border-t border-stm-warm-100 pt-2 first:border-t-0 first:pt-0">
                        {place.type ? (
                          <p className="text-xs text-stm-warm-600">{place.text} <span className="text-stm-warm-500">({place.type})</span></p>
                        ) : (
                          <div>
                            <p className="text-xs font-semibold text-stm-warm-700">{place.text} — kies type:</p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {LOCATION_TYPES.map((locationType) => (
                                <button
                                  key={locationType}
                                  type="button"
                                  onClick={() => setPlaceType(place.text, locationType)}
                                  className="min-h-8 border border-stm-warm-300 px-2 py-1 text-xs font-semibold text-stm-warm-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stm-sepia-700"
                                >
                                  {locationType}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </details>

                  <details className="border-t border-stm-warm-200 pt-3">
                    <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-stm-warm-700">Persoon toevoegen</summary>
                    <div className="mt-2 flex gap-2">
                      <input aria-label="Persoon" value={personInput} onChange={(e) => setPersonInput(e.target.value)} placeholder="Typ naam" className="min-h-11 min-w-0 flex-1 border border-stm-warm-300 px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stm-sepia-700" />
                      <button onClick={addPersonTerm} className="min-h-11 bg-stm-warm-200 px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stm-sepia-700">Toevoegen</button>
                    </div>
                    {addedPersons.length > 0 ? <p className="mt-1 text-xs text-stm-warm-600">{addedPersons.join(' · ')}</p> : null}
                  </details>

                  <details className="border-t border-stm-warm-200 pt-3">
                    <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-stm-warm-700">Notitie toevoegen</summary>
                    <textarea aria-label="Notitie" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-2 w-full border border-stm-warm-300 px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stm-sepia-700" placeholder="Optioneel" />
                  </details>
                </div>
              </div>

              <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-stm-warm-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <button onClick={() => submitCurrentTask('skip')} disabled={busy} className="min-h-12 border border-stm-warm-300 py-3 text-base font-semibold text-stm-warm-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stm-sepia-700 disabled:opacity-50">Overslaan</button>
                <button onClick={() => submitCurrentTask('confirm')} disabled={busy} className="min-h-12 bg-stm-sepia-700 py-3 text-base font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stm-sepia-700 disabled:opacity-50">Bevestigen</button>
              </div>
            </section>
          ) : null}
        </div>

        {status ? <p className="shrink-0 border-t border-stm-warm-200 bg-white px-3 py-2 text-xs text-stm-warm-700">{status}</p> : null}
      </div>
    </main>
  );
}
