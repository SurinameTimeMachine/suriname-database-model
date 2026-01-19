## Context

We are building a database to integrate multiple historical datasets about Suriname (plantations, vital records, enslaved persons, maps). The project involves:

1. Multiple source datasets with different structures
2. Need to learn data modeling concepts (relational, LOD, CIDOC-CRM)
3. Academic rigor required (proper citations, reproducibility)
4. Long-term project requiring clear documentation

## Decision

We will adopt a **documentation-first approach** where:

1. **Document before implementing**: Understand and document each dataset's structure before designing database schemas
2. **Use Markdown with Mermaid**: Plain text files with embedded diagrams for version control
3. **Academic citations**: BibTeX-format references in a central `references.md` file
4. **Incremental design**: Build diagrams and documentation iteratively

## Consequences

### Positive

- Complete understanding of data before implementation
- All decisions are documented and traceable
- Easy to collaborate and review
- Git-friendly format (diff-able text files)
- Can generate documentation site if needed later

### Negative

- Slower initial progress (documentation overhead)
- Need to maintain documentation as project evolves
- Mermaid diagrams have limitations vs. dedicated tools

### Neutral

- Learning curve for Mermaid syntax
- Need to establish documentation conventions

## Alternatives Considered

1. **Direct implementation**: Jump straight to SQL schema design
   - Rejected: Risk of rework, poor documentation
2. **Enterprise modeling tools** (e.g., ERwin, Lucidchart)
   - Rejected: Not version-control friendly, license costs
3. **Jupyter notebooks**: Interactive documentation
   - Considered for future analysis, but Markdown better for pure documentation

## References

- [@Codd1970] - Foundational relational model paper
- [@Hoberman2009] - Data Modeling Made Simple
