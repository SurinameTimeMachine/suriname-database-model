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
