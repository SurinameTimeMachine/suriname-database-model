# Historische adreslocaties Paramaribo, 1885

**Versie 1.0 (13 november 2026). [De DOI volgt na publicatie in DataverseNL.]**

*Dit is de Nederlandse versie van README.md. Bij verschillen is de Engelse versie leidend.*

## Inleiding

Deze documentatie beschrijft een dataset met historische adresgegevens van Paramaribo. De kern van de dataset bestaat uit 3.105 locatiepunten van erven in Paramaribo, Suriname, in 1885. 3.005 daarvan zijn adressen (`punttype` = `adres`): ze hebben het adres van 1885 (wijkletter + huisnummer + eventuele toevoeging) en (waar beschikbaar) de straatnaam van 1885. De overige 100 punten markeren een locatie die op een van de twee gebruikte historische kaarten staat beschreven (zie hieronder).

De punten zijn gebaseerd op de *Figuratieve plattegrond der stad Paramaribo* door A.J. Meyer (Paramaribo, 1885; Allard Pierson, Universiteit van Amsterdam, HB-KZL 108.03.21, <https://hdl.handle.net/11245/3.39624>). Belastingambtenaar Meyer tekende in negen bladen alle erven in de stad en de twee buitenwijken, soms met een beschrijving van hun functie, zoals een kerk of politiepost. Voor zover wij weten is dit de oudste bron die exacte adressen op een plattegrond van Paramaribo weergeeft.

Er zijn drie hulpbestanden bijgevoegd om de punten te helpen interpreteren: het stratennet van 1885 volgens de kaart van Meyer (171 lijnsegmenten, `straten_paramaribo_1885.geojson`), het stratennet van de kaart van de Opnemingsdienst van 1916–17 (165 segmenten, `straten_paramaribo_1916.geojson`) en de grenzen van de acht wijken van 1885 (A–F, EBW en TBW; `wijkgrenzen_paramaribo_1885.geojson`).

Met deze punten kun je historische adressen uit Surinaamse bronnen (wijkregisters, burgerlijke stand, almanakken, volkstellingen) bij benadering op de kaart zetten, en gegevens over de hele stad op adresniveau visualiseren. De dataset hoort bij het project Suriname Tijdmachine (STM) (<https://www.surinametijdmachine.org>).

## Bestanden

| Bestand | Inhoud |
| --- | --- |
| `data/locatiepunten_paramaribo_1885.csv` | Eén rij per punt, WGS84-coördinaten (lon/lat), UTF-8 |
| `data/locatiepunten_paramaribo_1885.geojson` | Dezelfde gegevens als GeoJSON (RFC 7946, CRS84) |
| `data/straten_paramaribo_1885.geojson` | Straatlijnen volgens de kaart van 1885 (171 segmenten) |
| `data/straten_paramaribo_1916.geojson` | Straatlijnen volgens de kaart van 1916–17 (165 segmenten) |
| `data/wijkgrenzen_paramaribo_1885.geojson` | Grenzen van de 8 wijken van 1885 (A–F, EBW, TBW) |
| `README.md` | Beschrijving in het Engels (leidend) |
| `README.nl.md` | Deze beschrijving (Nederlands) |
| `CITATION.cff` | Citatiegegevens |
| `docs/voorbeeld_blad74_wijkA_HB-KZL-108-03-21.jpg` | Voorbeeld: blad 74 (wijk A) van de kaart van 1885, Allard Pierson UvA |

## Velden (locatiepunten)

| Veld | Beschrijving |
| --- | --- |
| `lp_id` | Persistente identifier, `stm-1885-address-NNNN` (NNNN = volgorde in het bronbestand) |
| `uri` | URI in de STM-gazetteer: `https://data.surinametijdmachine.org/place/{lp_id}` |
| `bron_fid` | Volgnummer van het punt in het oorspronkelijke QGIS-bestand (export 19-06-2026). Weggelaten punten laten een gat in de nummering |
| `wijk_1885` | Wijkletter 1885 (A–F) of buitenwijk (EBW = Eerste Buitenwijk; TBW = Tweede Buitenwijk) |
| `huisnummer_1885` | Huisnummer 1885 |
| `toevoeging_1885` | Toevoeging (a, b, c, enz.) |
| `adres_1885` | Samengesteld adres 1885, bijvoorbeeld `A44b` |
| `straatnaam_1885` | Straatnaam volgens de kaart van 1885 |
| `beschrijving_1885` | Functie/gebouw volgens de legenda van de kaart van 1885 |
| `beschrijving_1916` | Functie/gebouw volgens de kaart *Paramaribo* 1916–17 (Opnemingsdienst van Suriname) |
| `legenda_1885` | Legendanummer/-letter op de kaart van 1885 |
| `legenda_1916` | Legendacode op de kaart van 1916 |
| `redactioneel_commentaar` | Opmerking van de maker |
| `punttype` | `adres` (3.005) of `wijklabel` (100: punt met alleen een wijkletter, zonder huisnummer; meestal een groot gebouw of terrein) |
| `lon`, `lat` | Coördinaten WGS84 (EPSG:4326), 7 decimalen |

## Straten 1885 en 1916

Twee lijnbestanden geven het stratenplan volgens de kaarten van 1885 en 1916–17, als context bij de locatiepunten. Velden:

| Veld | Beschrijving |
| --- | --- |
| `straat_id` | Identifier per segment, `stm-1885-street-NNN` of `stm-1916-street-NNN` (NNN = volgorde in de bron) |
| `naam` | Straatnaam zoals op de kaart. `[naamloos]` = straat die op de kaart staat zonder naam; leeg = geen naam ingevoerd |
| `kaartjaar` | 1885 of 1916 |
| `bron_fid` | Volgnummer in het oorspronkelijke QGIS-bestand |

Een straat kan uit meerdere segmenten bestaan. In de laag van 1885 hebben 45 van de 171 segmenten geen naam, omdat ze op de kaart niet benoemd zijn.

**Let op:** de lijnen van 1885 volgen het stratenplan van 1916–17. Omdat de kaart van 1885 schematisch is, zijn alleen de straatnamen overgenomen en op de straten van 1916 gezet. De geometrie van de laag van 1885 zegt dus niets over de precieze ligging van straten in 1885.

## Hoe is de dataset gemaakt?

De kaart van Meyer is schematisch: de erven zijn niet op schaal getekend. De huisnummers laten wel zien hoe adressen binnen een blok ten opzichte van elkaar lagen. De punten zijn als volgt geplaatst:

1. De schematische kaart van 1885 is over de veel nauwkeurigere kaart *Paramaribo* van 1916–17 gelegd, gemaakt door de Opnemingsdienst van Suriname (<https://hdl.handle.net/11245/3.38611>).
2. Binnen elk blok zijn de adressen op volgorde langs de straat geplaatst. Elk punt ligt net achter de straatlijn, aan de kant van het erf.
3. Bij twijfel zijn de Concordans Paramaribo van Dr. Muntjewerff (<https://www.concordansparamaribo.info/>) en de *Wijkregisters van Paramaribo* (<https://doi.org/10.34894/VQQGUV>) gebruikt om de positie te bepalen. Gegevens uit de concordans zelf zitten niet in deze dataset. Waar mogelijk zijn de hedendaagse perceelgrenzen uit de perceeldata van het Management Instituut GLIS (MI-GLIS, het Surinaamse kadaster) gebruikt als referentie voor de plaatsing binnen blokken. Deze perceeldataset is niet openbaar en zit niet in dit pakket; de percelen zijn te bekijken in MI-GLIS Percelen Online (<https://www.arcgis.com/apps/webappviewer/index.html?id=03fcf6e8dc7548c8954a0c918c137214>).
4. De velden `beschrijving_1885` en `legenda_1885` komen uit de legenda van de kaart van 1885, en `beschrijving_1916` en `legenda_1916` uit de kaart van 1916–17.
5. De punten zijn tussen 2021 en 2026 in QGIS gemaakt door Thunnis van Oort. De export van 19 juni 2026 (`data/08-place-points-qgis/export20260619/locatiepunten1885.geojson` in de repository `SurinameTimeMachine/suriname-database-model`) is de basis van deze versie.

Het veld `punttype` is afgeleid uit de eigen adresvelden van de punten. De `lp_id`'s komen overeen met de records van het type `historical-address` in de STM-gazetteer.

## Nauwkeurigheid: lees dit vóór gebruik

- **De punten zijn benaderingen, geen ingemeten posities.** Ze laten zien waar een adres ongeveer lag en hoe adressen binnen een blok ten opzichte van elkaar lagen.
- De punten zijn nauwkeuriger in het stadscentrum dan in de buitenwijken (EBW, TBW), waar de precieze ligging van een adres soms onbekend is.
- De dataset zegt niets over de grootte van een erf of het aantal woningen per erf. Op één erf stonden vaak meerdere woningen, waaronder voormalige slavenwoningen op de achtererven.
- De nauwkeurigheid is voldoende om adressen bij benadering te lokaliseren en voor visualisaties op stadsniveau. De dataset is niet geschikt voor analyses op perceelniveau.

## Wijkgrenzen 1885

`wijkgrenzen_paramaribo_1885.geojson` bevat de grenzen van de zes binnenwijken (A–F) en de twee buitenwijken (EBW en TBW), met het veld `wijk_1885`.

**Binnenwijken A–F en Eerste Buitenwijk: grenzen volgens de bron.** Deze grenzen volgen de *Wet van den 24sten April 1837, houdende voorbereidende bepalingen tot invoering eener nieuwe Wijkverdeeling voor de Stad Paramaribo en haren omtrek* (Gouvernementsblad Suriname 1837 no. 3, art. 3 en 4). Die beschrijft de wijken aan de hand van straten en waterlopen; bijvoorbeeld wijk A: ten oosten de rivier de Suriname, ten noorden de Sommelsdijkse kreek tot aan de Laan van Tourtonne, ten westen de Heiligeweg (inclusief de Knuffelsgracht) en ten zuiden de Klipstenenstraat. De Eerste Buitenwijk (Combé) wordt in het oosten en noorden begrensd door de rivier de Suriname en de Divisie Para. Bij publicatie van 10 januari 1860 (G.B. 1860 no. 1) is de zuidgrens van wijk F verlegd naar de Dominékreek. Een controle tegen het stratenplan van 1916 bevestigt de grenzen die we konden toetsen (Keizerstraat, Klipstenenstraat, Heiligeweg, Zwartenhovenbrugstraat en Wanicastraat). De resolutie van 18 december 1869 (*Surinaamsche Courant*, Gouvernements-advertentieblad; Delpher [ddd:011194077](https://resolver.kb.nl/resolve?urn=ddd:011194077:mpeg21)) bevestigt dat deze indeling toen nog gold ("met behoud van de bestaande indeeling").

**Tweede Buitenwijk (TBW): een inschatting.** Vanaf 1860 omvatte de TBW alle erven ten westen van de Wanicastraat die tot het stadsdistrict behoorden. De buitengrens (noord en west) is die van het stadsdistrict, die pas in 1894 als lijn werd vastgelegd.¹ De TBW-polygoon volgt deze latere grens (1894/1916) en is daarom voor 1885 een inschatting: punten langs de Weg naar Zee, de weg naar Charlesburg en de Kwattaweg vallen erbuiten, hoewel ze in 1885 mogelijk tot de TBW behoorden.

*¹ Bronnen: Wet van 24 april 1837 (G.B. 1837 no. 3, art. 4: TBW = erven ten westen van de Wanicastraat en ten zuiden van de Gemeene Landsweg); publicatie van 10 januari 1860 (G.B. 1860 no. 1: "alle bebouwde en onbebouwde erven ten westen der Wanicastraat, tot het Stads District behoorende"); reglement op de divisiën van 1 maart 1842 (G.B. 1842 no. 3, art. 4: de Divisie Para "met uitsluiting der Stad Paramaribo en haren omtrek", niet nader omschreven); Koninklijk Besluit van 21 december 1862 no. 26 (G.B. 1863 no. 3, art. 12 en 16: het stadsdistrict is de stad met haar buitenwijken, de grond Hermitage en de gronden langs de Kwattaweg tot en met Oldenburg); Gouvernementsblad 1894, art. 2 (eerste omschrijving als lijn, o.a. "langs de westelijke zijde van den eersten rijweg" tussen de Kwattaweg en de Gemeenelandsweg); en het inzetkaartje Stadsgrens en verdeeling in Wijken (1:40.000) op de kaart van 1916–17 (<https://hdl.handle.net/11245/3.38611>). Voor 1862–1894 is geen omschrijving gevonden.*

Buiten de Tweede Buitenwijk valt 99,8% van de locatiepunten binnen de grens van de eigen wijk. In de TBW liggen 44 van de 440 punten buiten de getekende wijkgrens.

## Licentie

Deze dataset valt onder de licentie [Creative Commons Naamsvermelding 4.0 Internationaal (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/deed.nl). De kaarten van 1885 en 1916–17 zelf zijn publiek domein.

## Citeren

Van Oort, T. (2026). *Locatiepunten Paramaribo 1885* (versie 1.0). Suriname Time Machine. DataverseNL (HDSC). [DOI]

## Gebruik van AI

Bij het samenstellen van dit publicatiepakket is AI (Claude, Anthropic) gebruikt: voor het omzetten van het QGIS-bestand naar CSV/GeoJSON met Nederlandse veldnamen, het doorvoeren van enkele kleine datacorrecties en het opstellen van deze README. De locatiepunten zelf, de adressen en de beschrijvingen zijn door mensen gemaakt. Alle stappen waarbij AI is gebruikt, zijn gecontroleerd door Thunnis van Oort.

## Contact

Thunnis van Oort, KNAW Humanities Cluster / Huygens Instituut, thunnis.van.oort@huygens.knaw.nl
