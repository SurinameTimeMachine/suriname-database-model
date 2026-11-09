"""Bouw het publicatiepakket 'Locatiepunten Paramaribo 1885' uit de QGIS-export.

Bron (ongewijzigd): data/08-place-points-qgis/export20260619/locatiepunten1885.geojson
Uitvoer:            data/08-place-points-qgis/publicatie-v1/data/

Correcties (besloten door Thunnis van Oort, 9 nov 2026):
- punten zonder geometrie weglaten (fid 2627, 2630);
- punten zonder wijkletter weglaten (annotaties van de kaart van 1916 en lege punten);
- dubbele adressen B230, B258, E42 krijgen toevoeging a/b; 'a' is het punt dat het
  dichtst bij huisnummer n-1 ligt (nummering loopt op);
- kolommen beschrijving1854, toevoeging1837, bioscoopnaam weglaten;
- geen gegevens uit de Concordans Paramaribo.
lp_id = stm-1885-address-NNNN met NNNN = fid (volgorde in de bron); weggelaten punten
laten een gat, ids worden nooit hernummerd.

Gebruik: python3 scripts/locatiepunten1885/build_publicatie.py
"""
import csv, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data/08-place-points-qgis/export20260619/locatiepunten1885.geojson"
OUT = ROOT / "data/08-place-points-qgis/publicatie-v1/data"
BASE = "https://data.surinametijdmachine.org/place/"

# fid -> toevoeging (handmatig gecontroleerd op afstand tot huisnummer n-1 / n+1)
TOEVOEGING_FIX = {2778: "a", 556: "b", 579: "a", 2757: "b", 1068: "a", 2936: "b"}

FIELDS = [
    ("wijk_1885", "wijk1885"), ("huisnummer_1885", "huisnummer1885"),
    ("toevoeging_1885", "toevoeging1885"), ("adres_1885", "adres1885"),
    ("straatnaam_1885", "straatnaam1885"), ("beschrijving_1885", "beschrijving1885"),
    ("beschrijving_1916", "beschrijving1916"), ("legenda_1885", "legenda1885"),
    ("legenda_1916", "legenda1916"), ("redactioneel_commentaar", "red_commentaar"),
]


def t(v):
    return "" if v is None else " ".join(str(v).split())


def main():
    feats = json.loads(SRC.read_text(encoding="utf-8"))["features"]
    rows, out_feats, dropped = [], [], {"geen_geometrie": [], "geen_wijk": []}
    for fid, f in enumerate(feats, 1):
        p, g = f["properties"], f["geometry"]
        wijk = t(p.get("wijk1885"))
        if not g:
            dropped["geen_geometrie"].append(fid); continue
        if not wijk:
            dropped["geen_wijk"].append(fid); continue
        r = {k: t(p.get(src)) for k, src in FIELDS}
        if fid in TOEVOEGING_FIX:
            r["toevoeging_1885"] = TOEVOEGING_FIX[fid]
            r["adres_1885"] = f"{r['wijk_1885']}{r['huisnummer_1885']}{r['toevoeging_1885']}"
        if not r["huisnummer_1885"]:
            punttype = "wijklabel"
        else:
            punttype = "adres"
        lid = f"stm-1885-address-{fid:04d}"
        lon, lat = g["coordinates"][:2]
        row = {"lp_id": lid, "uri": BASE + lid, "bron_fid": fid, **r,
               "punttype": punttype, "lon": f"{lon:.7f}", "lat": f"{lat:.7f}"}
        rows.append(row)
        props = {k: (v if v != "" else None) for k, v in row.items() if k not in ("lon", "lat")}
        out_feats.append({"type": "Feature", "id": lid, "properties": props, "geometry": g})

    seen = {}
    for r in rows:
        if r["punttype"] == "adres":
            seen.setdefault(r["adres_1885"], []).append(r["bron_fid"])
    dups = {a: l for a, l in seen.items() if len(l) > 1}
    if dups:
        sys.exit(f"Dubbele adressen: {dups}")

    OUT.mkdir(parents=True, exist_ok=True)
    with open(OUT / "locatiepunten_paramaribo_1885.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
    (OUT / "locatiepunten_paramaribo_1885.geojson").write_text(json.dumps(
        {"type": "FeatureCollection", "name": "locatiepunten_paramaribo_1885", "features": out_feats},
        ensure_ascii=False), encoding="utf-8")
    from collections import Counter
    print(len(rows), "punten;", dict(Counter(r["punttype"] for r in rows)),
          "; weggelaten:", {k: len(v) for k, v in dropped.items()})


if __name__ == "__main__":
    main()
