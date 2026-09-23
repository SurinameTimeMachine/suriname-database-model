# Enslaved-PiCo Modeling Guidelines

Reference summary of the Enslaved-PiCo ontological framework for this project,
based on Mourits et al. (2026), *"Modelling the enslaved as historical persons
using the Persons in Context (PiCo) model: The development of 'enslaved-PiCo'"*
(IISH / Huygens / Radboud / KNAW Humanities Cluster).

Source text: `data/Modelling the enslaved as historical persons_version23-9-26.txt`
(upstream PDF: `data/Modelling the enslaved as historical persons_version23-9-26.pdf`).

## 1. Core principle

Enslaved persons are modeled as **full historical person observations**
(`picom:PersonObservation`), never as property, cargo, or abstract counts.
PiCo-M's observation/reconstruction split is the ethical mechanism: each
observation stays close to its source record, so uncertainty from linkage is
visible and every user can audit which observations were grouped into a
reconstruction.

Concentric description order (PiCo-M logic): reuse Schema.org first, then
domain vocabularies (Enslaved.org, PNV, IISG thesauri), then Wikidata for
organization typing — introduce new terms only as a last resort.

## 2. Observations vs reconstructions

- `picom:PersonObservation` — one source record, one observation. All v1
  ingestion in this project emits observations only.
- Person reconstruction — a cluster of linked observations referring to one
  unique individual. Only group observations when linkage evidence is explicit
  (e.g. `sdo:sameAs` across an emancipation's enslaved/free pair); never merge
  automatically on name similarity alone.
- If a dataset's relation to its sources is lost or heavily interpreted, model
  it as a reconstruction, not an observation (§4.1 of the spec).

## 3. Direct relationships (preferred over InterAgentRelationship)

PiCo-M relates persons with direct properties. Enslaved.org's
`InterAgentRelationship` indirection (relation node + controlled-vocabulary
type) is **not** reused. Use:

| Relation | Direction | Notes |
|---|---|---|
| `enper:isEnslavedBy` | enslaved → enslaver/org | temporal: `sdo:startDate` / `sdo:endDate` on a blank node with `rdf:value` |
| `enper:isEnslaverOf` | enslaver/org → enslaved | mirror of the above |
| `iisg:isLegallyRepresentedBy` | person → representative | straatvoogden, spouses *nomine uxoris*, guardians |
| `iisg:legallyRepresents` | representative → person | mirror of the above |
| `sdo:parent` / `sdo:children` | child ↔ parent | as stated in the source |
| `sdo:spouse` | partner ↔ partner | incl. `picom:isWidOf` where stated |
| `sdo:sameAs` | observation ↔ observation | emancipation/manumission duality, name changes |

Temporal relations use reified blank nodes:

```turtle
example:Person1 enper:isEnslavedBy [
  rdf:value example:Person3 ;
  sdo:startDate "1851"^^xsd:gYear ;
  sdo:endDate "1863"^^xsd:date ;
] .
```

## 4. Person status

Property `enslaved:hasPersonStatus` (`enslaved:P33`); use only three of the
seven Enslaved.org categories:

- `enslaved:Q109` — Enslaved Person
- Free Person (Enslaved.org URI)
- Liminal Status Person (Enslaved.org URI)

Default rule: assert `EnslavedPerson` only when the source states or implies
it (register type, enslaver relation, status field). Do **not** infer status
for kin (e.g. a mother named in a slave register is not automatically
enslaved). Observation reasons use `enslaved:P30` (`hasEventType`) with the
Enslaved.org 27-event list (Birth, Death, Emancipation or Manumission,
Registration, …), bounded by start/end dates (§3.5).

## 5. Social identity, age, names

- `enper:hasSocialIdentity "..."@nl` — catch-all for social categorisation
  (race, colour, caste, class, religion intersections). Prefer over
  `enslaved:hasRaceOrColor` (too narrow). Keep source spelling, e.g.
  `"kleurling"@nl`, `"zwart"@nl`. Colonial bias note: these are *source
  attestations*, never project-endorsed classifications.
- `enslaved:hasAgeCategory` (`enslaved:P4`) — `Infant` / `Child` / `Adult` /
  `Older Person` (Q-codes per Enslaved.org). Never use `picom:hasAge` for
  broad categories; exact ages use `sdo:` birth-date fields.
- Names via Schema.org + PNV: `sdo:name`, `sdo:givenName`, `sdo:familyName`,
  `pnv:nameSpecification` for compound/descriptive elements, PNV toponym
  extension for place-based name parts. Emancipation = two observations
  (enslaved-before / free-after) joined by `sdo:sameAs` (§3.6).

## 6. Group observations

- `enper:GroupObservation` + `enper:groupSize "N"^^xsd:integer` for
  enumerations that cannot be individualised.
- A GroupObservation **must never replace** a `picom:PersonObservation`;
  it complements person-level data. Related groups may join via
  `GroupReconstruction` (ROAR logic).
- Where enumerations carry descriptive data (age/sex/social identity),
  prefer nameless individual `picom:PersonObservation`s over groups (§3.8).

## 7. Organizations as enslavers

- Plantations, churches, companies: `sdo:Organization` with
  `sdo:additionalType wdt:Q188913` (plantation) or equivalent Wikidata type.
- Staff/owners: `sdo:owns`, `sdo:employee`, `sdo:affiliation`,
  `sdo:hasOccupation "..."@nl`.
- Enslavement by an organization uses `enper:isEnslavedBy` /
  `enper:isEnslaverOf` — never `sdo:owns` for the enslaved.
- Transports (out of scope for v1): `sdo:TravelAction` with
  `enper:MainVoyage` / `enper:SubVoyage`, enslaved as `sdo:agent`
  (never `sdo:object`), `enper:transportedPersons` (§3.13).

## 8. Provenance (mandatory)

Every inferred edge and linkage carries a `provenance` block:

```json
{
  "provenance": {
    "method": "deterministic-note-parse | address-ladder | plantation-normalize | derived-inheritance | ...",
    "rawText": "<verbatim source fragment>",
    "confidence": "certain | probable | unresolved"
  }
}
```

Raw text is verbatim; confidence degrades on any fallback step
(`certain` → `probable` on partial match, `unresolved` when unmapped).
Derived locations additionally record `derivedFrom` (observation id +
relation, e.g. `derived_from_mother`).
