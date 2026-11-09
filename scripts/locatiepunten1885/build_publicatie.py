"""Bouw het publicatiepakket 'Locatiepunten Paramaribo 1885' uit de QGIS-export.

Bron (ongewijzigd): data/08-place-points-qgis/export20260619/locatiepunten1885.geojson
      + straten:    data/08-place-points-qgis/export20261109/streetsParamaribo1885map.geojson
                    data/08-place-points-qgis/export20260619/streetsParamaribo1916map.geojson
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
import csv, json, math, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data/08-place-points-qgis/export20260619/locatiepunten1885.geojson"
OUT = ROOT / "data/08-place-points-qgis/publicatie-v1/data"
BASE = "https://data.surinametijdmachine.org/place/"
WIJKEN_1885 = ROOT / "data/08-place-points-qgis/export20260619/districts_paramaribo_NW_1885.geojson"

# --- Zanderij / Suriname TM (EPSG:31171) -> WGS84, zonder pyproj --------------------
# Parameters uit de .qmd: tmerc lon_0=-55.68333 k=0.9999 x_0=500000, ellps=intl,
# towgs84=-265,120,-358. Inverse transversale Mercator (Snyder) + 3-parameter verschuiving.
A=6378388.0; F=1/297.0; E2=2*F-F*F
K0=0.9999; LON0=math.radians(-55.6833333333333); FE=500000.0
def inv_tm(x,y):
    e2=E2; ep2=e2/(1-e2); M=y/K0
    mu=M/(A*(1-e2/4-3*e2**2/64-5*e2**3/256))
    e1=(1-math.sqrt(1-e2))/(1+math.sqrt(1-e2))
    p1=mu+(3*e1/2-27*e1**3/32)*math.sin(2*mu)+(21*e1**2/16-55*e1**4/32)*math.sin(4*mu)+(151*e1**3/96)*math.sin(6*mu)+(1097*e1**4/512)*math.sin(8*mu)
    C1=ep2*math.cos(p1)**2; T1=math.tan(p1)**2; N1=A/math.sqrt(1-e2*math.sin(p1)**2)
    R1=A*(1-e2)/(1-e2*math.sin(p1)**2)**1.5; D=(x-FE)/(N1*K0)
    lat=p1-(N1*math.tan(p1)/R1)*(D*D/2-(5+3*T1+10*C1-4*C1*C1-9*ep2)*D**4/24+(61+90*T1+298*C1+45*T1*T1-252*ep2-3*C1*C1)*D**6/720)
    lon=LON0+(D-(1+2*T1+C1)*D**3/6+(5-2*C1+28*T1-3*C1*C1+8*ep2+24*T1*T1)*D**5/120)/math.cos(p1)
    return lat,lon
def geo2ecef(lat,lon,a,e2,h=0):
    N=a/math.sqrt(1-e2*math.sin(lat)**2)
    return ((N+h)*math.cos(lat)*math.cos(lon),(N+h)*math.cos(lat)*math.sin(lon),(N*(1-e2)+h)*math.sin(lat))
def ecef2geo(X,Y,Z,a,e2):
    lon=math.atan2(Y,X); p=math.hypot(X,Y); lat=math.atan2(Z,p*(1-e2))
    for _ in range(10):
        N=a/math.sqrt(1-e2*math.sin(lat)**2); lat=math.atan2(Z+e2*N*math.sin(lat),p)
    return lat,lon
WA=6378137.0; WF=1/298.257223563; WE2=2*WF-WF*WF
def to_wgs84(x,y):
    lat,lon=inv_tm(x,y); X,Y,Z=geo2ecef(lat,lon,A,E2)
    lat2,lon2=ecef2geo(X-265,Y+120,Z-358,WA,WE2)
    return math.degrees(lon2),math.degrees(lat2)
# -----------------------------------------------------------------------------------

STREETS = {
    1885: ROOT / "data/08-place-points-qgis/export20261109/streetsParamaribo1885map.geojson",
    1916: ROOT / "data/08-place-points-qgis/export20260619/streetsParamaribo1916map.geojson",
}

# fid -> toevoeging (handmatig gecontroleerd op afstand tot huisnummer n-1 / n+1)
TOEVOEGING_FIX = {2778: "a", 556: "b", 579: "a", 2757: "b", 1068: "a", 2936: "b"}
ADRES_OPEN = {287}  # wijklabel 'Politiewacht': adres1885 EBW vs wijk A, nog niet besloten
# Adresconflicten (adres1885 <> wijk+huisnummer+toevoeging), besluit Thunnis van Oort 9-11-2026.
ADRES_FIX = {
    433: {"huisnummer_1885": "100"},                      # B100: losse velden volgen adres
    873: {"toevoeging_1885": ""},                         # D51: toevoeging b vervalt
    1522: {"adres_1885": "F92"},                          # F92: adres aangevuld
    3039: {"toevoeging_1885": "a"},                       # F28a (volgt na F28, fid 1456)
    3060: {"wijk_1885": "F"},                             # F150b: wijk is F, niet TBW
    3064: {"adres_1885": "TBW349b"},                      # TMW -> TBW
    3132: {"toevoeging_1885": "fb"},                      # TBW6fb
    3133: {"toevoeging_1885": "fa"},                      # TBW6fa
    # huisnummer ontbrak in losse velden; aangevuld uit adres1885
    2629: {"huisnummer_1885": "206"},                     # F206
    3043: {"huisnummer_1885": "54"},                      # F54b
    3044: {"huisnummer_1885": "457"},                     # F457a
}

FIELDS = [
    ("wijk_1885", "wijk1885"), ("huisnummer_1885", "huisnummer1885"),
    ("toevoeging_1885", "toevoeging1885"), ("adres_1885", "adres1885"),
    ("straatnaam_1885", "straatnaam1885"), ("beschrijving_1885", "beschrijving1885"),
    ("beschrijving_1916", "beschrijving1916"), ("legenda_1885", "legenda1885"),
    ("legenda_1916", "legenda1916"), ("redactioneel_commentaar", "red_commentaar"),
]


def t(v):
    """Maak een veldwaarde tekst: None wordt leeg, witruimte wordt genormaliseerd."""
    return "" if v is None else " ".join(str(v).split())


def main():
    """Bouw de CSV en GeoJSON van de locatiepunten, met de correcties uit de moduledocstring."""
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
        r.update(ADRES_FIX.get(fid, {}))
        if (r["huisnummer_1885"] or r["adres_1885"]) and fid not in ADRES_OPEN and \
                r["adres_1885"] != f"{r['wijk_1885']}{r['huisnummer_1885']}{r['toevoeging_1885']}":
            sys.exit(f"Adres klopt niet met losse velden (fid {fid}): {r}")
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


def build_streets():
    """Straatlijnen 1885 en 1916: id per jaar op volgorde van de bron, lege naam -> null.
    '[naamloos]' betekent: op de kaart zonder naam; null: naam (nog) niet ingevoerd.
    Lijnen zonder coördinaten en exacte dubbelingen (ook omgekeerd) worden overgeslagen;
    de id's van de overige lijnen blijven gelijk (gaten in de nummering)."""
    def coords_key(geom):
        c = (geom or {}).get("coordinates") or []
        flat = json.dumps(c)
        if geom and geom.get("type") == "MultiLineString":
            rev = json.dumps([list(reversed(x)) for x in reversed(c)])
        else:
            rev = json.dumps(list(reversed(c)))
        return min(flat, rev)

    def is_empty(geom):
        c = (geom or {}).get("coordinates")
        return not c or all(not x for x in c)

    for year, src in STREETS.items():
        feats = json.loads(src.read_text(encoding="utf-8"))["features"]
        out, seen, skipped = [], {}, []
        for i, f in enumerate(feats, 1):
            props = f.get("properties") or {}
            if is_empty(f.get("geometry")):
                skipped.append((i, "geen geometrie")); continue
            k = (t(props.get("Name")), coords_key(f["geometry"]))
            if k in seen:
                skipped.append((i, f"dubbel van {seen[k]}")); continue
            seen[k] = i
            naam = t(props.get("Name")) or None
            sid = f"stm-{year}-street-{i:03d}"
            out.append({"type": "Feature", "id": sid, "geometry": f["geometry"],
                        "properties": {"straat_id": sid, "naam": naam, "kaartjaar": year,
                                       "bron_fid": i}})
        (OUT / f"straten_paramaribo_{year}.geojson").write_text(json.dumps(
            {"type": "FeatureCollection", "name": f"straten_paramaribo_{year}", "features": out},
            ensure_ascii=False), encoding="utf-8")
        print(year, len(out), "straatsegmenten;", sum(1 for x in out if not x["properties"]["naam"]),
              "zonder naam; overgeslagen:", skipped)


