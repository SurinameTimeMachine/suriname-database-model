# Locatiepunten Paramaribo 1885 (Paramaribo address locations, 1885)

**Version 1.0 (draft, 9 November 2026). The DOI will follow after publication in DataverseNL.**

## What is this?

A point dataset of 3,105 location points of *erven* (urban plots) in Paramaribo, Suriname, in 1885.
3,002 of them are addresses (`punttype` = `adres`): they carry the 1885 address (district letter +
house number + optional suffix) and usually the 1885 street name. The remaining 103 are district labels
(`punttype` = `wijklabel`): points with only a district letter, without a house number and sometimes
without a street name, usually marking a large building or site. Where known, the use or function of the
plot in 1885 and 1916 is included.

The points are based on the *Figuratieve plattegrond der stad Paramaribo* ("Figurative plan of the town
of Paramaribo") by A.J. Meyer (Paramaribo, 1885; Allard Pierson, University of Amsterdam,
HB-KZL 108.03.21, <https://hdl.handle.net/11245/3.39624>). Meyer, a tax official, drew on nine sheets
all plots in the town and the 604 plots in the two outer districts, sometimes with their use. As far as
we know, this is the oldest source that shows exact addresses on a plan of Paramaribo.

With these points you can approximately map historical addresses from Surinamese sources (district
registers, civil registers, almanacs, censuses), and visualise city-wide data at address level. The
dataset is part of the Suriname Time Machine (<https://www.surinametijdmachine.org>).

The data files keep their original Dutch field names and values. This README explains them in English;
see also the glossary at the end.

## Files

| File | Contents |
|---|---|
| `data/locatiepunten_paramaribo_1885.csv` | One row per point, WGS84 coordinates (lon/lat), UTF-8 |
| `data/locatiepunten_paramaribo_1885.geojson` | The same data as GeoJSON (RFC 7946, CRS84) |
| `data/straten_paramaribo_1885.geojson` | Street lines according to the 1885 map (171 segments) |
| `data/straten_paramaribo_1916.geojson` | Street lines according to the 1916–17 map (165 segments) |
| `data/wijkgrenzen_paramaribo_1885.geojson` | Boundaries of the 8 districts (*wijken*) of 1885 (A–F, EBW, TBW) |
| `README.md` | This description (English) |
| `README.nl.md` | Description in Dutch |
| `CITATION.cff` | Citation information |
| `docs/voorbeeld_blad74_wijkA_HB-KZL-108-03-21.jpg` | Example: sheet 74 (district A) of the 1885 map, Allard Pierson UvA |

## Fields (location points)

| Field | English | Description |
|---|---|---|
| `lp_id` | location point id | Persistent identifier, `stm-1885-address-NNNN` (NNNN = order in the source file) |
| `uri` | URI | URI in the STM gazetteer: `https://data.surinametijdmachine.org/place/{lp_id}` |
| `bron_fid` | source fid | Sequence number of the point in the original QGIS file (export 19-06-2026). Omitted points leave a gap in the numbering |
| `wijk_1885` | district 1885 | District letter 1885 (A–F) or outer district (EBW = *Eerste Buitenwijk*, First Outer District; TBW = *Tweede Buitenwijk*, Second Outer District) |
| `huisnummer_1885` | house number 1885 | House number 1885 |
| `toevoeging_1885` | suffix 1885 | Suffix (a, b, c ...) |
| `adres_1885` | address 1885 | Combined 1885 address, e.g. `A44` |
| `straatnaam_1885` | street name 1885 | Street name according to the 1885 map |
| `beschrijving_1885` | description 1885 | Function/building according to the legend of the 1885 map (in Dutch) |
| `beschrijving_1916` | description 1916 | Function/building according to the map *Paramaribo* 1916–17 (Opnemingsdienst van Suriname, Survey Department of Suriname) (in Dutch) |
| `legenda_1885` | legend 1885 | Legend number/letter on the 1885 map |
| `legenda_1916` | legend 1916 | Legend code on the 1916 map |
| `redactioneel_commentaar` | editorial comment | Note by the maker, in Dutch, e.g. "Ligging gegokt" (location guessed) |
| `punttype` | point type | `adres` (address, 3,002) or `wijklabel` (district label, 103: point with only a district letter, without house number; usually a large building or site) |
| `lon`, `lat` | | Coordinates WGS84 (EPSG:4326), 7 decimals |

## Streets 1885 and 1916

Two line files give the street plan according to the maps of 1885 and 1916–17, as context for the
location points. Fields:

| Field | English | Description |
|---|---|---|
| `straat_id` | street id | Identifier per segment, `stm-1885-street-NNN` or `stm-1916-street-NNN` (NNN = order in the source) |
| `naam` | name | Street name as on the map. `[naamloos]` (nameless) = street shown on the map without a name; empty = name not entered |
| `kaartjaar` | map year | 1885 or 1916 |
| `bron_fid` | source fid | Sequence number in the original QGIS file |

A street can consist of several segments. In the 1885 layer, 45 of the 171 segments have no name
entered. Three lines from the source file were omitted: one without coordinates (bron_fid 3, Weg naar
Zee) and two exact duplicates of the Noorderkerkstraat (bron_fid 171 and 172); the numbering of the
other ids is unchanged.

**Note:** the 1885 lines follow the 1916–17 street plan. Because the 1885 map is schematic, only its
street names were taken over and placed on the 1916 streets. The geometry of the 1885 layer therefore
says nothing about the exact position of streets in 1885.

## District boundaries 1885

`wijkgrenzen_paramaribo_1885.geojson` contains the boundaries of the six inner districts (*binnenwijken*
A–F) and the two outer districts (*buitenwijken* EBW and TBW), with the field `wijk_1885`. It is not known
who drew the polygons.

**Inner districts A–F and First Outer District: boundaries according to the source.** These boundaries
follow the *Wet van den 24sten April 1837, houdende voorbereidende bepalingen tot invoering eener nieuwe
Wijkverdeeling voor de Stad Paramaribo en haren omtrek* (Law of 24 April 1837 on a new district division
of the town of Paramaribo and its surroundings; *Gouvernementsblad* (Government Gazette) Suriname 1837
no. 3, art. 3 and 4). It describes the districts by streets and waterways; for example district A: to the
east the Suriname river, to the north the Sommelsdijkse kreek up to the Laan van Tourtonne, to the west the
Heiligeweg (including the Knuffelsgracht) and to the south the Klipstenenstraat. The First Outer District
(Combé) is bounded to the east and north by the Suriname river and the *Divisie Para* (Para division). By
notification of 10 January 1860 (G.B. 1860 no. 1) the southern boundary of district F was moved to the
Dominékreek. A check against the 1916 street plan confirms the boundaries we could test (Keizerstraat,
Klipstenenstraat, Heiligeweg, Zwartenhovenbrugstraat and Wanicastraat). The resolution of 18 December
1869 (*Surinaamsche Courant*, Government advertisement section; Delpher
[ddd:011194077](https://resolver.kb.nl/resolve?urn=ddd:011194077:mpeg21)) confirms that this division
was still in force then ("met behoud van de bestaande indeeling", retaining the existing division).

**Second Outer District (TBW): an estimate.** From 1860 the TBW comprised all plots west of the
Wanicastraat belonging to the *stadsdistrict* (town district). Its outer (northern and western) boundary
is that of the town district, which was not defined as a line until 1894.[^tbw] The TBW polygon follows
this later boundary (1894/1916) and is therefore an estimate for 1885: points along the Weg naar Zee, the
Charlesburg road and the Kwatta road fall outside it, although they may have belonged to the TBW in 1885.

[^tbw]: Sources: Law of 24 April 1837 (G.B. 1837 no. 3, art. 4: TBW = plots west of the Wanicastraat
and south of the Gemeene Landsweg); notification of 10 January 1860 (G.B. 1860 no. 1: "alle bebouwde en
onbebouwde erven ten westen der Wanicastraat, tot het Stads District behoorende"); regulation on the
divisions of 1 March 1842 (G.B. 1842 no. 3, art. 4: the Divisie Para excludes "de Stad Paramaribo en
haren omtrek", undefined); Royal Decree of 21 December 1862 no. 26 (G.B. 1863 no. 3, art. 12 and 16: the
town district is the town with its outer districts, the Hermitage estate and the grounds along the Kwatta
road up to and including Oldenburg); Gouvernementsblad 1894, art. 2 (first description as a line, a.o.
"langs de westelijke zijde van den eersten rijweg" between the Kwattaweg and the Gemeenelandsweg); and the
inset map *Stadsgrens en verdeeling in Wijken* (1:40,000) on the 1916–17 map
(<https://hdl.handle.net/11245/3.38611>). No description was found for 1862–1894.

The original layer is in Zanderij / Suriname TM (EPSG:31171); the build script converts it to WGS84. As
a check: 99.9% of the location points fall within the boundary of their own district, except in the
Second Outer District. **In the TBW, 45 of the 441 points lie outside the drawn district boundary**,
because the points there were placed more widely and the boundary is an estimate.

## How was the dataset made?

Meyer's map is schematic: the plots are not drawn to scale. The house numbers do show where addresses lay
relative to each other within a block. The points were placed as follows:

1. The schematic 1885 map was laid over the much more accurate map *Paramaribo* of 1916–17, made by the
   Opnemingsdienst van Suriname (Survey Department of Suriname) (<https://hdl.handle.net/11245/3.38611>).
2. Within each block, the addresses were placed in order along the street. Each point lies just behind
   the street line, on the plot side.
3. In case of doubt, the Concordans Paramaribo by Dr. Muntjewerff
   (<https://www.concordansparamaribo.info/>) and the *wijkregisters* (district registers) were used to
   determine the position. No data from the concordance itself is included in this dataset.
4. The fields `beschrijving_1885` and `legenda_1885` come from the legend of the 1885 map, and
   `beschrijving_1916` and `legenda_1916` from the 1916–17 map.
5. The points were made in QGIS between 2021 and 2026 by Thunnis van Oort (ORCID
   [0000-0001-8912-0508](https://orcid.org/0000-0001-8912-0508)). The export of 19 June 2026
   (`data/08-place-points-qgis/export20260619/locatiepunten1885.geojson` in the repository
   `SurinameTimeMachine/suriname-database-model`) is the basis of this version and is kept there unchanged.

The field `punttype` is derived from the points' own address fields. The `lp_id`s correspond to the
records of type `historical-address` in the STM gazetteer. Note: the gazetteer (still) contains the
original addresses from the QGIS export, including the points omitted here. For the six points with an
a/b correction (B230, B258, E42), a join on `lp_id` therefore gives a different address than in this
dataset.

## Accuracy: read this before use

- **The points are approximations, not surveyed positions.** They show roughly where an address lay and
  how addresses within a block lay relative to each other.
- The points are more accurate in the centre than in the outer districts (EBW, TBW), where the exact
  position of an address is sometimes unknown. See also `redactioneel_commentaar`, e.g. "Ligging gegokt"
  (location guessed).
- The dataset says nothing about plot size or the number of dwellings per plot. Especially in the inner
  town, one plot often held several dwellings, including former slave quarters on the back plots.
- The accuracy is sufficient for approximately locating addresses and for city-level visualisations. The
  dataset is not suitable for analyses at plot or metre level.

## Known limitations

- The position of a number of points is estimated ("Ligging gegokt" in `redactioneel_commentaar`).
- The northern and western boundaries of the TBW polygon are an estimate (see above).

## Licence

This dataset is licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/). The 1885 and 1916–17 maps themselves are in the public domain.

## How to cite

Van Oort, T. (2026). *Locatiepunten Paramaribo 1885* (version 1.0). Suriname Time Machine.
DataverseNL (HDSC). https://doi.org/10.34894/... [TODO DOI after publication]

## Use of AI

AI (Claude, Anthropic) was used in compiling this publication package: converting the QGIS file to
CSV/GeoJSON with Dutch field names, applying a few data corrections, searching the Government
Gazettes for the district boundaries, and drafting this README. The location points themselves, the
addresses and the descriptions were made by people. All AI-assisted steps were checked by Thunnis van
Oort.

## Contact

Thunnis van Oort, KNAW Humanities Cluster / Huygens Institute, thunnis.van.oort@huygens.knaw.nl

## Glossary of Dutch terms

| Dutch | English |
|---|---|
| *erf* (pl. *erven*) | urban plot, yard |
| *wijk* | (town) district / ward |
| *binnenwijk* | inner district (A–F) |
| *buitenwijk*; *Eerste/Tweede Buitenwijk* (EBW/TBW) | outer district; First/Second Outer District |
| *wijkregister* | district register (population register per district) |
| *stadsdistrict* | town district (administrative district of Paramaribo) |
| *divisie* | division (rural administrative unit, before 1863) |
| *Gouvernementsblad* (G.B.) | Government Gazette of Suriname |
| *plantage*, *grond* | plantation, estate/ground |
| *straat*, *weg*, *rijweg*, *laan* | street, road, carriage road, avenue/lane |
| *gracht*, *kreek* | canal, creek |
| *Opnemingsdienst van Suriname* | Survey Department of Suriname |
| *naamloos* | nameless |
| *ligging gegokt* | location guessed |
