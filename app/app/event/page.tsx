'use client';

import Hls from 'hls.js';
import { useEffect, useMemo, useRef, useState } from 'react';

type PlaceSuggestion = {
  gazetteerId: string;
  label: string;
  category: string;
  source: string;
};

type EventTask = {
  taskId: string;
  mode: 'image' | 'av';
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
  playableUrl: string;
  lowResUrl: string;
  segmentIndex: number;
  tcStart: string;
  tcEnd: string;
  suggestedPlaces: PlaceSuggestion[];
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

type PlaceOption = {
  id: string;
  name: string;
  type: string;
};

const STORAGE_KEY = 'stm_event_participant';

function toHlsUrl(url: string): string {
  if (!url) return '';
  if (url.includes('.m3u8')) return url;
  return url.replace('.mpd', '.m3u8');
}

function pickLowestBandwidthHls(manifestText: string, baseUrl: string): string {
  const lines = manifestText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  let bestUrl = '';
  let bestBandwidth = Number.POSITIVE_INFINITY;

  for (let i = 0; i < lines.length - 1; i += 1) {
    const line = lines[i];
    if (!line.startsWith('#EXT-X-STREAM-INF:')) continue;

    const match = line.match(/BANDWIDTH=(\d+)/i);
    const bandwidth = match ? Number(match[1]) : Number.POSITIVE_INFINITY;
    const nextLine = lines[i + 1];
    if (!nextLine || nextLine.startsWith('#')) continue;

    if (bandwidth < bestBandwidth) {
      bestBandwidth = bandwidth;
      bestUrl = new URL(nextLine, baseUrl).toString();
    }
  }

  return bestUrl;
}

export default function EventPage() {
  const [nickname, setNickname] = useState('');
  const [participantId, setParticipantId] = useState('');
  const [status, setStatus] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [task, setTask] = useState<EventTask | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [done, setDone] = useState(false);
  const [placeOptions, setPlaceOptions] = useState<PlaceOption[]>([]);

  const [selectedPlaceIds, setSelectedPlaceIds] = useState<string[]>([]);
  const [selectedPlaceNames, setSelectedPlaceNames] = useState<string[]>([]);
  const [addedPlaces, setAddedPlaces] = useState<string[]>([]);
  const [addedDates, setAddedDates] = useState<string[]>([]);
  const [selectedPersons, setSelectedPersons] = useState<string[]>([]);
  const [addedPersons, setAddedPersons] = useState<string[]>([]);
  const [locationUnknown, setLocationUnknown] = useState(false);
  const [notes, setNotes] = useState('');
  const [placeInput, setPlaceInput] = useState('');
  const [dateInput, setDateInput] = useState('');
  const [personInput, setPersonInput] = useState('');
  const [avPlaybackUrl, setAvPlaybackUrl] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
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

  useEffect(() => {
    fetch('/api/event/options')
      .then((res) => res.json())
      .then((data) => setPlaceOptions(data.places || []))
      .catch(() => {
        setPlaceOptions([]);
      });
  }, []);

  const placeOptionNames = useMemo(() => placeOptions.map((opt) => opt.name), [placeOptions]);
  const matchingPlaceOptions = useMemo(() => {
    const query = placeInput.trim().toLowerCase();
    if (!query) return placeOptions.slice(0, 8);
    return placeOptions.filter((option) => {
      const display = `${option.name} (${option.type})`.toLowerCase();
      return option.name.toLowerCase().includes(query) || option.type.toLowerCase().includes(query) || display.includes(query);
    }).slice(0, 8);
  }, [placeOptions, placeInput]);
  const avHlsUrl = useMemo(() => (task?.playableUrl ? toHlsUrl(task.playableUrl) : ''), [task]);
  const isAudioTask = task?.mediaType === 'audio' || task?.documentType.toLowerCase().includes('audio');

  useEffect(() => {
    const media = isAudioTask ? audioRef.current : videoRef.current;
    const currentHls = hlsRef.current;

    if (currentHls) {
      currentHls.destroy();
      hlsRef.current = null;
    }

    if (!task || task.mode !== 'av' || !avPlaybackUrl || !media) {
      return;
    }

    media.removeAttribute('src');
    media.load();

    const canPlayNative = media.canPlayType('application/vnd.apple.mpegurl');
    if (canPlayNative) {
      media.src = avPlaybackUrl;
      media.load();
      return;
    }

    if (!Hls.isSupported()) {
      media.src = avPlaybackUrl;
      media.load();
      return;
    }

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      capLevelToPlayerSize: true,
      startLevel: 0,
    });
    hlsRef.current = hls;
    hls.loadSource(avPlaybackUrl);
    hls.attachMedia(media);
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (data.fatal) {
        setStatus('AV-stream laadt niet goed. Probeer de mobiele link of laad opnieuw.');
      }
    });

    return () => {
      hls.destroy();
      if (hlsRef.current === hls) {
        hlsRef.current = null;
      }
    };
  }, [task, avPlaybackUrl, isAudioTask]);

  useEffect(() => {
    let cancelled = false;

    async function prepareLowBandwidthPlaybackUrl() {
      if (!task || task.mode !== 'av' || !avHlsUrl) {
        setAvPlaybackUrl('');
        return;
      }

      try {
        const response = await fetch(avHlsUrl);
        if (!response.ok) throw new Error('Cannot read HLS manifest');
        const manifestText = await response.text();
        if (cancelled) return;

        const lowestVariant = pickLowestBandwidthHls(manifestText, avHlsUrl);
        setAvPlaybackUrl(lowestVariant || avHlsUrl);
      } catch {
        if (!cancelled) setAvPlaybackUrl(avHlsUrl);
      }
    }

    void prepareLowBandwidthPlaybackUrl();

    return () => {
      cancelled = true;
    };
  }, [task, avHlsUrl]);

  function resetFormForTask(nextTask: EventTask | null) {
    if (!nextTask) {
      setSelectedPlaceIds([]);
      setSelectedPlaceNames([]);
      setSelectedPersons([]);
      setAddedPlaces([]);
      setAddedDates([]);
      setAddedPersons([]);
      setDateInput('');
      setLocationUnknown(false);
      setNotes('');
      return;
    }

    const initialPlaceIds = nextTask.suggestedPlaces
      .map((entry) => entry.gazetteerId)
      .filter(Boolean);
    const initialPlaceNames = nextTask.suggestedPlaces.map((entry) => entry.label);
    setSelectedPlaceIds([...new Set(initialPlaceIds)]);
    setSelectedPlaceNames([...new Set(initialPlaceNames)]);
    setSelectedPersons([...new Set(nextTask.suggestedPersons)]);
    setAddedPlaces([]);
    setAddedDates([]);
    setAddedPersons([]);
    setDateInput('');
    setLocationUnknown(false);
    setNotes('');
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
      setStatus(data.reused ? 'Je hebt nog een actieve taak.' : 'Nieuwe taak toegewezen.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Onbekende fout bij claim.');
    } finally {
      setBusy(false);
    }
  }

  function togglePlaceSuggestion(suggestion: PlaceSuggestion) {
    const id = suggestion.gazetteerId;
    if (!id) {
      const exists = selectedPlaceNames.includes(suggestion.label);
      setSelectedPlaceNames((prev) =>
        exists ? prev.filter((value) => value !== suggestion.label) : [...prev, suggestion.label],
      );
      return;
    }

    const selected = selectedPlaceIds.includes(id);
    if (selected) {
      setSelectedPlaceIds((prev) => prev.filter((value) => value !== id));
      setSelectedPlaceNames((prev) => prev.filter((value) => value !== suggestion.label));
    } else {
      setSelectedPlaceIds((prev) => [...prev, id]);
      setSelectedPlaceNames((prev) => [...new Set([...prev, suggestion.label])]);
    }
  }

  function togglePersonSuggestion(name: string) {
    const selected = selectedPersons.includes(name);
    setSelectedPersons((prev) =>
      selected ? prev.filter((value) => value !== name) : [...prev, name],
    );
  }

  function addPlaceTerm() {
    const term = placeInput.trim();
    if (!term) return;
    if (selectedPlaceNames.includes(term) || addedPlaces.includes(term)) {
      setPlaceInput('');
      return;
    }
    setAddedPlaces((prev) => [...prev, term]);
    setPlaceInput('');
  }

  function chooseGazetteerOption(option: PlaceOption) {
    const suggestion = {
      gazetteerId: option.id,
      label: option.name,
      category: option.type,
      source: 'gazetteer',
    };
    togglePlaceSuggestion(suggestion);
    setPlaceInput('');
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

  function addPersonTerm() {
    const term = personInput.trim();
    if (!term) return;
    if (selectedPersons.includes(term) || addedPersons.includes(term)) {
      setPersonInput('');
      return;
    }
    setAddedPersons((prev) => [...prev, term]);
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
        selectedPlaceIds,
        selectedPlaceNames,
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
    <div className="h-full overflow-y-auto bg-stm-warm-50">
      <div className="max-w-xl mx-auto p-4 sm:p-6 space-y-4">
        <header className="border border-stm-warm-200 bg-white p-4">
          <h1 className="text-xl font-semibold text-stm-warm-900">NAS Mediabank in de Suriname Time Machine</h1>
          <p className="text-sm text-stm-warm-600 mt-1">
            Smartphone toepassing voor verrijking beeldmateriaal.
          </p>
          {stats ? (
            <p className="text-xs text-stm-warm-500 mt-2">
              Totaal {stats.total} | Afgerond {stats.completed} | Open taken {stats.unresolved} | Ronde {stats.round}
            </p>
          ) : null}
        </header>

        {!participantId ? (
          <section className="border border-stm-warm-200 bg-white p-4 space-y-3">
            <label className="block text-sm font-medium text-stm-warm-800">Nickname</label>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Bijv. Team-12"
              className="w-full border border-stm-warm-300 px-3 py-2 text-sm"
            />
            <button
              onClick={startSession}
              disabled={busy}
              className="w-full bg-stm-sepia-600 text-white py-2 text-sm font-medium disabled:opacity-50"
            >
              Start
            </button>
          </section>
        ) : null}

        {participantId && !task && !done ? (
          <section className="border border-stm-warm-200 bg-white p-4">
            <button
              onClick={claimNextTask}
              disabled={busy}
              className="w-full bg-stm-warm-900 text-white py-2 text-sm font-medium disabled:opacity-50"
            >
              Volgende taak ophalen
            </button>
          </section>
        ) : null}

        {done ? (
          <section className="border border-stm-warm-200 bg-white p-4 text-sm text-stm-warm-700">
            Geen taken meer beschikbaar op dit moment.
          </section>
        ) : null}

        {task ? (
          <section className="border border-stm-warm-200 bg-white p-4 space-y-4">
            <div>
              <p className="text-xs text-stm-warm-500">{task.mode === 'av' ? 'AV-taak' : 'Beeldtaak'}</p>
              <h2 className="text-lg font-semibold text-stm-warm-900">{task.title || '(zonder titel)'}</h2>
              <p className="text-sm text-stm-warm-700 mt-1">{task.description || '(geen beschrijving)'}</p>
              <p className="text-xs text-stm-warm-500 mt-2">
                Datum: {task.yearRaw || 'onbekend'} | Inventaris: {task.inventoryNumber || 'onbekend'}
              </p>
              {task.mode === 'av' ? (
                <p className="text-xs text-stm-warm-500 mt-1">
                  Segment {task.segmentIndex} | {task.tcStart} - {task.tcEnd || 'einde onbekend'}
                </p>
              ) : null}
            </div>

            {task.lowResUrl ? (
              <img src={task.lowResUrl} alt={task.title || 'preview'} className="w-full border border-stm-warm-200" />
            ) : null}

            {task.mode === 'av' && avPlaybackUrl ? (
              isAudioTask ? (
                <audio ref={audioRef} controls preload="metadata" className="w-full">
                  <source src={avPlaybackUrl} type="application/vnd.apple.mpegurl" />
                </audio>
              ) : (
                <video ref={videoRef} controls preload="metadata" playsInline className="w-full border border-stm-warm-200">
                  <source src={avPlaybackUrl} type="application/vnd.apple.mpegurl" />
                </video>
              )
            ) : null}

            <div className="flex gap-2">
              {task.sourceUrl ? (
                <a href={task.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs underline text-stm-sepia-700">
                  Open bron
                </a>
              ) : null}
              {avPlaybackUrl ? (
                <a href={avPlaybackUrl} target="_blank" rel="noopener noreferrer" className="text-xs underline text-stm-sepia-700">
                  Open AV stream (mobiel)
                </a>
              ) : null}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-stm-warm-900 mb-2">Locatiesuggesties</h3>
              <label className="flex gap-2 text-sm mb-2">
                <input
                  type="checkbox"
                  checked={locationUnknown}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setLocationUnknown(checked);
                    if (checked) {
                      setSelectedPlaceIds([]);
                      setSelectedPlaceNames([]);
                      setAddedPlaces([]);
                    }
                  }}
                />
                <span>Locatie onbekend of niet zinvol voor dit item</span>
              </label>
              <div className="space-y-1">
                {task.suggestedPlaces.map((suggestion, index) => {
                  const checked = suggestion.gazetteerId
                    ? selectedPlaceIds.includes(suggestion.gazetteerId)
                    : selectedPlaceNames.includes(suggestion.label);
                  return (
                    <label
                      key={suggestion.gazetteerId ? `${suggestion.gazetteerId}-${index}` : `${suggestion.label}-${index}`}
                      className="flex gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={locationUnknown}
                        onChange={() => togglePlaceSuggestion(suggestion)}
                      />
                      <span>
                        {suggestion.label} <span className="text-stm-warm-500">({suggestion.category})</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-stm-warm-800 mb-1">Locatie toevoegen</label>
              <input
                list="place-options"
                value={placeInput}
                onChange={(e) => setPlaceInput(e.target.value)}
                placeholder="Zoek of typ nieuwe term"
                disabled={locationUnknown}
                className="w-full border border-stm-warm-300 px-3 py-2 text-sm"
              />
              <datalist id="place-options">
                {placeOptions.map((option) => (
                  <option key={option.id} value={option.name} label={`${option.name} (${option.type})`} />
                ))}
              </datalist>
              <button onClick={addPlaceTerm} disabled={locationUnknown} className="mt-2 bg-stm-warm-200 px-3 py-1 text-xs disabled:opacity-50">
                Voeg locatie toe
              </button>
              {addedPlaces.length > 0 ? (
                <p className="text-xs text-stm-warm-600 mt-2">Nieuw: {addedPlaces.join(' | ')}</p>
              ) : null}
              {matchingPlaceOptions.length > 0 ? (
                <div className="mt-3 space-y-2 text-xs text-stm-warm-700">
                  <p className="font-medium text-stm-warm-800">Mogelijke matches</p>
                  <div className="space-y-2">
                    {matchingPlaceOptions.map((option) => (
                      <div key={option.id} className="flex items-center justify-between gap-3 border border-stm-warm-200 bg-stm-warm-50 px-3 py-2">
                        <div>
                          <p className="font-medium text-stm-warm-800">
                            {option.name} <span className="text-stm-warm-500">({option.type})</span>
                          </p>
                          <p className="text-[11px] text-stm-warm-500">ID: {option.id}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => chooseGazetteerOption(option)}
                            disabled={locationUnknown}
                            className="bg-stm-sepia-700 text-white px-2 py-1 disabled:opacity-50"
                          >
                            Kies
                          </button>
                          <a
                            href={`/places?id=${encodeURIComponent(option.id)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline text-stm-sepia-700"
                          >
                            Controleer
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div>
              <label className="block text-sm font-medium text-stm-warm-800 mb-1">Datum toevoegen</label>
              <div className="flex gap-2">
                <input
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                  placeholder="Bijv. 15 juli 1975"
                  className="w-full border border-stm-warm-300 px-3 py-2 text-sm"
                />
                <button onClick={addDateTerm} className="bg-stm-warm-200 px-3 py-1 text-xs">
                  Voeg datum toe
                </button>
              </div>
              {addedDates.length > 0 ? (
                <p className="text-xs text-stm-warm-600 mt-2">Nieuw: {addedDates.join(' | ')}</p>
              ) : null}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-stm-warm-900 mb-2">Persoonsuggesties</h3>
              <div className="space-y-1">
                {task.suggestedPersons.map((name, index) => (
                  <label key={`${name}-${index}`} className="flex gap-2 text-sm">
                    <input type="checkbox" checked={selectedPersons.includes(name)} onChange={() => togglePersonSuggestion(name)} />
                    <span>{name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-stm-warm-800 mb-1">Persoon toevoegen</label>
              <input
                value={personInput}
                onChange={(e) => setPersonInput(e.target.value)}
                placeholder="Typ naam"
                className="w-full border border-stm-warm-300 px-3 py-2 text-sm"
              />
              <button onClick={addPersonTerm} className="mt-2 bg-stm-warm-200 px-3 py-1 text-xs">
                Voeg persoon toe
              </button>
              {addedPersons.length > 0 ? (
                <p className="text-xs text-stm-warm-600 mt-2">Nieuw: {addedPersons.join(' | ')}</p>
              ) : null}
            </div>

            <div>
              <label className="block text-sm font-medium text-stm-warm-800 mb-1">Notitie</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full border border-stm-warm-300 px-3 py-2 text-sm"
                placeholder="Optioneel"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => submitCurrentTask('confirm')}
                disabled={busy}
                className="bg-stm-sepia-700 text-white py-2 text-sm font-semibold disabled:opacity-50"
              >
                Bevestigen
              </button>
              <button
                onClick={() => submitCurrentTask('skip')}
                disabled={busy}
                className="bg-stm-warm-300 text-stm-warm-900 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Overslaan
              </button>
            </div>
          </section>
        ) : null}

        {status ? (
          <section className="border border-stm-warm-200 bg-white p-3 text-xs text-stm-warm-700">{status}</section>
        ) : null}
      </div>
    </div>
  );
}
