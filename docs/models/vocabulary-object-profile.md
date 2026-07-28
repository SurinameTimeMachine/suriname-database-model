# STM vocabulary object profile

Status: implemented publication profile for the editorial thesaurus.

This profile brings STM vocabulary concepts closer to the per-object JSON-LD
shape used by GLOBALISE while retaining STM's own canonical identifiers and
editorial workflow. It is an interoperability profile, not a claim that STM is
fully conformant with every GLOBALISE data model.

## Representations

The editorial source remains:

- `data/place-types-thesaurus.jsonld`

The default JSON-LD route returns the readable, single-root concept:

- `/vocabulary/place-type/plantation.jsonld`

The lossless graph wrapper remains available explicitly:

- `/vocabulary/place-type/plantation.jsonld?profile=complete`

The previous `/vocabulary/place-type/plantation.jsonld?profile=globalise`
address remains a compatibility alias for the readable object.

The readable representation uses a root `id`, `type`, and `_label`, followed by
multilingual labels and SKOS relationships. This follows the recognizable
object shape of the [GLOBALISE thesaurus example](https://objectstore.surf.nl/87435b768620494e8e911c83d1997f24:globalise-data/objects/thesaurus/00caf575-0d33-49f0-83d7-3f550c681355.json)
without adopting its identifiers or project-specific ontology classes.

Place and vocabulary objects share the versioned
`https://data.surinametijdmachine.org/data/context/stm-v1.jsonld` context. It
layers Linked Art 1.0 with only the STM and SKOS additions required by these
profiles. Ontology definitions are not embedded in each concept.

## Projection

| Editorial value | Published RDF property | Compact profile |
| --- | --- | --- |
| `@id` | `@id` | `id` |
| `@type` | `skos:Concept` / `skos:ConceptScheme` and CIDOC CRM type | `type` |
| preferred display label | `rdfs:label` | `_label` |
| `prefLabel`, `altLabel` | `skos:prefLabel`, `skos:altLabel` | same short names |
| `definition`, `scopeNote` | corresponding SKOS properties | same short names |
| `editorialNote` | `skos:editorialNote` | `editorialNote` |
| hierarchy and related concepts | SKOS relationship properties | same short names with labeled objects |
| vocabulary mappings | SKOS match properties | same short names |
| `typeId` | `stm:typeId` and `skos:notation` | `typeId` and `notation` |
| editor display metadata | STM properties | unchanged short names |
| `created`, `modified` | Dublin Core Terms | same short names |
| deprecation metadata | OWL, PROV, DCTERMS, and STM properties | compact lifecycle names |

Concept relationships are published as nested, labeled references, not as
anonymous copies. Every nested object retains the canonical URI of the related
concept.

## Identifier and provenance rules

- Existing STM vocabulary URIs are canonical and must not be replaced.
- External alignments remain typed SKOS matches. They are not promoted to
  `owl:sameAs`.
- The editor JSON is the editable authority; generated database and API
  representations are publication projections.
- Concept-level `source` and `references` are published only after curators add
  real evidence. The current thesaurus has creation and modification dates but
  no concept-level bibliography, so this profile deliberately does not invent
  one.
- Dataset-version provenance belongs to the publication release metadata. It
  should not be fabricated separately on every concept.

The generator includes every record in the editorial file, including its
place-type and road-attribute schemes. The generation pipeline validates that
every editorial concept has exactly one
published object with the same identifier and that labels, notes, hierarchy,
mappings, dates, lifecycle data, and editor metadata survive the projection.
