# Pseudo-live Resultaten op Suriname Time Machine Website

## Doel
Resultaten van de NAS Mediabank event-workflow bijna live tonen op de publieke website, zonder gevoelige invoerdata (personen/notities) bloot te stellen.

## Uitgangspunten
- Alleen geaggregeerde statusinformatie publiek maken.
- Geen directe publicatie van ruwe submissions.
- Lage operationele complexiteit (polling in plaats van sockets als eerste stap).
- Werkt robuust bij wisselende connectiviteit en standaard hosting setups.

## Scope (Fase 1)
- Publieke status-endpoint op de event-app met alleen aggregaten.
- Frontend widget/sectie op de website die elke 30-60 seconden ververst.
- Duidelijke timestamp `lastUpdated` en `stale` indicatie op de UI.
- Basis beveiliging: CORS beperkt tot bekende website-origin.

## Niet in Scope (Fase 1)
- Live stream via WebSockets/SSE.
- Per item detailniveau van annotaties.
- Publiek inzicht in notities, vrije tekst, of individuele deelnemersactiviteit.

## Data Contract (Publiek)
Voorstel endpoint: `GET /api/event/public-status`

Response (JSON):
- `eventId`: string
- `totals.totalTasks`: number
- `totals.completedTasks`: number
- `totals.openTasks`: number
- `totals.activeClaims`: number
- `totals.participants`: number
- `progress.completionRate`: number (0-100)
- `round.current`: 1 | 2
- `updatedAt`: ISO datetime
- `staleAfterSeconds`: number

## Databronnen
Primair uit bestaande event-state:
- `tasks` statusvelden (`completed`, `assigned`, `unoffered`)
- `participants` count
- `updatedAt`

Bronbestand (huidig):
- `data/nas-mediabank/event-state.json`

## Architectuur
1. Event-app schrijft submissions naar `event-state.json` (bestaat al).
2. Nieuwe route leest state en berekent aggregaten.
3. Website front-end pollt endpoint periodiek.
4. UI toont actuele stand + laatste update tijd.

## Beveiliging en Privacy
- Endpoint bevat geen ruwe payloads.
- Geen participant identifiers in response.
- CORS whitelist op website-domein(en).
- Optionele eenvoudige cache headers (`max-age=10, stale-while-revalidate=20`).
- Basis rate limiting op IP (indien reverse proxy dit ondersteunt).

## Failover Gedrag
- Als endpoint tijdelijk niet bereikbaar is: laatst bekende cijfers tonen met badge `tijdelijk verouderd`.
- Als `updatedAt` ouder is dan `staleAfterSeconds`: waarschuwing tonen in widget.

## UX Richtlijnen
- Toon compact: `Afgerond / Totaal`, `% voltooid`, `Actieve deelnemers`, `Laatste update`.
- Gebruik rustige neutral colors; geen alarmstijl tenzij data stale is.
- Mobiel-first: widget moet passen in small viewport.

## Implementatiestappen
1. Toevoegen route `app/app/api/event/public-status/route.ts`.
2. Extract/centraliseer aggregatiehelper in event-store (herbruikbaar).
3. Voeg CORS policy toe voor publiek endpoint.
4. Maak website-component `EventLiveStatus` met polling interval.
5. Plaats component op relevante pagina op de website.
6. Logging/monitoring: endpoint response time en foutpercentage.

## Testplan (gericht op deze feature)
- Unit: aggregatieberekening klopt voor gemixte task statussen.
- Integration: endpoint geeft alleen toegestane velden.
- Frontend: polling werkt, stale-indicatie werkt bij endpoint-drop.
- Mobile: widget blijft leesbaar op smalle schermen.

## Acceptatiecriteria
- Endpoint response < 300ms lokaal, < 1s in productie gemiddeld.
- Geen gevoelige velden in publieke response.
- Website toont update binnen max 60s van nieuwe submission.
- Bij outage blijft laatste stand zichtbaar met duidelijke stale melding.

## Fase 2 (optioneel)
- SSE voor snellere updates zonder polling.
- Historische trendlijn per uur/dag.
- Dashboard met per mediatype voortgang (beeld/audio/video).
