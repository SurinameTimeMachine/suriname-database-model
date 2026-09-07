# LOD Publication Contract

This project generates a CIDOC-CRM-informed JSON-LD graph. The data pipeline publishes the complete graph and its JSON-LD context with the application assets:

- `/data/database.jsonld` — complete generated graph
- `/data/context.jsonld` — shared complete-graph JSON-LD context
- `/data/context/stm-v1.jsonld` — versioned Linked Art + STM readable context
- `/data/context/place-record-v1.jsonld` — versioned complete Place-record
  context

The Next.js application explicitly serves `.jsonld` files as `application/ld+json`.

## Pipeline guarantees

`pnpm --dir app pipeline` verifies that:

1. the standalone context matches the context embedded in `database.jsonld`;
2. all generated graph entities have unique absolute HTTP identifiers;
3. the complete graph and context copied to `public/data` exactly match their generated counterparts; and
4. the graph includes outbound Wikidata links.

These checks establish JSON-LD publication hygiene and the dereferenceable
place-record route contract. They do not by themselves prove full CIDOC-CRM
conformance for every property in the graph.

## Deployment requirements

The canonical identifier base is `https://data.surinametijdmachine.org/`. Before describing the service as published Linked Open Data, deployment must provide:

1. DNS and TLS for `data.surinametijdmachine.org`;
2. a stable route from the canonical dataset URI to `/data/database.jsonld`;
3. stable routes for individual place-record identifiers, with HTML for browsers and JSON-LD for machine clients; and
4. redirects or persistent aliases if URI patterns change.

Place-record routes use `https://data.surinametijdmachine.org/place/{stm-id}`
as the canonical browser URI. Readable JSON-LD and application JSON are
available at `/place/{stm-id}.jsonld` and `/place/{stm-id}.json`; the complete
authority graph is available with `?profile=complete`. Entities that are only
defined inside one place record use URI fragments, for example
`/place/stm-02085#feature` and `/place/stm-02085#location`, so the identifier
dereferences to the same record page and representation set.

The readable Place and vocabulary representations use a single root object and
the immutable `stm-v1` context. The context imports Linked Art 1.0 and defines
only STM, GeoSPARQL, PROV-O, and SKOS additions used by the public profiles.
Future incompatible term changes require a new context URI rather than edits to
the published `stm-v1` contract.

## Semantic conformance work

The graph reuses CIDOC CRM, GeoSPARQL, PROV-O, SKOS, Schema.org, and Wikidata identifiers. Some mappings remain transitional: for example, maker and publication-place values are currently literals in CRM properties whose strict ranges are entities. These require a deliberate migration to E39 Actor, E53 Place, E54 Dimension, and related CRM nodes.

Before asserting strict CRM conformance, add SHACL shapes for the supported profile and validate the generated graph in CI. This should follow the model decision for each transitional field rather than coercing historical source strings into entities without provenance.

## References

- [JSON-LD 1.1](https://www.w3.org/TR/json-ld/)
- [CIDOC CRM versions](https://cidoc-crm.org/versions-of-the-cidoc-crm)
- [Linked Art JSON-LD](https://linked.art/api/1.0/json-ld/)
