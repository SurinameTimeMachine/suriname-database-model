'use client';

import { useEffect, useState } from 'react';

type EventTask = {
  taskId: string;
  mode: 'image';
  recordKey: string;
  detailId: string;
  mediaId: string;
  mediaType: string;
  title: string;
  description: string;
  yearRaw: string;
  inventoryNumber: string;
  documentType: string;
  sourceUrl: string;
  lowResUrl: string;
  suggestedPersons: string[];
  currentClaim: {
    claimId: string;
    participantId: string;
    assignedAt: string;
    leaseUntil: string;
    round: 1 | 2;
  } | null;
};

type Stats = {
  total: number;
  completed: number;
  assigned: number;
  unoffered: number;
  unresolved: number;
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
  const [addedPlaces, setAddedPlaces] = useState<string[]>([]);
  const [addedDates, setAddedDates] = useState<string[]>([]);
  const [selectedPersons, setSelectedPersons] = useState<string[]>([]);
  const [addedPersons, setAddedPersons] = useState<string[]>([]);
  const [locationUnknown, setLocationUnknown] = useState(true);
  const [notes, setNotes] = useState('');
  const [placeInput, setPlaceInput] = useState('');
  const [dateInput, setDateInput] = useState('');
  const [personInput, setPersonInput] = useState('');
  const [metadataExpanded, setMetadataExpanded] = useState(false);

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
    if (!nextTask) {
      setSelectedPersons([]);
      setAddedPlaces([]);
      setAddedDates([]);
      setAddedPersons([]);
      setLocationUnknown(true);
      setDateInput('');
      setPlaceInput('');
      setPersonInput('');
      setNotes('');
      setMetadataExpanded(false);
      return;
    }

    setSelectedPersons([...new Set(nextTask.suggestedPersons)]);
    setAddedPlaces([]);
    setAddedDates([]);
    setAddedPersons([]);
    setLocationUnknown(true);
    setDateInput(nextTask.yearRaw || '');
    setPlaceInput('');
    setPersonInput('');
    setNotes('');
    setMetadataExpanded(false);
  }

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

  function togglePersonSuggestion(name: string) {
    const selected = selectedPersons.includes(name);
    setSelectedPersons((prev) =>
      selected ? prev.filter((value) => value !== name) : [...prev, name],
    );
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
    if (!addedPlaces.includes(term)) setAddedPlaces((prev) => [...prev, term]);
    setLocationUnknown(false);
    setPlaceInput('');
  }

  function addPersonTerm() {
    const term = personInput.trim();
    if (!term) return;
    if (!selectedPersons.includes(term) && !addedPersons.includes(term)) {
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
        selectedPlaceIds: [],
        selectedPlaceNames: [],
        addedPlaces,
        addedDates,
        selectedPersons,
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
                  <div className={metadataExpanded ? '' : 'line-clamp-3'}>
                    <h1 className="text-base font-semibold leading-tight">{task.title || '(zonder titel)'}</h1>
                    <p className="mt-1 text-sm leading-snug text-stm-warm-700">{task.description || '(geen beschrijving)'}</p>
                    <p className="mt-1 text-xs text-stm-warm-500">{task.yearRaw || 'Datum onbekend'} · {task.inventoryNumber || 'Inventaris onbekend'}</p>
                  </div>
                  <button type="button" onClick={() => setMetadataExpanded((expanded) => !expanded)} className="text-xs font-semibold text-stm-sepia-700 underline">
                    {metadataExpanded ? 'Minder metadata' : 'Meer metadata'}
                  </button>
                  {metadataExpanded && task.sourceUrl ? (
                    <a href={task.sourceUrl} target="_blank" rel="noopener noreferrer" className="block border-t border-stm-warm-200 pt-3 text-xs font-semibold text-stm-sepia-700 underline">
                      Bekijk in de NAS-collectie
                    </a>
                  ) : null}

                  <div className="border-t border-stm-warm-200 pt-3">
                    <label htmlFor="event-date" className="mb-1 block text-xs font-semibold text-stm-warm-700">Datum</label>
                    <div className="flex gap-2">
                      <input id="event-date" value={dateInput} onChange={(e) => setDateInput(e.target.value)} readOnly={Boolean(task.yearRaw.trim())} placeholder="Bijv. 15 juli 1975" className="min-w-0 flex-1 border border-stm-warm-300 px-3 py-2 text-sm read-only:bg-stm-warm-100 read-only:text-stm-warm-600" />
                      {!task.yearRaw.trim() ? <button onClick={addDateTerm} className="bg-stm-warm-200 px-3 py-2 text-xs font-semibold">Toevoegen</button> : null}
                    </div>
                    {addedDates.length > 0 ? <p className="mt-1 text-xs text-stm-warm-600">{addedDates.join(' · ')}</p> : null}
                  </div>

                  <details className="border-t border-stm-warm-200 pt-3">
                    <summary className="cursor-pointer text-xs font-semibold text-stm-warm-700">Locatie toevoegen</summary>
                    <div className="mt-2 flex gap-2">
                      <input value={placeInput} onChange={(e) => setPlaceInput(e.target.value)} placeholder="Bijv. Paramaribo" className="min-w-0 flex-1 border border-stm-warm-300 px-3 py-2 text-sm" />
                      <button onClick={addPlaceTerm} className="bg-stm-warm-200 px-3 py-2 text-xs font-semibold">Toevoegen</button>
                    </div>
                    {addedPlaces.length > 0 ? <p className="mt-1 text-xs text-stm-warm-600">{addedPlaces.join(' · ')}</p> : null}
                  </details>

                  {task.suggestedPersons.length > 0 ? (
                    <details className="border-t border-stm-warm-200 pt-3">
                      <summary className="cursor-pointer text-xs font-semibold text-stm-warm-700">Personen ({task.suggestedPersons.length})</summary>
                      <div className="mt-2 space-y-1">
                        {task.suggestedPersons.map((name) => <label key={`person-${name}`} className="flex gap-2 text-sm"><input type="checkbox" checked={selectedPersons.includes(name)} onChange={() => togglePersonSuggestion(name)} /><span>{name}</span></label>)}
                      </div>
                    </details>
                  ) : null}

                  <details className="border-t border-stm-warm-200 pt-3">
                    <summary className="cursor-pointer text-xs font-semibold text-stm-warm-700">Persoon toevoegen</summary>
                    <div className="mt-2 flex gap-2">
                      <input value={personInput} onChange={(e) => setPersonInput(e.target.value)} placeholder="Typ naam" className="min-w-0 flex-1 border border-stm-warm-300 px-3 py-2 text-sm" />
                      <button onClick={addPersonTerm} className="bg-stm-warm-200 px-3 py-2 text-xs font-semibold">Toevoegen</button>
                    </div>
                    {addedPersons.length > 0 ? <p className="mt-1 text-xs text-stm-warm-600">{addedPersons.join(' · ')}</p> : null}
                  </details>

                  <details className="border-t border-stm-warm-200 pt-3">
                    <summary className="cursor-pointer text-xs font-semibold text-stm-warm-700">Notitie toevoegen</summary>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-2 w-full border border-stm-warm-300 px-3 py-2 text-sm" placeholder="Optioneel" />
                  </details>
                </div>
              </div>

              <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-stm-warm-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <button onClick={() => submitCurrentTask('skip')} disabled={busy} className="border border-stm-warm-300 py-3 text-sm font-semibold text-stm-warm-800 disabled:opacity-50">Overslaan</button>
                <button onClick={() => submitCurrentTask('confirm')} disabled={busy} className="bg-stm-sepia-700 py-3 text-sm font-semibold text-white disabled:opacity-50">Bevestigen</button>
              </div>
            </section>
          ) : null}
        </div>

        {status ? <p className="shrink-0 border-t border-stm-warm-200 bg-white px-3 py-2 text-xs text-stm-warm-700">{status}</p> : null}
      </div>
    </main>
  );
}
