# LOD Publication Contract

This project generates a CIDOC-CRM-informed JSON-LD graph. The data pipeline publishes the complete graph and its JSON-LD context with the application assets:

- `/data/database.jsonld` — complete generated graph
- `/data/context.jsonld` — shared JSON-LD context

The Next.js application explicitly serves `.jsonld` files as `application/ld+json`.

## Pipeline guarantees

`pnpm --dir app pipeline` verifies that:

1. the standalone context matches the context embedded in `database.jsonld`;
2. all generated graph entities have unique absolute HTTP identifiers;
3. the complete graph and context copied to `public/data` exactly match their generated counterparts; and
4. the graph includes outbound Wikidata links.

These checks establish JSON-LD publication hygiene. They do not by themselves prove full CIDOC-CRM conformance or make project identifiers dereferenceable on the public web.

## Deployment requirements

The canonical identifier base is `https://data.surinametijdmachine.org/`. Before describing the service as published Linked Open Data, deployment must provide:

1. DNS and TLS for `data.surinametijdmachine.org`;
2. a stable route from the canonical dataset URI to `/data/database.jsonld`;
3. stable routes for individual entity identifiers, with HTML for browsers and JSON-LD for machine clients; and
4. redirects or persistent aliases if URI patterns change.

The current application deployment exposes the dataset files, but it does not yet satisfy items 1–3 for the canonical URI base.

## Semantic conformance work

The graph reuses CIDOC CRM, GeoSPARQL, PROV-O, SKOS, Schema.org, and Wikidata identifiers. Some mappings remain transitional: for example, maker and publication-place values are currently literals in CRM properties whose strict ranges are entities. These require a deliberate migration to E39 Actor, E53 Place, E54 Dimension, and related CRM nodes.

Before asserting strict CRM conformance, add SHACL shapes for the supported profile and validate the generated graph in CI. This should follow the model decision for each transitional field rather than coercing historical source strings into entities without provenance.

## References

- [JSON-LD 1.1](https://www.w3.org/TR/json-ld/)
- [CIDOC CRM versions](https://cidoc-crm.org/versions-of-the-cidoc-crm)
- [Linked Art JSON-LD](https://linked.art/api/1.0/json-ld/)
