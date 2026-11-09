# Locatiepunten Paramaribo 1885

**Versie 1.0 (concept, 9 november 2026). De DOI volgt na publicatie in DataverseNL.**

## Wat is dit?

Een puntenbestand van 3.105 locatiepunten van erven in Paramaribo in 1885. 3.005 daarvan zijn adressen
(`punttype` = `adres`): ze hebben het adres van 1885 (wijkletter + huisnummer + eventuele toevoeging) en
meestal de straatnaam van 1885. De overige 100 zijn wijklabels: punten met alleen een wijkletter, zonder
huisnummer en soms zonder straatnaam, meestal bij een groot gebouw of terrein. Waar bekend staat het gebruik
of de functie van het erf in 1885 en 1916 erbij.

De punten zijn gebaseerd op de *Figuratieve plattegrond der stad Paramaribo* door A.J. Meyer
(Paramaribo, 1885; Allard Pierson, Universiteit van Amsterdam, HB-KZL 108.03.21,
<https://hdl.handle.net/11245/3.39624>). Belastingambtenaar Meyer tekende in negen bladen alle erven
in de stad en de 604 erven in de twee buitenwijken, soms met hun gebruik. Voor zover bekend is dit de
oudste bron die exacte adressen op de plattegrond van Paramaribo weergeeft.

Met de punten kun je historische adressen uit Surinaamse bronnen (wijkregisters, burgerlijke stand,
almanakken, volkstellingen) bij benadering op de kaart zetten. Je kunt er ook gegevens over de hele
stad op adresniveau mee visualiseren. De dataset hoort bij de Suriname Time Machine
(<https://www.surinametijdmachine.org>).

## Bestanden

| Bestand | Inhoud |
|---|---|
| `data/locatiepunten_paramaribo_1885.csv` | Eén rij per punt, coördinaten in WGS84 (lon/lat), UTF-8 |
| `data/locatiepunten_paramaribo_1885.geojson` | Dezelfde gegevens als GeoJSON (RFC 7946, CRS84) |
| `data/straten_paramaribo_1885.geojson` | Straatlijnen volgens de kaart van 1885 (171 segmenten) |
| `data/straten_paramaribo_1916.geojson` | Straatlijnen volgens de kaart van 1916–17 (165 segmenten) |
| `data/wijkgrenzen_paramaribo_1885.geojson` | Grenzen van de 8 wijken van 1885 (A–F, EBW, TBW) |
| `README.md` | Documentatie in het Engels |
| `README.nl.md` | Deze beschrijving (Nederlands) |
| `CITATION.cff` | Citeerinformatie |
| `docs/voorbeeld_blad74_wijkA_HB-KZL-108-03-21.jpg` | Voorbeeld: blad 74 (wijk A) van de kaart van 1885, Allard Pierson UvA |

## Velden

| Veld | Beschrijving |
|---|---|
| `lp_id` | Vaste identifier, `stm-1885-address-NNNN` (NNNN = volgorde in het bronbestand) |
| `uri` | URI in de STM-gazetteer: `https://data.surinametijdmachine.org/place/{lp_id}` |
| `bron_fid` | Volgnummer van het punt in het oorspronkelijke QGIS-bestand (export 19-06-2026). Weggelaten punten laten een gat in de nummering |
| `wijk_1885` | Wijkletter 1885 (A–F) of buitenwijk (EBW = Eerste Buitenwijk, TBW = Tweede Buitenwijk) |
| `huisnummer_1885` | Huisnummer 1885 |
| `toevoeging_1885` | Toevoeging (a, b, c ...) |
| `adres_1885` | Samengesteld adres 1885, bijv. `A44` |
| `straatnaam_1885` | Straatnaam volgens de kaart van 1885 |
| `beschrijving_1885` | Functie/gebouw volgens de legenda van de kaart van 1885 |
| `beschrijving_1916` | Functie/gebouw volgens de kaart Paramaribo 1916–17 (Opnemingsdienst van Suriname) |
| `legenda_1885` | Legendanummer/-letter op de kaart van 1885 |
| `legenda_1916` | Legendacode op de kaart van 1916 |
| `redactioneel_commentaar` | Opmerking van de maker(s), bijv. "Ligging gegokt" |
| `punttype` | `adres` (3.005) of `wijklabel` (100: punt met alleen een wijkletter, zonder huisnummer; meestal een groot gebouw of terrein) |
| `lon`, `lat` | Coördinaten WGS84 (EPSG:4326), 7 decimalen |

## Straten 1885 en 1916

Twee lijnenbestanden geven het stratenplan volgens de kaarten van 1885 en 1916–17, als context bij de
locatiepunten. Velden:

| Veld | Beschrijving |
|---|---|
| `straat_id` | Identifier per segment, `stm-1885-street-NNN` of `stm-1916-street-NNN` (NNN = volgorde in de bron) |
| `naam` | Straatnaam zoals op de kaart. `[naamloos]` = op de kaart zonder naam; leeg = naam niet ingevoerd |
| `kaartjaar` | 1885 of 1916 |
| `bron_fid` | Volgnummer in het oorspronkelijke QGIS-bestand |

Een straat kan uit meerdere segmenten bestaan. In de laag van 1885 hebben 45 van de 171 segmenten
geen naam ingevoerd. Drie lijnen uit het bronbestand zijn weggelaten: één zonder coördinaten
(bron_fid 3, Weg naar Zee) en twee exacte dubbelingen van de Noorderkerkstraat (bron_fid 171 en 172);
de nummering van de overige id's is daardoor niet veranderd.

**Let op:** de lijnen van 1885 volgen het stratenplan van 1916–17. Omdat de kaart van 1885 schematisch
is, zijn alleen de straatnamen van die kaart overgenomen en op de straten van 1916 gezet. De geometrie
van de 1885-laag zegt dus niets over de exacte ligging van straten in 1885.

## Wijkgrenzen 1885

`wijkgrenzen_paramaribo_1885.geojson` bevat de grenzen van de zes binnenwijken (A–F) en de twee
buitenwijken (EBW, TBW), met het veld `wijk_1885`. Wie de polygonen heeft getekend, is niet bekend.

**Binnenwijken A–F en Eerste Buitenwijk: grenzen volgens de bron.** Deze grenzen volgen de
*Wet van den 24sten April 1837, houdende voorbereidende bepalingen tot invoering eener nieuwe
Wijkverdeeling voor de Stad Paramaribo en haren omtrek* (Gouvernementsblad Suriname 1837 no. 3, art. 3
en 4). Daarin worden de wijken met straten en waterlopen omschreven, bijvoorbeeld wijk A: ten oosten de
rivier Suriname, ten noorden de Sommelsdijkse kreek tot de Laan van Tourtonne, ten westen de Heiligeweg
(met de Knuffelsgracht) en ten zuiden de Klipstenenstraat. De Eerste Buitenwijk (Combé) wordt ten
oosten en noorden begrensd door de rivier Suriname en de Divisie Para. Bij notificatie van 10 januari
1860 (G.B. 1860 no. 1) is de zuidgrens van wijk F verlegd naar de Dominékreek. Een controle tegen het
stratenplan van 1916 bevestigt de grenzen die we konden toetsen (Keizerstraat, Klipstenenstraat,
Heiligeweg, Zwartenhovenbrugstraat en Wanicastraat). De resolutie van 18 december 1869 (*Surinaamsche
Courant*, Gouvernementsadvertentieblad; Delpher
[ddd:011194077](https://resolver.kb.nl/resolve?urn=ddd:011194077:mpeg21)) bevestigt dat deze indeling
toen nog gold ("met behoud van de bestaande indeeling").

**Tweede Buitenwijk (TBW): een inschatting.** Vanaf 1860 omvat de TBW alle erven ten westen van de
Wanicastraat die tot het stadsdistrict behoren. De buitengrens (noord en west) is dus die van het
stadsdistrict, en die is pas in 1894 als lijn omschreven.[^tbw] De TBW-polygoon volgt die latere grens
(1894/1916) en is daarom voor 1885 een inschatting: punten langs de Weg naar Zee, de Charlesburgweg en de
weg naar Kwatta vallen erbuiten, terwijl ze in 1885 mogelijk wel tot de TBW werden gerekend.

[^tbw]: Bronnen: Wet van 24 april 1837 (G.B. 1837 no. 3, art. 4: TBW = erven ten westen van de
Wanicastraat en ten zuiden van de Gemeene Landsweg); notificatie van 10 januari 1860 (G.B. 1860 no. 1:
"alle bebouwde en onbebouwde erven ten westen der Wanicastraat, tot het Stads District behoorende");
Reglement op de verdeeling der Kolonie in Divisiën van 1 maart 1842 (G.B. 1842 no. 3, art. 4: de Divisie
Para "met uitsluiting der Stad Paramaribo en haren omtrek", niet omschreven); KB van 21 december 1862
no. 26 (G.B. 1863 no. 3, art. 12 en 16: stadsdistrict = de stad met haar buitenwijken, de grond Hermitage
en de gronden aan de weg naar Kwatta tot en met Oldenburg); Gouvernementsblad 1894, art. 2 (eerste
omschrijving als lijn, o.a. "langs de westelijke zijde van den eersten rijweg" tussen Kwattaweg en
Gemeenelandsweg); en het inzetkaartje *Stadsgrens en verdeeling in Wijken* (1:40.000) op de kaart van
1916–17 (<https://hdl.handle.net/11245/3.38611>). Voor 1862–1894 is geen omschrijving gevonden.

De oorspronkelijke laag staat in Zanderij / Suriname TM (EPSG:31171). Het build-script zet hem om naar
WGS84. Ter controle: van de locatiepunten valt 99,9% binnen de grens van hun eigen wijk, met
uitzondering van de Tweede Buitenwijk. **In de Tweede Buitenwijk (TBW) liggen 45 van de 441 punten
buiten de getekende wijkgrens**, omdat de punten daar ruimer zijn geplaatst en de grens een inschatting is.

## Hoe is de dataset gemaakt?

De kaart van Meyer is schematisch: de erven zijn niet op schaal getekend. De huisnummers laten wel zien
waar de adressen ten opzichte van elkaar in een bouwblok lagen. Zo zijn de punten geplaatst:

1. De schematische kaart van 1885 is gelegd over de veel nauwkeurigere kaart *Paramaribo* van
   1916–17, vervaardigd door den Opnemingsdienst van Suriname (<https://hdl.handle.net/11245/3.38611>).
2. Per bouwblok zijn de adressen op volgorde langs de straat gezet. Elk punt staat net achter de
   straatlijn, aan de kant van het erf.
3. Bij twijfel zijn de Concordans Paramaribo van Dr. Muntjewerff
   (<https://www.concordansparamaribo.info/>) en de wijkregisters gebruikt om de positie te bepalen.
   Gegevens uit de concordans zelf zitten niet in deze dataset. Waar mogelijk is ook rekening gehouden
   met de hedendaagse percelen zoals gedocumenteerd in GLIS (het Surinaamse kadaster).
   [TODO: nadere informatie over het gebruik van GLIS]
4. De velden `beschrijving_1885` en `legenda_1885` komen van de legenda van de kaart van 1885, en
   `beschrijving_1916` en `legenda_1916` van de kaart van 1916–17.
5. De punten zijn tussen 2021 en 2026 door Thunnis van Oort (ORCID [0000-0001-8912-0508](https://orcid.org/0000-0001-8912-0508)) gemaakt in QGIS. De export van 19 juni 2026
   (`data/08-place-points-qgis/export20260619/locatiepunten1885.geojson` in de repository
   `SurinameTimeMachine/suriname-database-model`) is de basis van deze versie en blijft daar
   ongewijzigd bewaard.

Het veld `punttype` is afgeleid uit de eigen adresvelden van de punten. De `lp_id`'s komen overeen met
de records van het type `historical-address` in de STM-gazetteer. Let op: de gazetteer bevat (nog) de
oorspronkelijke adressen uit de QGIS-export en ook de punten die hier zijn weggelaten. Voor de zes punten
met een a/b-correctie (B230, B258, E42) geeft een koppeling op `lp_id` daarom een ander adres dan in
deze dataset.

## Nauwkeurigheid: lees dit voor gebruik

- **De punten zijn benaderingen en geen gemeten posities.** Ze geven aan waar een adres ongeveer lag en
  hoe adressen in een blok ten opzichte van elkaar lagen.
- In het centrum zijn de punten nauwkeuriger dan in de buitenwijken (EBW, TBW). Daar is de precieze
  ligging van een adres soms niet bekend. Zie ook `redactioneel_commentaar`, bijvoorbeeld "Ligging gegokt".
- De dataset zegt niets over de grootte van een perceel of het aantal woningen per erf. Vooral in de
  binnenstad stonden op één erf vaak meerdere woningen, onder andere voormalige slavenwoningen op de
  achtererven.
- Voor het ongeveer lokaliseren van adressen en voor visualisaties op stadsniveau is de nauwkeurigheid
  voldoende. Voor analyses op perceel- of meterniveau is de dataset niet geschikt.

## Bekende beperkingen

- De ligging van een aantal punten is geschat ("Ligging gegokt" in `redactioneel_commentaar`).

## Licentie

Deze dataset valt onder de licentie [Creative Commons Naamsvermelding 4.0 Internationaal (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/deed.nl). De kaarten van 1885 en 1916–17 zelf zijn publiek domein.

## Citeren

Van Oort, T. (2026). *Locatiepunten Paramaribo 1885* (versie 1.0). Suriname Time Machine.
DataverseNL (HDSC). https://doi.org/10.34894/... [TODO DOI na publicatie]

## Gebruik van AI

Bij het samenstellen van dit publicatiepakket is AI gebruikt (Claude, Anthropic): het omzetten van het
QGIS-bestand naar CSV/GeoJSON met Nederlandse veldnamen, het doorvoeren van enkele correcties in de data en het
opstellen van deze README. De locatiepunten zelf, de adressen en de beschrijvingen zijn door mensen
gemaakt. Alle door AI gemaakte stappen zijn door Thunnis van Oort gecontroleerd.

## Contact

Thunnis van Oort, KNAW Humanities Cluster / Huygens Instituut, thunnis.van.oort@huygens.knaw.nl
