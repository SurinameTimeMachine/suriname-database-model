#!/usr/bin/env python3
"""
Transform plantation data to LOD-ready format.

This script:
1. Adds prefLabel and status columns to plantation_polygons_1930.csv
2. Creates plantation_names.csv from map labels
3. Creates plantation_maps.csv linking plantations to historic maps
4. (Future) Creates plantation_observations.csv from Almanakken

Usage:
    python transform_plantations.py
"""

import csv
import os
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
GIS_DIR = DATA_DIR / "07-gis-plantation-map-1930"
ALMANAKKEN_DIR = DATA_DIR / "06-almanakken - Plantations Surinaamse Almanakken"
LOD_DIR = BASE_DIR / "lod"
OUTPUT_DIR = LOD_DIR / "csv"

# Ensure output directory exists
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def load_plantations():
    """Load plantation polygons CSV."""
    plantations = []
    input_file = GIS_DIR / "plantation_polygons_1930.csv"

    with open(input_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter=';')
        for row in reader:
            plantations.append(row)

    print(f"Loaded {len(plantations)} plantations from {input_file}")
    return plantations


def add_prefLabel_and_status(plantations):
    """
    Add prefLabel and status columns.
    - prefLabel: use plantation_label (already the latest known name)
    - status: default to 'built', mark 'unknown' if no qid
    """
    for p in plantations:
        # prefLabel = plantation_label (already curated)
        p['prefLabel'] = p.get('plantation_label', '').strip()

        # Status: if no qid and no psur_id, likely unknown/planned
        has_qid = bool(p.get('qid', '').strip())
        has_psur = bool(p.get('psur_id', '').strip())
        has_label = bool(p.get('plantation_label', '').strip())

        if not has_qid and not has_psur and not has_label:
            p['status'] = 'unknown'
        else:
            p['status'] = 'built'  # Default assumption

    return plantations


def extract_plantation_names(plantations):
    """
    Extract alternative names from label_1930 and label_1860-79 columns.
    Creates records for plantation_names.csv
    """
    names = []

    for p in plantations:
        qid = p.get('qid', '').strip()
        if not qid:
            continue  # Skip entries without qid

        prefLabel = p.get('prefLabel', '').strip()
        label_1930 = p.get('label_1930', '').strip()
        label_1860 = p.get('label_1860-79', '').strip()

        # Add label_1930 if different from prefLabel
        if label_1930 and label_1930 != prefLabel:
            names.append({
                'qid': qid,
                'name': label_1930,
                'source': 'map_1930',
                'sourceYear': '1930'
            })

        # Add label_1860-79 if different from both
        if label_1860 and label_1860 != prefLabel and label_1860 != label_1930:
            names.append({
                'qid': qid,
                'name': label_1860,
                'source': 'map_1860-79',
                'sourceYear': '1870'  # Approximate midpoint
            })

    print(f"Extracted {len(names)} alternative names")
    return names


def extract_plantation_maps(plantations):
    """
    Create plantation_maps.csv linking plantations to maps they appear on.
    For now, we know they appear on the 1930 and 1860-79 maps.
    """
    maps = []

    for p in plantations:
        qid = p.get('qid', '').strip()
        if not qid:
            continue

        label_1930 = p.get('label_1930', '').strip()
        label_1860 = p.get('label_1860-79', '').strip()

        # Appears on 1930 map
        if label_1930:
            maps.append({
                'qid': qid,
                'map_id': 'MAP_1930',
                'label_on_map': label_1930,
                'has_polygon': 'true'
            })

        # Appears on 1860-79 map
        if label_1860:
            maps.append({
                'qid': qid,
                'map_id': 'MAP_1860-79',
                'label_on_map': label_1860,
                'has_polygon': 'false'  # Polygon traced from 1930 map
            })

    print(f"Created {len(maps)} plantation-map links")
    return maps


def write_enhanced_plantations(plantations):
    """Write enhanced plantation CSV with new columns."""
    output_file = OUTPUT_DIR / "plantations.csv"

    # Define column order
    fieldnames = [
        'qid', 'psur_id', 'psur_id2', 'psur_id3',
        'prefLabel', 'status',
        'label_1930', 'label_1860-79',
        'qid_alt', 'coords'
    ]

    with open(output_file, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')
        writer.writeheader()

        for p in plantations:
            row = {k: p.get(k, '') for k in fieldnames}
            writer.writerow(row)

    print(f"Wrote enhanced plantations to {output_file}")


def write_plantation_names(names):
    """Write plantation_names.csv"""
    output_file = OUTPUT_DIR / "plantation_names.csv"

    fieldnames = ['qid', 'name', 'source', 'sourceYear']

    with open(output_file, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')
        writer.writeheader()
        writer.writerows(names)

    print(f"Wrote {len(names)} names to {output_file}")


def write_plantation_maps(maps):
    """Write plantation_maps.csv"""
    output_file = OUTPUT_DIR / "plantation_maps.csv"

    fieldnames = ['qid', 'map_id', 'label_on_map', 'has_polygon']

    with open(output_file, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')
        writer.writeheader()
        writer.writerows(maps)

    print(f"Wrote {len(maps)} map links to {output_file}")


def generate_statistics(plantations):
    """Print statistics about the dataset."""
    total = len(plantations)
    with_qid = sum(1 for p in plantations if p.get('qid', '').strip())
    with_psur = sum(1 for p in plantations if p.get('psur_id', '').strip())
    with_both = sum(1 for p in plantations
                    if p.get('qid', '').strip() and p.get('psur_id', '').strip())
    unknown = sum(1 for p in plantations if p.get('status') == 'unknown')

    print("\n=== Plantation Statistics ===")
    print(f"Total polygons: {total}")
    print(f"With Wikidata QID: {with_qid} ({100*with_qid/total:.1f}%)")
    print(f"With PSUR ID: {with_psur} ({100*with_psur/total:.1f}%)")
    print(f"With both QID and PSUR: {with_both} ({100*with_both/total:.1f}%)")
    print(f"Status unknown: {unknown}")


def main():
    print("=== Plantation Data Transformation ===\n")

    # Load data
    plantations = load_plantations()

    # Transform
    plantations = add_prefLabel_and_status(plantations)
    names = extract_plantation_names(plantations)
    maps = extract_plantation_maps(plantations)

    # Write outputs
    write_enhanced_plantations(plantations)
    write_plantation_names(names)
    write_plantation_maps(maps)

    # Statistics
    generate_statistics(plantations)

    print("\n=== Done ===")


if __name__ == '__main__':
    main()
