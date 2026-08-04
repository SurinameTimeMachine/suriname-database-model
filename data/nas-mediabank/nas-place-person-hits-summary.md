# NAS Place/Person Hits Summary

- NAS records scanned: 2531
- Total hit rows: 10381
- NAS records with >=1 hit: 2228
- High-precision rows: 1681

## By hit type
- person: 7789
- place: 2592

## By category
- person: 7789
- plantation: 1773
- river: 487
- street: 310
- district: 18
- creek: 4

## By review bucket
- needs-review: 7637
- high-precision: 1681
- ambiguous: 1063

## By source
- heuristic-capitalized-sequence: 6931
- stm-gazetteer: 1877
- nas-persons-field: 858
- plantages-dataset: 405
- paramaribo-street-standardization: 310

## Notes
- Place hits use exact normalized phrase matching against STM + street dictionaries.
- Person hits use explicit NAS persons field (high-precision) plus a conservative name heuristic.