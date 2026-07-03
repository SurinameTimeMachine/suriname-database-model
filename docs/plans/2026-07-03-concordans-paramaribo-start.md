# Concordans Paramaribo Start Plan

Date: 2026-07-03

## Scope

This project starts from the Concordans Paramaribo dataset and uses it as an internal matching key for STM.

Key constraints:

- The original XLSX must stay outside Git.
- Public documentation must refer to the concordans generically by source name + website URL.
- No per-record citations to the concordans website.
- Matching starts from the 1885 address system.
- The major system transitions to capture are 1837 and 1921.

## Implementation order

1. Keep the work small and reviewable on a separate branch.
2. Add a reproducible transformation entrypoint for the concordans.
3. Normalize the 1885 address layer first.
4. Add explicit support for later/earlier address-system transitions.
5. Model splits and merges between location points and historical addresses.
6. Add validation and publication guardrails before anything becomes public.

## First deliverable

The first deliverable is a lightweight transformation scaffold that can later read a local concordans export and produce STM-friendly derived data without committing the raw source file. The second deliverable is a derived CSV with explicit 2022, 1885, 1837, 1817, and 1921 fields plus split/merge markers.

## Collaboration rule

All project communication, commit messages, and documentation for this work are in English so collaborators can review the process consistently.