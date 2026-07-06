# Concordans Paramaribo Matching Logic

Date: 2026-07-06

## Purpose

This document records the current reasoning behind the Concordans Paramaribo matching strategy so the logic can be reviewed, challenged, and extended across sessions.

It is intentionally more detailed than the start plan. The goal is to make the assumptions behind the matching pipeline explicit before the location-point linkage is implemented.

The concordans itself is the work of Muntjewerff. Throughout this project, the concordans should be described explicitly as Muntjewerff's concordans, and its role should remain clearly distinguished from STM's own derived data products and map-based location-point layers.

## Core model

The project has three distinct layers that must not be conflated.

1. Location points (LPs) are the spatial anchors.
2. Address labels on historical maps are the earliest directly observed address evidence for those LPs.
3. The concordans is the temporal reasoning layer that links one address regime to another.

This means the concordans is not treated as the primary spatial source. The primary spatial evidence comes from map-derived LPs.

More precisely: STM uses Muntjewerff's concordans as a historical reasoning tool, not as the original source of LP geometry.

## Why 1885 is the point of departure

The 1885 map series is currently the earliest source available in this workflow that gives point-level spatial evidence for addresses in Paramaribo.

Therefore:

- LP geometry is anchored in the 1885 map evidence.
- The 1885 address attached to an LP is the first stable address key for reasoning.
- Older addresses are not treated as directly observed spatial facts at the same precision level.
- Older addresses are attached to LPs through inferred historical equivalence, mediated by the concordans.

In the future, additional LP layers may be derived from later maps. Those may confirm, refine, or complicate the LP geometry and address history.

## Address regimes

The concordans spans multiple numbering systems that should be handled as separate regimes rather than one continuous scheme.

### 1782-1816

This is the earliest wijk-numbering system. It is effectively cadastral in character and uses district numbering rather than the later lettered systems.

Important implications:

- The 1782 layer must be kept distinct from later wijk-letter systems.
- Street names may help, but the number itself belongs to a different regime.

### 1817-1837: Oude Wijk

This is the Old Wijk system with districts `A`, `B`, `C`, and `D`.

Important implications:

- `D` is not globally unique by number alone.
- In district `D`, numbering restarted in multiple buurten.
- For OW matching, `wijk + number` can be insufficient.
- `street` and sometimes `buurt` must be treated as disambiguating fields.

### 1837-1921: Nieuwe Wijk

This is the New Wijk system with inner districts `A-F` and two outer districts: `1e Buitenwijk` and `2e Buitenwijk`.

Important implications:

- This is the broader city-wide system relevant for most nineteenth-century reasoning.
- Subdivision is encoded in suffixes such as `a` and `b`.
- Those suffixes should not be dropped too early because they preserve parcel genealogy.

### 1885-1921: partial renumbering within the New Wijk system

The 1885 renumbering does not apply city-wide. It affects only:

- `F`
- `1e Buitenwijk`
- `2e Buitenwijk`

Important implications:

- The explicit 1885 fields do not form a universal Paramaribo address layer.
- Missing 1885 fields do not automatically mean missing address data.
- For many records, the relevant bridge may remain `1837 -> 1921`, not `1885 -> 1921`.

## Consequences for matching

The matching logic must be regime-aware.

### Do not assume one city-wide 1885 layer

Only location points in the renumbered zones should be matched through the explicit 1885 renumbering fields as a first choice.

Outside those zones, the broader 1837 New Wijk system is likely to be the more appropriate reference layer.

### Do not assume one-to-one matches

The LP linkage must be many-to-many.

That means:

- one LP may link to multiple concordans candidates
- one concordans row may link to multiple LPs

This is necessary because of:

- parcel splits
- parcel merges
- corner plots
- duplicated numbering across neighborhoods in older regimes
- project-based subdivisions

### Keep suffixes and project information

Suffixes such as `a`, `b`, and similar forms are historically meaningful.

Project-related columns also matter for the renumbered areas and should be preserved for later linkage decisions.

## Current concordans-side implementation

The current derived concordans export now preserves regime-specific component fields for:

- 1782 parcel context
- 1817 Old Wijk context, including buurt fields
- 1837 New Wijk context
- 1885 renumbering applicability and components
- 1921 and 2022 address forms
- project and split/merge markers

The current transform also classifies 1885 values into:

- `exact`
- `formatting-only`
- `derived-only`
- `mismatch`

At the current stage, all non-empty 1885 values are either formatting-only or derived-only after normalization; there are no real mismatches left in the concordans-side export.

## Planned LP-side implementation

The next implementation step is to build a derived LP table from the 1885 location-point source.

At minimum, that LP-side export should preserve:

- `adres1885`
- `straatnaam1885`
- normalized forms of both fields
- LP identifier
- coordinates / geometry reference
- optional district or zone classification if available

## Planned candidate-link model

The first LP-to-concordans linkage should be stored as a candidate table, not as a final resolved join.

Suggested candidate statuses:

- `exact`
- `formatting-only`
- `street-supported`
- `multiple-candidates`
- `derived-only`
- `unresolved`

This table should also retain enough context to explain why a match exists.

Suggested explanatory fields:

- LP id
- concordans source row
- matched regime (`1885`, `1837`, `1817`, etc.)
- normalized code match result
- street-name agreement
- suffix agreement
- neighborhood / buurt agreement when relevant
- certainty or status

## Working rule for the next session

The next session should not jump directly to “final matches”.

The correct order is:

1. derive the LP-side export
2. classify LPs by relevant regime where possible
3. build a candidate-link table
4. measure unresolved and ambiguous cases
5. only then design final resolution logic for splits and merges

## Open questions

These remain open and should be answered in future work.

1. How should LPs outside the 1885-renumbered zones be classified automatically?
2. Can a district or zone be inferred reliably from the LP source itself, or only after matching?
3. How should corner plots be represented if two streets plausibly point to different concordans candidates?
4. When one historical address corresponds to multiple LPs, should the relation be stored as one record with multiplicity metadata or as multiple candidate rows?
5. When a split/merge is historically certain, should that certainty live in the candidate table or in a later resolution layer?