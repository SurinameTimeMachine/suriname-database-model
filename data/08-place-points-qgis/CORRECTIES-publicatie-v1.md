# Publicatie v1: correcties ten opzichte van de QGIS-export (intern)

Niet opgenomen in de gepubliceerde documentatie (`publicatie-v1/README*.md`); bedoeld voor intern gebruik.

## Correcties

Het script `scripts/locatiepunten1885/build_publicatie.py` in de repository maakt deze bestanden uit
de ongewijzigde QGIS-export. Daarbij zijn de volgende correcties gedaan:

- 2 punten zonder geometrie zijn weggelaten (fid 2627 en 2630).
- 36 punten zonder wijkletter zijn weggelaten. Het gaat om 33 annotaties van de kaart van 1916, zoals
  plantages en instellingen aan de rand van de stad, en 3 lege punten.
- Voor B230, B258 en E42 stonden twee punten met hetzelfde adres. Die punten zijn terecht, maar de
  toevoeging ontbrak. Het punt dat het dichtst bij het vorige huisnummer ligt heeft nu `a`, het
  andere `b`.
- De velden beschrijving 1854, toevoeging 1837 en bioscoopnaam uit de export zijn niet opgenomen.
- Bij de straten zijn witruimte in namen opgeschoond en lege namen leeg gelaten; in de laag van 1885 zijn één lijn zonder coördinaten en twee dubbele lijnen weggelaten. De geometrie is verder ongewijzigd.
- Adresconflicten (adres1885 ≠ wijk + huisnummer + toevoeging), besluit Thunnis van Oort 9-11-2026:
  B100 (huisnummer 93 → 100), D51 (toevoeging b vervalt), F92 (adres aangevuld), F28a (toevoeging a;
  volgt na F28), F150b (wijk TBW → F), TBW349b (was TMW349b), TBW6fa/TBW6fb (toevoeging fa/fb).
- Huisnummer aangevuld uit adres1885 bij F206, F54b en F457a (waren daardoor als wijklabel geteld).
- Wijklabel "Politiewacht": wijk A → EBW (grensgeval).
- Het build-script controleert nu dat adres1885 gelijk is aan wijk + huisnummer + toevoeging.
- Wijkgrenzen: de oorspronkelijke laag staat in Zanderij / Suriname TM (EPSG:31171); build_publicatie.py zet hem om naar WGS84 (CRS84) met een eigen inverse transverse Mercator + Helmert-transformatie.