def build_wijken():
    """Wijkgrenzen 1885 omzetten van EPSG:31171 naar WGS84 (CRS84)."""
    d = json.loads(WIJKEN_1885.read_text(encoding="utf-8"))

    def conv(c):
        return [conv(x) for x in c] if isinstance(c[0], list) else [round(v, 8) for v in to_wgs84(*c[:2])]

    out = []
    for f in d["features"]:
        wijk = t(f["properties"].get("wijk"))
        out.append({"type": "Feature", "id": f"wijk-1885-{wijk}",
                    "properties": {"wijk_1885": wijk}, "geometry": {
                        "type": f["geometry"]["type"], "coordinates": conv(f["geometry"]["coordinates"])}})
    ids = [f["id"] for f in out]
    if len(set(ids)) != len(ids) or any(i.endswith("-") for i in ids):
        sys.exit(f"Onverwachte wijkgrenzen: {ids}")
    (OUT / "wijkgrenzen_paramaribo_1885.geojson").write_text(json.dumps(
        {"type": "FeatureCollection", "name": "wijkgrenzen_paramaribo_1885", "features": out},
        ensure_ascii=False), encoding="utf-8")
    print(len(out), "wijken 1885")


if __name__ == "__main__":
    main()
    build_streets()
    build_wijken()
