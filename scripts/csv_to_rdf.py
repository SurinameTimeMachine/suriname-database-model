#!/usr/bin/env python3
"""
Generate RDF (Turtle) from plantation CSVs.

Creates individual .ttl files for each plantation and a combined file.

Usage:
    python csv_to_rdf.py
"""

import csv
import os
from pathlib import Path
from urllib.parse import quote

# Paths
BASE_DIR = Path(__file__).parent.parent
LOD_DIR = BASE_DIR / "lod"
CSV_DIR = LOD_DIR / "csv"
TTL_DIR = LOD_DIR / "ttl"

# Ensure output directory exists
TTL_DIR.mkdir(parents=True, exist_ok=True)

# RDF Prefixes
PREFIXES = """@prefix stm: <https://suriname-timemachine.org/ontology/> .
@prefix wd: <http://www.wikidata.org/entity/> .
@prefix wdt: <http://www.wikidata.org/prop/direct/> .
@prefix crm: <http://www.cidoc-crm.org/cidoc-crm/> .
@prefix geo: <http://www.opengis.net/ont/geosparql#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix sdo: <https://schema.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

"""


def escape_turtle_string(s):
    """Escape special characters for Turtle string literals."""
    if not s:
        return ""
    return s.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n')


def load_csv(filename):
    """Load a CSV file from the csv directory."""
    filepath = CSV_DIR / filename
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter=';')
        return list(reader)


def load_plantation_names():
    """Load and index plantation names by qid."""
    names = load_csv("plantation_names.csv")
    names_by_qid = {}
    for n in names:
        qid = n['qid']
        if qid not in names_by_qid:
            names_by_qid[qid] = []
        names_by_qid[qid].append(n)
    return names_by_qid


def load_plantation_maps():
    """Load and index plantation-map links by qid."""
    maps = load_csv("plantation_maps.csv")
    maps_by_qid = {}
    for m in maps:
        qid = m['qid']
        if qid not in maps_by_qid:
            maps_by_qid[qid] = []
        maps_by_qid[qid].append(m)
    return maps_by_qid


def plantation_to_turtle(p, names, maps):
    """Convert a single plantation to Turtle format."""
    qid = p.get('qid', '').strip()
    if not qid:
        return None  # Skip plantations without qid

    lines = []

    # Subject URI
    lines.append(f"wd:{qid}")

    # Types
    lines.append("    a crm:E24_Physical_Human-Made_Thing,")
    lines.append("      sdo:Organization,")
    lines.append("      stm:Plantation ;")

    # Additional type (Wikidata: plantation)
    lines.append("    sdo:additionalType wd:Q188913 ;")

    # PSUR ID(s)
    psur_ids = []
    if p.get('psur_id', '').strip():
        psur_ids.append(p['psur_id'].strip())
    if p.get('psur_id2', '').strip():
        psur_ids.append(p['psur_id2'].strip())
    if p.get('psur_id3', '').strip():
        psur_ids.append(p['psur_id3'].strip())

    for psur_id in psur_ids:
        lines.append(f'    stm:psurId "{psur_id}" ;')

    # prefLabel
    prefLabel = escape_turtle_string(p.get('prefLabel', '').strip())
    if prefLabel:
        lines.append(f'    skos:prefLabel "{prefLabel}"@nl ;')

    # Status
    status = p.get('status', 'unknown').strip()
    lines.append(f'    stm:status "{status}" ;')

    # Alternative labels from names table
    alt_names = names.get(qid, [])
    for alt in alt_names:
        name = escape_turtle_string(alt['name'])
        source = alt.get('source', '')
        sourceYear = alt.get('sourceYear', '')

        # Use blank node for qualified altLabel
        lines.append("    skos:altLabel [")
        lines.append(f'        rdf:value "{name}" ;')
        if source:
            lines.append(f'        stm:source "{source}" ;')
        if sourceYear:
            lines.append(f'        stm:sourceYear "{sourceYear}"^^xsd:gYear')
        lines.append("    ] ;")

    # Geometry
    coords = p.get('coords', '').strip()
    if coords:
        # Escape the WKT literal
        coords_escaped = escape_turtle_string(coords)
        lines.append("    geo:hasGeometry [")
        lines.append("        a geo:Geometry ;")
        lines.append(f'        geo:asWKT "{coords_escaped}"^^geo:wktLiteral ;')
        lines.append('        stm:geometrySource stm:MAP_1930')
        lines.append("    ] ;")

    # Map depictions
    map_links = maps.get(qid, [])
    for m in map_links:
        map_id = m.get('map_id', '')
        label_on_map = escape_turtle_string(m.get('label_on_map', ''))

        lines.append("    stm:depictedOnMap [")
        lines.append(f'        stm:mapId "{map_id}" ;')
        if label_on_map:
            lines.append(f'        stm:labelOnMap "{label_on_map}"')
        lines.append("    ] ;")

    # qid_alt (alternative Wikidata ID, e.g., for merged plantation)
    qid_alt = p.get('qid_alt', '').strip()
    if qid_alt:
        lines.append(f"    sdo:parentOrganization wd:{qid_alt} ;")

    # sameAs link to Wikidata
    lines.append(f"    sdo:sameAs <http://www.wikidata.org/entity/{qid}> .")

    return '\n'.join(lines)


