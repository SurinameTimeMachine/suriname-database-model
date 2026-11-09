# Locatiepunten Paramaribo 1885

**Versie 1.0 (concept, 9 november 2026). De DOI volgt na publicatie in DataverseNL.**

## Wat is dit?

Een puntenbestand van 3.105 locatiepunten van erven in Paramaribo in 1885. 3.002 daarvan zijn adressen
(`punttype` = `adres`): ze hebben het adres van 1885 (wijkletter + huisnummer + eventuele toevoeging) en
meestal de straatnaam van 1885. De overige 103 zijn wijklabels: punten met alleen een wijkletter, zonder
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
| `data/straten_paramaribo_1885.geojson` | Straatlijnen volgens de kaart van 1885 (174 segmenten) |
| `data/straten_paramaribo_1916.geojson` | Straatlijnen volgens de kaart van 1916–17 (165 segmenten) |
| `data/wijkgrenzen_paramaribo_1885.geojson` | Grenzen van de 8 wijken van 1885 (A–F, EBW, TBW) |
| `README.md` | Deze beschrijving |
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
| `punttype` | `adres` (3.002) of `wijklabel` (103: punt met alleen een wijkletter, zonder huisnummer; meestal een groot gebouw of terrein) |
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

Een straat kan uit meerdere segmenten bestaan. In de laag van 1885 hebben 45 van de 174 segmenten
geen naam ingevoerd.

**Let op:** de lijnen van 1885 volgen het stratenplan van 1916–17. Omdat de kaart van 1885 schematisch
is, zijn alleen de straatnamen van die kaart overgenomen en op de straten van 1916 gezet. De geometrie
van de 1885-laag zegt dus niets over de exacte ligging van straten in 1885.

## Wijkgrenzen 1885

`wijkgrenzen_paramaribo_1885.geojson` bevat de grenzen van de zes binnenwijken (A–F) en de twee
buitenwijken (EBW, TBW), met het veld `wijk_1885`. De grenzen zijn mogelijk gebaseerd op de
wijkverdeling die het gouvernement in december 1869 publiceerde (*Surinaamsche Courant*,
Gouvernementsadvertentieblad, publicatie van 18 december 1869 no. 5; Delpher
[ddd:011194077](https://resolver.kb.nl/resolve?urn=ddd:011194077:mpeg21)). Die herkomst is niet zeker.

De oorspronkelijke laag staat in Zanderij / Suriname TM (EPSG:31171). Het build-script zet hem om naar
WGS84. Ter controle: van de locatiepunten valt 99,9% binnen de grens van hun eigen wijk, met
uitzondering van de Tweede Buitenwijk. **In de Tweede Buitenwijk (TBW) liggen 45 van de 441 punten
buiten de formele wijkgrens**, omdat de punten daar ruimer zijn geplaatst.

## Hoe is de dataset gemaakt?

De kaart van Meyer is schematisch: de erven zijn niet op schaal getekend. De huisnummers laten wel zien
waar de adressen ten opzichte van elkaar in een bouwblok lagen. Zo zijn de punten geplaatst:

1. De schematische kaart van 1885 is gelegd over de veel nauwkeurigere kaart *Paramaribo* van
   1916–17, vervaardigd door den Opnemingsdienst van Suriname (<https://hdl.handle.net/11245/3.38611>).
2. Per bouwblok zijn de adressen op volgorde langs de straat gezet. Elk punt staat net achter de
   straatlijn, aan de kant van het erf.
3. Bij twijfel zijn de Concordans Paramaribo van Dr. Muntjewerff
   (<https://www.concordansparamaribo.info/>) en de wijkregisters gebruikt om de positie te bepalen.
   Gegevens uit de concordans zelf zitten niet in deze dataset.
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

## Correcties ten opzichte van de QGIS-export

Het script `scripts/locatiepunten1885/build_publicatie.py` in de repository maakt deze bestanden uit
de ongewijzigde QGIS-export. Daarbij zijn de volgende correcties gedaan:

- 2 punten zonder geometrie zijn weggelaten (fid 2627 en 2630).
- 36 punten zonder wijkletter zijn weggelaten. Het gaat om 33 annotaties van de kaart van 1916, zoals
  plantages en instellingen aan de rand van de stad, en 3 lege punten.
- Voor B230, B258 en E42 stonden twee punten met hetzelfde adres. Die punten zijn terecht, maar de
  toevoeging ontbrak. Het punt dat het dichtst bij het vorige huisnummer ligt heeft nu `a`, het
  andere `b`.
- De velden beschrijving 1854, toevoeging 1837 en bioscoopnaam uit de export zijn niet opgenomen.
- Bij de straten zijn alleen witruimte in namen opgeschoond en lege namen leeg gelaten; de geometrie is ongewijzigd.

## Bekende beperkingen

- De ligging van een aantal punten is geschat ("Ligging gegokt" in `redactioneel_commentaar`).

## Licentie

Deze dataset valt onder de licentie [Creative Commons Naamsvermelding 4.0 Internationaal (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/deed.nl). De kaarten van 1885 en 1916–17 zelf zijn publiek domein.

## Citeren

Van Oort, T. (2026). *Locatiepunten Paramaribo 1885* (versie 1.0). Suriname Time Machine.
DataverseNL (HDSC). https://doi.org/10.34894/... [TODO DOI na publicatie]

## Gebruik van AI

Bij het samenstellen van dit publicatiepakket is AI gebruikt (Claude, Anthropic): het omzetten van het
QGIS-bestand naar CSV/GeoJSON met Nederlandse veldnamen, het doorvoeren van de hierboven genoemde correcties en het
opstellen van deze README. De locatiepunten zelf, de adressen en de beschrijvingen zijn door mensen
gemaakt. Alle door AI gemaakte stappen zijn door Thunnis van Oort gecontroleerd.

## Contact

Thunnis van Oort, KNAW Humanities Cluster / Huygens Instituut, thunnis.van.oort@huygens.knaw.nl
