"""Sync the STM gazetteer with publication v1 of 'Locatiepunten Paramaribo 1885'.

- Points omitted from the publication are marked deprecated (ids are never deleted
  or reused).
- Address corrections made for the publication (a/b suffixes, address conflicts,
  district changes) are copied to the gazetteer records.

The ids stm-1885-address-NNNN are frozen: NNNN is the feature order in
data/08-place-points-qgis/export20260619/locatiepunten1885.geojson.

Idempotent. Usage: python3 scripts/locatiepunten1885/sync_gazetteer.py [--write]
"""
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GAZ = ROOT / "data" / "places-gazetteer.jsonld"
PUB = ROOT / "data/08-place-points-qgis/publicatie-v1/data/locatiepunten_paramaribo_1885.csv"
TAG = "data-migration/locatiepunten1885-publicatie-v1"
DATE = "2026-11-13"
NOTE = ("Omitted from the data publication 'Locatiepunten Paramaribo 1885' (v1): "
        "point without an 1885 district letter (annotation from the 1916 map or empty point).")


def label(r):
    street, adres = r["straatnaam_1885"].strip(), r["adres_1885"].strip()
    if street and adres:
        return f"{street}, {adres}"
    return adres or street or None


def main():
    write = "--write" in sys.argv
    text = GAZ.read_text(encoding="utf-8")
    doc = json.loads(text)
    recs = {e["id"]: e for e in doc["@graph"]
            if isinstance(e.get("id"), str) and e["id"].startswith("stm-1885-address-")}
    pub = {r["lp_id"]: r for r in csv.DictReader(PUB.open(encoding="utf-8"))}
    missing = set(pub) - set(recs)
    if missing:
        sys.exit(f"publication ids missing from gazetteer: {sorted(missing)[:5]}")

    deprecated, updated = [], []
    for rid in sorted(set(recs) - set(pub)):
        e = recs[rid]
        if e.get("deprecated") is True:
            continue
        e.update(deprecated=True, deprecatedAt=DATE, deprecatedBy=TAG, deprecationNote=NOTE)
        deprecated.append(rid)

    for rid, r in sorted(pub.items()):
        e = recs[rid]
        new_label = label(r)
        adres = r["adres_1885"].strip() or None
        district = f"Wijk {r['wijk_1885']}" if r["wijk_1885"] else None
        changes = {}
        if new_label and e["names"][0]["text"] != new_label:
            changes["label"] = (e["names"][0]["text"], new_label)
        if adres and e.get("locationDescriptionOriginal") != adres:
            changes["adres"] = (e.get("locationDescriptionOriginal"), adres)
        if e.get("district") != district:
            changes["district"] = (e.get("district"), district)
        if not changes:
            continue
        if e.get("modifiedBy") not in (None, TAG):
            print(f"SKIP {rid}: edited by {e['modifiedBy']}: {changes}")
            continue
        if "label" in changes:
            e["names"][0]["text"] = new_label
        for a in e.get("locationAssertions", []):
            if a.get("id") == "address-observation-1885":
                if "label" in changes:
                    a["standardized"] = new_label
                if "adres" in changes:
                    a["original"] = adres
        if "adres" in changes:
            e["locationDescriptionOriginal"] = adres
        if "district" in changes:
            e["district"] = district
            e["locationDescription"] = district
        e["modifiedBy"], e["modifiedAt"] = TAG, DATE
        updated.append((rid, changes))

    print(f"deprecated: {len(deprecated)}  updated: {len(updated)}")
    for rid, ch in updated:
        print(" ", rid, {k: f"{v[0]} -> {v[1]}" for k, v in ch.items()})
    if write:
        GAZ.write_text(json.dumps(doc, indent=2, ensure_ascii=False), encoding="utf-8")
        print("written", GAZ)


if __name__ == "__main__":
    main()
