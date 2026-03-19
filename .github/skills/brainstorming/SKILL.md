# Brainstorming Ideas Into Designs

> **IMPORTANT:** Use this skill BEFORE any creative work — creating features, building components, adding scripts, or modifying the data model. Explore intent, requirements, and design before implementation.

## Overview

Help turn ideas into fully formed designs and specs through natural collaborative dialogue.

Start by understanding the current project context, then ask questions one at a time to refine the idea. Once you understand what you're building, present the design in small sections (200-300 words), checking after each section whether it looks right so far.

---

## The Process

### 1. Understanding the Idea

- **Check project context first** — read relevant skill files, docs, existing code
- **Ask questions one at a time** — don't overwhelm
- **Prefer multiple choice questions** when possible, but open-ended is fine too
- **Only one question per message** — if a topic needs more exploration, break it into multiple questions
- Focus on understanding: **purpose, constraints, success criteria**

### 2. Exploring Approaches

- Propose **2-3 different approaches** with trade-offs
- Present options conversationally with your **recommendation and reasoning**
- Lead with your recommended option and explain why

### 3. Presenting the Design

- Once you understand what you're building, **present the design**
- Break it into **sections of 200-300 words**
- **Ask after each section** whether it looks right so far
- Cover: architecture, components, data flow, error handling
- Be ready to **go back and clarify** if something doesn't make sense

---

## After the Design

### Documentation

- Write the validated design to `docs/plans/YYYY-MM-DD-<topic>-design.md`
- Commit the design document to git

### Implementation (if continuing)

- Ask: "Ready to start implementation?"
- Create a checklist of tasks
- Implement incrementally, validating as you go

---

## Key Principles

| Principle                     | Why                                                   |
| ----------------------------- | ----------------------------------------------------- |
| **One question at a time**    | Don't overwhelm with multiple questions               |
| **Multiple choice preferred** | Easier to answer than open-ended when possible        |
| **YAGNI ruthlessly**          | Remove unnecessary features from all designs          |
| **Explore alternatives**      | Always propose 2-3 approaches before settling         |
| **Incremental validation**    | Present design in sections, validate each             |
| **Be flexible**               | Go back and clarify when something doesn't make sense |

---

## Suriname Time Machine Specific

When brainstorming for this project, always consider:

1. **Does this align with the three-entity model?** (Land Plot, Physical Site, Organization)
2. **What data sources are involved?** (QGIS, Almanakken, Slave Registers, Wikidata)
3. **How does provenance flow?** (Which source → which entity → which output)
4. **Is this LOD-compatible?** (Can it be expressed in RDF later?)
5. **Does it follow CIDOC-CRM / PICO patterns?**

---

## Example Questions to Ask

**For new features:**

- "What problem are you trying to solve?"
- "Who will use this — researchers, developers, or end users?"
- "Should this be a script, a data transformation, or documentation?"

**For data model changes:**

- "Which entity does this affect — Land Plot, Physical Site, or Organization?"
- "Is this a new property, a new relationship, or a new entity type?"
- "What certainty level should links have?"

**For scripts/transformations:**

- "What's the input data source?"
- "What's the desired output format — CSV, RDF, JSON?"
- "Should this be reversible/reproducible?"
