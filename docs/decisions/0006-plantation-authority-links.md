# ADR 0006: Plantation authority links are not organizations

## Status

Accepted

## Context

The QGIS `qid` column and Almanakken v2 `plantation_id` column contain
Wikidata identifiers for plantations. Live inspection confirms that these
items describe plantations and are typed as plantation (`wd:Q188913`) in
Wikidata. Earlier pipeline code re-declared the external items as CIDOC CRM
E74 Groups and treated them as owners through P52. That changed the identity
and class of the source authority record without evidence.

Owner, administrator, and director columns in Almanakken are transcriptions.
They may refer to people, companies, estates, heirs, or other groups, and are
not yet reconciled to authority records.

## Decision

- A mapped plantation is a local `crm:E25_Human-Made_Feature`.
- Its Wikidata plantation identifier is a conservative `skos:closeMatch`.
- Almanakken E13 observations target a local E25 only when the shared QID has
  one unambiguous local match.
- Unresolved observations retain `stm:sourcePlantationQid` and remain visible
  in the editorial review data.
- The pipeline does not create E74 entities or P51/P52 ownership statements
  from plantation QIDs.
- Raw owner and management values remain typed STM transcription literals
  until a sourced actor-reconciliation workflow exists.

## Consequences

Legacy model diagrams that describe the plantation QID itself as E74 are
design history, not the current publication profile. A future E74 actor must
have its own identifier and evidence; it must not reuse a plantation QID.
