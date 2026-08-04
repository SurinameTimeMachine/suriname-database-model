# Event App Mobile Testplan (Na Vakantie)

## Doel
Valideren dat de NAS Mediabank smartphone workflow werkt op moderne en oudere toestellen die in Suriname in omloop zijn, inclusief toestellen met verouderde OS/browser versies.

## Prioriteit
- P0: Taken kunnen claimen, invullen en indienen zonder vastlopen.
- P0: AV-fragmenten (audio/video) spelen af of geven duidelijke fallback.
- P0: Locatiekeuze blijft bruikbaar bij dubbele namen.
- P1: Performance blijft acceptabel op tragere toestellen/netwerken.
- P1: UI blijft leesbaar en bedienbaar op kleine schermen.

## Testmatrix Toestellen
Minimaal per categorie 1 fysiek toestel:
- Android nieuw: Android 13+ (Chrome recent)
- Android midden: Android 10-12 (Chrome niet up-to-date)
- Android oud: Android 8-9 (laatste beschikbare browser)
- iPhone nieuw: iOS 16-17 (Safari)
- iPhone oud: iOS 14-15 (Safari)

## Netwerkprofielen
- Wi-Fi stabiel
- 4G gemiddeld
- 3G of beperkte bandbreedte (throttling)
- Intermitterend netwerk (kort verlies en herstel)

## Kernscenario's
1. Start sessie met nickname en claim taak.
2. Voeg locatie toe via suggesties en via vrije invoer.
3. Kies bij plantages de juiste optie met districtindicatie.
4. Voeg persoon toe en notitie toe.
5. Voeg datum toe en bevestig.
6. Bevestig zonder locatie en zonder "locatie onbekend"; controleer dat taak terugkomt.
7. Markeer "locatie onbekend" en bevestig; controleer dat taak afgerond wordt.
8. Speel AV-fragment af (audio en video) en test fallback links.
9. Open "Controleer" link naar gazetteer en keer terug naar taak.
10. Herlaad pagina tijdens actieve sessie en controleer herstel.

## Acceptatiecriteria
- Geen blokkerende fouten in console die workflow stoppen.
- Geen verlies van ingevoerde data binnen een actieve claim.
- Tijd tot eerste interactie op oud toestel: acceptabel voor veldwerk (richtwaarde < 5s op 4G).
- AV-fallback werkt als native playback niet ondersteunt.

## Registratie van Bevindingen
Per testcase registreren:
- toestelmodel, OS-versie, browser-versie
- netwerkprofiel
- resultaat: pass/fail
- screenshot of screen recording bij fail
- korte reproducerende stappen

## Verwachte Risico's
- HLS/DASH compatibiliteit op oude browsers
- Lag bij grote suggestielijsten
- Keyboard/focus issues op kleine schermen
- Caching/stale state bij instabiele verbinding

## Beslisregel Na Testronde
- P0-fails: eerst oplossen, dan veldgebruik.
- P1-fails: plannen voor volgende iteratie, tenzij impact op data-kwaliteit groot is.