def generate_all_plantations_ttl():
    """Generate a single Turtle file with all plantations."""
    print("Loading data...")
    plantations = load_csv("plantations.csv")
    names = load_plantation_names()
    maps = load_plantation_maps()

    print(f"Generating Turtle for {len(plantations)} plantations...")

    output_file = TTL_DIR / "plantations.ttl"

    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(PREFIXES)
        f.write("\n# Suriname Time Machine - Plantation Data\n")
        f.write("# Generated from plantation_polygons_1930.csv\n\n")

        count = 0
        for p in plantations:
            ttl = plantation_to_turtle(p, names, maps)
            if ttl:
                f.write(ttl)
                f.write("\n\n")
                count += 1

    print(f"Wrote {count} plantations to {output_file}")


def generate_sample_jsonld():
    """Generate a sample JSON-LD file for one plantation."""
    import json

    plantations = load_csv("plantations.csv")
    names = load_plantation_names()
    maps = load_plantation_maps()

    # Find a good example (Breedevoort - Q59115309)
    example = None
    for p in plantations:
        if p.get('qid') == 'Q59115309':
            example = p
            break

    if not example:
        example = next((p for p in plantations if p.get('qid')), None)

    if not example:
        print("No example plantation found")
        return

    qid = example['qid']

    # Build JSON-LD
    jsonld = {
        "@context": "https://raw.githubusercontent.com/SurinameTimeMachine/suriname-database-model/main/lod/context.jsonld",
        "@id": f"http://www.wikidata.org/entity/{qid}",
        "@type": [
            "crm:E24_Physical_Human-Made_Thing",
            "sdo:Organization",
            "stm:Plantation"
        ],
        "additionalType": "http://www.wikidata.org/entity/Q188913",
        "prefLabel": example.get('prefLabel', ''),
        "status": example.get('status', 'unknown')
    }

    # Add PSUR IDs
    psur_ids = []
    if example.get('psur_id'):
        psur_ids.append(example['psur_id'])
    if example.get('psur_id2'):
        psur_ids.append(example['psur_id2'])
    if example.get('psur_id3'):
        psur_ids.append(example['psur_id3'])

    if psur_ids:
        jsonld['psurId'] = psur_ids if len(psur_ids) > 1 else psur_ids[0]

    # Add alternative labels
    alt_names = names.get(qid, [])
    if alt_names:
        jsonld['altLabel'] = [
            {
                "@value": n['name'],
                "source": n.get('source'),
                "sourceYear": n.get('sourceYear')
            }
            for n in alt_names
        ]

    # Add geometry (truncated for readability)
    if example.get('coords'):
        coords = example['coords']
        if len(coords) > 100:
            coords = coords[:100] + "..."
        jsonld['hasGeometry'] = {
            "@type": "geo:Geometry",
            "asWKT": coords,
            "geometrySource": "stm:MAP_1930"
        }

    # Add map depictions
    map_links = maps.get(qid, [])
    if map_links:
        jsonld['depictedOnMap'] = [
            {
                "mapId": m['map_id'],
                "labelOnMap": m.get('label_on_map')
            }
            for m in map_links
        ]

    # Add qid_alt as parentOrganization
    if example.get('qid_alt'):
        jsonld['parentOrganization'] = f"http://www.wikidata.org/entity/{example['qid_alt']}"

    jsonld['sameAs'] = f"http://www.wikidata.org/entity/{qid}"

    # Write output
    output_file = TTL_DIR / "example_plantation.jsonld"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(jsonld, f, indent=2, ensure_ascii=False)

    print(f"Wrote example JSON-LD to {output_file}")


def main():
    print("=== CSV to RDF Transformation ===\n")

    generate_all_plantations_ttl()
    generate_sample_jsonld()

    print("\n=== Done ===")


if __name__ == '__main__':
    main()
