# WIP: Ambigue Plantagenamen en Wikidata-varianten (2026-04-14)

## Wat is toegevoegd

1. Overzicht van ambigue plantagenamen op basis van de gazetteer (work in progress).
- Exacte dubbels met verschillende locaties.
- Fuzzy/bijna-identieke naamparen met verschillende locaties.
- Wide-overzicht (1 regel per cluster) met:
  - varianten;
  - samenvatting van locaties;
  - samenvatting van bekende schrijfwijzen;
  - locaties als afzonderlijke kolommen;
  - variantCount en recordCount achteraan.

2. Export van Wikidata-plantages met labels/aliassen (work in progress).
- Bestand staat in `app/lod/wikidata_plantations_labels_aliases.csv`.

## Belangrijkste bestanden

- Scripts:
  - `app/scripts/generate-duplicate-names-report.ts`
  - `app/scripts/generate-fuzzy-duplicate-names-report.ts`
- Outputs:
  - `app/lod/duplicate-names.csv`
  - `app/lod/duplicate-names.json`
  - `app/lod/fuzzy-duplicate-names.csv`
  - `app/lod/fuzzy-duplicate-names.json`
  - `app/lod/fuzzy-duplicate-names-wide.csv`
  - `app/lod/wikidata_plantations_labels_aliases.csv`

## Korte TODO-lijst

- Handmatige kwaliteitscontrole van de ambigue naamclusters (false positives/negatives).
- Fuzzy-threshold en normalisatie verder tunen (bijv. hoofdletters, accenten, leestekens, lidwoorden).
- Wikidata-export vergelijken met STM-gazetteer voor disambiguatie en ontbrekende schrijfwijzen.
- Beslissen welke output als canonieke review-input geldt voor vervolgstappen.
