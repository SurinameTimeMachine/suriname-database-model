# RCE Beeldbank: images linked to STM places

Input for `scripts/rce_beeldbank/build_rce_images.py`, which writes `data/rce-images.jsonld`.

- `rce-koppelvoorstel.csv` — link proposal of 27 November 2026 (column names in Dutch). One row per candidate link between an RCE place (an address in the RCE image bank) and an STM location. Columns: `niveau` (level: `pand (1885-punt)` = 1885 address point, `straat` = street 1885/1916, `plaats` = gazetteer place, plus HDSC street list and OpenStreetMap rows that are not used for the snapshot), `methode` (method), `zekerheid` (certainty: `waarschijnlijk` = probable, `mogelijk` = possible).

## Rules for the snapshot

- Each image is linked **once**, to the most specific level available: 1885 address point > street 1885 > street 1916 > gazetteer place (decision Thunnis van Oort, 27 Nov 2026).
- RCE places that could not be linked (problem cases) are not included.
- Building-level links go via the Concordans Paramaribo (Dr. Muntjewerff) and **assume** that RCE house numbers (photographs 1960–1999) follow the 1921 or 2022 numbering. They are marked `possible` and need checking. No concordance address values are written to the snapshot.
- Street segments (`stm-1885-street-NNN`, `stm-1916-street-NNN`, from the publication *Paramaribo historical address locations, 1885*, doi:10.34894/UNFLPK) are not in the gazetteer yet, so street-level images have no `P138_represents`; the street name and segment ids are stored instead.
- Some aliases were added by hand: Oranjeplein → Gouvernementsplein, Zeelaandiaweg → Zeelandiaweg, Drambrandersgracht → Straat langs de Drambrandersgracht Zuid (assumptions by Claude, not from a source); Anton de Komstraat = Pontenwerfstraat and Sophie Redmondstraat = Steenbakkersgracht (given by Thunnis van Oort).

Source data: RCE linked data, dataset `rce/afbeeldingen` (https://data.cultureelerfgoed.nl/rce/afbeeldingen), images CC BY-SA 3.0/4.0.
