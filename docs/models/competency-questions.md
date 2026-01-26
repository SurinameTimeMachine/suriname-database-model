# Competency questions

Questions the database must answer. Used to validate the model.

---

## Person queries

P01. who was enslaved at plantation X in year Y
P02. what names did person X have over time
P03. who were the parents of person X
P04. who were the children of person X
P05. what was the occupation/skill of person X
P06. when and where was person X born
P07. when and where did person X die
P08. what was the cause of death of person X
P09. who witnessed documents for person X
P10. what legal status did person X have at time T
P11. who owned person X at time T (if enslaved)
P12. when was person X manumitted
P13. what family relationships appear in records for X
P14. what godparents/godchildren did person X have
P15. trace person X across multiple sources
P16. what documents mention person X
P17. what events involved person X

---

## Place queries

L01. where was plantation X located
L02. what was plantation X called in year Y
L03. who owned plantation X in year Y
L04. what boundary did plantation X have in year Y
L05. what buildings existed at place X
L06. what maps show place X
L07. how did place name change over time
L08. what places were near X
L09. what events happened at place X
L10. what people lived at place X
L11. what people were enslaved at place X
L12. what people died at place X
L13. what type of place is X (plantation, city, etc)
L14. what places match modern coordinates

---

## Source queries

S01. what type is source X (register, certificate, map)
S02. who created source X
S03. when was source X created
S04. where is source X held now
S05. what archive reference does X have
S06. what is the condition of source X
S07. what people appear in source X
S08. what places appear in source X
S09. is source X transcribed
S10. what language is source X in
S11. how reliable is source X

---

## Cross-source linking

X01. find records in different sources referring to same person
X02. reconcile conflicting information about person X
X03. trace person through life events across sources
X04. link manumission record to slave register entry
X05. link death certificate to earlier records
X06. link plantation across maps from different years
X07. find same person with different name spellings
X08. find family members across sources
X09. compare descriptions of same place in different sources

---

## Aggregation queries

A01. count enslaved people at plantation X over time
A02. count manumissions by year
A03. count deaths by cause
A04. average age at death by decade
A05. most common names by period
A06. most common occupations
A07. geographic distribution of events
A08. people per plantation over time

---

## Hard questions

H01. did person X in source A equal person Y in source B

- needs probabilistic answer, not yes/no
- must explain reasoning

H02. where exactly was plantation X

- different maps show different locations
- boundaries changed over time
- must handle uncertainty

H03. who were the ancestors of person X

- often incomplete
- different sources disagree
- must show chain of evidence

H04. what happened to people from plantation X after emancipation

- requires cross-source linking
- name changes common
- many gaps

H05. reconstruct family tree

- combine evidence from multiple sources
- handle contradictions
- show confidence levels

H06. what can we say about person X

- aggregate everything we know
- rank by confidence
- show sources for each claim

H07. trace location name through time

- same place, many names
- different languages (Dutch, Sranan)
- formal vs informal names

H08. what people share characteristics

- clustering queries
- fuzzy matching
- demographic analysis

H09. what's the provenance of claim X

- who said this, when, in what source
- chain of interpretation

See [docs/models/provenance-chain-checklist.md](docs/models/provenance-chain-checklist.md) for the step-by-step metric and chain templates.

H10. how did plantation workforce change

- longitudinal analysis
- requires linking people over time

H11. uncertainty in dates

- "about 1780" vs "1780-01-15"
- ranges, approximations
- must propagate through queries

H12. same name, different people

- disambiguation
- contextual evidence
- probabilistic

---

## Query complexity

| type    | difficulty    | why                       |
| ------- | ------------- | ------------------------- |
| P01-P17 | simple        | single table or join      |
| L01-L14 | simple-medium | some need temporal joins  |
| S01-S11 | simple        | metadata queries          |
| X01-X09 | hard          | fuzzy matching, reasoning |
| A01-A08 | medium        | aggregation, grouping     |
| H01-H12 | very hard     | uncertainty, inference    |

Model must support simple queries efficiently. Hard queries may need special handling.

---

## Testing plan

For each query type:

- write SQL equivalent
- identify tables/joins needed
- test with sample data
- document edge cases

Start with P01-P17 since most common. Then L queries. Leave H queries for later since may need special tools.
