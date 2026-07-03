# Concordans Paramaribo First Data Analysis

Input file: /home/thunnis/Projecten/STM/concordans paramaribo/Concordans Paramaribo 2022 (orig as csv).csv

## Main finding

The CSV export does not contain the calculated values for formula-backed cells, but the address can be reconstructed from the component columns in the export.

## Field coverage

- Total rows: 5391
- Rows with 2022 formula-derived address: 5279
- Rows with 1921 address: 5306
- Rows with 1885 address cell filled in CSV: 2324
- Rows with 1837 address: 5320
- Rows with 1817 address: 5342
- Rows with 1885 street name: 5288
- Rows with 1837 street name: 5129
- Rows with 1830 street name: 3942
- Rows with split marker: 43
- Rows with new marker: 170

## 1885 comparison

- Exact 1885 cell/derived matches: 0
- Formatting-only 1885 differences: 2324
- Derived-only 1885 rows (cell missing, reconstructable): 9
- Real 1885 mismatches after normalization: 0

## Sample values

- 2022: Henck Arron straat | Grote Combé weg | Watermolen straat | Heiligen weg | Jodenbree straat | mr.dr. J.C. de Miranda straat | Maagden straat | Neumann pad
- 1921: Gravenstraat   2 | Gravenstraat   4 | Grote Combeweg   1 | Grote Combeweg   3 | Grote Combeweg   5 t/m 11 | Grote Combeweg  13 t/m 27 | Watermolenstraat   3 | Heiligeweg   3
- 1885 cell: F.  8 | F.  9 | F. 10 | F. 11 | F. 12 | F. 13 | F. 14 | F. 15
- 1885 derived: F 8 | F 9 | F 10 | F 11 | F 12 | F 13 | F 14 | F 15
- 1837: A.  1 | A.  1a | A.  1b | A.219 | C.  1 | C. 95 | A.108 | A.217
- 1817: A.  1 | B.  3 | C.  2 | D.  1 | A.  2 | B.  5 | C.  4 | D.  2
- 1885 streets: Gravenstraat | Watermolenstraat | Heiligeweg | Jodenbreestraat | Oranjestraat | Domineestraat | Klipstenenstraat | Heerenstraat
- 1837 streets: Gravenstraat | Watermolenstraat | Heiligeweg | Jodenbreestraat | Oranjestraat | Domineestraat | Klipstenenstraat | Heerenstraat
- 1830 streets: Gravenstraat | Watermolenstraat | Heiligeweg | Jodenbreestraat | Klipstenenstraat | Het Plein | Heerenstraat | Keizerstraat
- Normalized 1885 cell: f8 | f9 | f10 | f11 | f12 | f13 | f14 | f15
- Normalized 1885 derived: f8 | f9 | f10 | f11 | f12 | f13 | f14 | f15

## Immediate implications

- The first normalization target should be the 1885 address layer.
- The 2022 address column must be reconstructed from the street, number, and suffix columns.
- 1837 and 1921 remain the major transition layers for the later matching logic.
- Street names are useful secondary hints, not the primary anchor.
- Splits and merges need explicit relationship modeling later.