#!/usr/bin/env python3
"""
Derive shareable copies of suriname_person_search.db with the right access level
per dataset.

Access levels (see POLICY below)
--------------------------------
  public     Fully open: may be shown, searched and downloaded.
  view_only  May be searched, shown and linked in a presentation, with a link to
             the archive's own web page, but NEVER offered as a bulk download.
             (Migration registers: searchable on the websites of the Nationaal
             Archief NL / Suriname, data itself not downloadable.)
  link_only  Not public. May be used in the background to link persons, but is
             shown only as a minimal reference such as "Geboorteakte 1872-03-04":
             record type + date, no names, places or other content.
             (Civil records under embargo.)
  Any dataset not listed in POLICY is left out entirely ("fail closed").

Build variants (--tier)
-----------------------
  presentation  For a served, public presentation (e.g. Datasette at HackaLOD):
                public + view_only datasets in full, link_only datasets reduced to
                the table `restricted_links`. Serve it with downloads and free SQL
                switched off (the script prints the command). Do NOT hand out or
                publish this file itself: it contains view_only data.
  open          For an open-data download: public datasets only. The other
                datasets appear only in `dataset_access` as a description.

The full local database (all data) is simply the file Kilo builds; that one is
for the team only and never leaves the team.

Safety principles
-----------------
* Allowlist per dataset; anything that cannot be traced to an allowed dataset is
  dropped.
* Rows are copied into a brand-new file, so nothing hidden lingers in free pages.
* After building, the file is checked for dataset ids, source paths and a sample
  of names from hidden records. On any hit the file is deleted.

Usage
-----
    python3 make_public_db.py --tier presentation \
        --src suriname_person_search.db --out stm_presentation.db \
        --external-url "12-migratie-datasets[collection~hindost]=https://www.nationaalarchief.nl/onderzoeken/index/nt00345/{item_id}" \
        --external-url "12-migratie-datasets[collection~chin]=https://www.nationaalarchief.nl/onderzoeken/index/nt00347/{item_id}"

  --external-url "DATASET[COLUMN~TEXT]=TEMPLATE": for records of DATASET whose
  COLUMN contains TEXT, build a link from TEMPLATE; {placeholders} are filled with
  columns of the certificates table. The [COLUMN~TEXT] part is optional.
  Which column holds the archive's record code must be checked against the data.

    python3 make_public_db.py --tier open \
        --src suriname_person_search.db --out stm_open.db

Standard library only.
"""
import argparse
import mmap
import os
import re
import sqlite3
import sys

POLICY = {
    "02-death": "public",
    "03-birth": "public",
    "04-ward-registers": "public",
    "05-slave-emancipation": "public",
    "06-almanakken": "public",
    "09-volkstelling-1921": "public",
    "10-volkstelling-1950": "public",      # source already limited to privacy-free records
    "11-madeisu": "view_only",             # public source, but no clear licence yet
    "12-migratie-datasets": "view_only",
    "13-civil": "link_only",
}

# Dataset-level source pages (used when no per-record link exists).
DATASET_URL = {
    "11-madeisu": "https://www.madeisu.org/historisch-register/",
    # dashboard alternative: https://datastudio.google.com/reporting/16916ebb-ea80-468a-8a34-210ff4ed5adb/page/p_c7sxt6zozd
    "12-migratie-datasets": "https://nationaalarchief.sr/onderzoeken/alle-genealogie",
}

ACCESS_NOTE = {
    "public": "Public.",
    "view_only": "Searchable via the archive's website; not available for bulk download.",
    "link_only": "Under embargo. Used only to link persons; shown as record type, date and archive reference.",
    "excluded": "Not included.",
}

# record_type -> short Dutch label for link_only references
RECORD_LABELS = [
    ("birth", "Geboorteakte"),
    ("geboorte", "Geboorteakte"),
    ("death", "Overlijdensakte"),
    ("overlijden", "Overlijdensakte"),
    ("marriage", "Huwelijksakte"),
    ("huwelijk", "Huwelijksakte"),
    ("recognition", "Erkenningsakte"),
    ("erkenning", "Erkenningsakte"),
]

PERSON_REF_COLS = ("person_id", "from_person", "to_person")

# Lookup tables that build_db.py derives from `persons` (CREATE TABLE ... AS SELECT).
# They carry no provenance column, so they are never copied: they are recomputed
# from the rows that ended up in the new file, using build_db.py's own SQL.
DERIVED_TABLES = ("cross_dataset_names", "contract_numbers")


def load_derived_sql():
    """Return build_db.py's CROSS_DATASET script, or None if it cannot be loaded."""
    import importlib.util
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "build_db.py")
    if not os.path.exists(path):
        return None
    spec = importlib.util.spec_from_file_location("stm_build_db", path)
    mod = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(mod)
    except Exception as exc:  # noqa: BLE001 - report and fail closed
        print(f"NOTE: could not load build_db.py ({exc}); derived lookup tables left out.")
        return None
    return getattr(mod, "CROSS_DATASET", None)
SERVE_CMD = ("uvx datasette --immutable {out} "
             "--setting allow_download off --setting allow_csv_stream off "
             "--setting default_allow_sql off --setting max_returned_rows 100")


def q(name):
    return '"' + name.replace('"', '""') + '"'


def cols_of(conn, schema, table):
    return [r[1] for r in conn.execute(f"PRAGMA {schema}.table_info({q(table)})")]


def label_for(record_type):
    rt = (record_type or "").lower()
    for key, label in RECORD_LABELS:
        if key in rt:
            return label
    return "Akte (restricted)"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tier", required=True, choices=["presentation", "open"])
    ap.add_argument("--src", required=True, help="full (local) database")
    ap.add_argument("--out", required=True, help="new database file")
    ap.add_argument("--external-url", action="append", default=[],
                    help="DATASET[COLUMN~TEXT]=URL template with {column} placeholders, e.g. for the archive website (repeatable)")
    ap.add_argument("--force", action="store_true", help="overwrite an existing output file")
    args = ap.parse_args()

    if not os.path.exists(args.src):
        sys.exit(f"Source file not found: {args.src}")
    if os.path.abspath(args.src) == os.path.abspath(args.out):
        sys.exit("--out must not be the same file as --src")
    if os.path.exists(args.out):
        if not args.force:
            sys.exit(f"{args.out} already exists; use --force to overwrite")
        os.remove(args.out)
    # --external-url "DATASET=TEMPLATE" or "DATASET[COLUMN~TEXT]=TEMPLATE"
    # TEMPLATE may use any certificates column as {placeholder}; first matching rule wins.
    url_rules = []
    for spec in args.external_url:
        m = re.match(r"^\s*([^\[=]+?)\s*(?:\[\s*(\w+)\s*~\s*([^\]]+?)\s*\])?\s*=\s*(\S+)\s*$", spec)
        if not m or "{" not in m.group(4):
            sys.exit(f"Invalid --external-url: {spec}\n"
                     "  expected DATASET=https://...{{column}}  or  DATASET[column~text]=https://...{{column}}")
        url_rules.append(m.groups())

    conn = sqlite3.connect(f"file:{args.src}?mode=ro", uri=True)
    conn.execute("ATTACH DATABASE ? AS pub", (args.out,))
    src_tables = {r[0]: r[1] for r in conn.execute(
        "SELECT name, sql FROM main.sqlite_master WHERE type='table'")}
    for needed in ("sources", "certificates", "persons"):
        if needed not in src_tables:
            sys.exit(f"Table '{needed}' missing from the source; stopping.")
    src_cols = cols_of(conn, "main", "sources")
    cert_cols = cols_of(conn, "main", "certificates")

    # ---- access level per dataset ---------------------------------------------------------
    all_ds = [r[0] for r in conn.execute("SELECT source_dataset FROM main.sources")]
    flag = dict(conn.execute("SELECT source_dataset, embargo FROM main.sources")) if "embargo" in src_cols else {}
    level = {}
    for ds in all_ds:
        lvl = POLICY.get(ds, "excluded")
        # The source marks every restricted dataset with embargo=1 (both the
        # migration registers and the civil records). POLICY makes the finer,
        # deliberate distinction; the flag can only stop a dataset from being
        # treated as fully public.
        if flag.get(ds) and lvl == "public":
            print(f"NOTE: {ds} is flagged as restricted in the source; treated as view_only.")
            lvl = "view_only"
        if args.tier == "open" and lvl != "public":
            lvl = "excluded"
        level[ds] = lvl
    visible = sorted(d for d, l in level.items() if l in ("public", "view_only"))
    link_only = sorted(d for d, l in level.items() if l == "link_only")
    hidden = sorted(d for d in all_ds if d not in visible)

    print(f"Variant: {args.tier}")
    for lvl in ("public", "view_only", "link_only", "excluded"):
        ds = [d for d in all_ds if level[d] == lvl]
        if ds:
            print(f"  {lvl:<10}: {', '.join(ds)}")
    for ds in sorted(set(POLICY) - set(all_ds)):
        print(f"  (not in source: {ds})")
    if not visible:
        sys.exit("No visible datasets left; stopping.")

    conn.execute("CREATE TEMP TABLE vis_ds(ds TEXT PRIMARY KEY)")
    conn.executemany("INSERT INTO vis_ds VALUES (?)", [(d,) for d in visible])

    fts = {n: s for n, s in src_tables.items() if s and s.upper().startswith("CREATE VIRTUAL TABLE")}
    shadow = {n for n in src_tables for f in fts if n.startswith(f + "_")}
    plain = [n for n in src_tables if n not in fts and n not in shadow and not n.startswith("sqlite_")]

    for name in plain:
        sql = src_tables[name]
        if sql.upper().startswith("CREATE TABLE IF NOT EXISTS "):
            conn.execute("CREATE TABLE IF NOT EXISTS pub." + sql[len("CREATE TABLE IF NOT EXISTS "):])
        else:
            conn.execute("CREATE TABLE pub." + sql[len("CREATE TABLE "):])

    copied, skipped = {}, {}

    def copy(table, where):
        cl = ", ".join(q(c) for c in cols_of(conn, "main", table))
        cur = conn.execute(f"INSERT INTO pub.{q(table)} ({cl}) SELECT {cl} FROM main.{q(table)} AS t WHERE {where}")
        copied[table] = cur.rowcount

    # 1) certificates and persons of visible datasets
    copy("certificates", "t.source_dataset IN (SELECT ds FROM vis_ds)")
    copy("persons", "t.source_dataset IN (SELECT ds FROM vis_ds)")
    cur = conn.execute("""DELETE FROM pub.persons WHERE certificate_id IS NOT NULL
                          AND certificate_id NOT IN (SELECT certificate_id FROM pub.certificates)""")
    copied["persons"] -= cur.rowcount
    copy("sources", "t.source_dataset IN (SELECT ds FROM vis_ds)")

    # 2) every other table: keep a row only if all its links point to visible data
    for table in plain:
        if table in ("certificates", "persons", "sources"):
            continue
        if table in DERIVED_TABLES:
            conn.execute(f"DROP TABLE pub.{q(table)}")   # recomputed below
            continue
        cl = cols_of(conn, "main", table)
        refs = [c for c in PERSON_REF_COLS if c in cl]
        if not ("source_dataset" in cl or "certificate_id" in cl or refs):
            skipped[table] = "no traceable provenance (fail closed)"
            continue
        conds = []
        if "source_dataset" in cl:
            conds.append("t.source_dataset IN (SELECT ds FROM vis_ds)")
        if "certificate_id" in cl:
            conds.append("(t.certificate_id IS NULL OR t.certificate_id IN (SELECT certificate_id FROM pub.certificates))")
        for c in refs:
            conds.append(f"(t.{q(c)} IS NULL OR t.{q(c)} IN (SELECT person_id FROM pub.persons))")
        if "source_dataset" not in cl:
            links = (["certificate_id"] if "certificate_id" in cl else []) + refs
            conds.append("(" + " OR ".join(f"t.{q(c)} IS NOT NULL" for c in links) + ")")
        copy(table, " AND ".join(conds))
    for table in skipped:
        conn.execute(f"DROP TABLE pub.{q(table)}")

    # 3) link_only: minimal references from visible persons to hidden records
    # Archive reference columns copied for the hidden record (only those present in the source).
    # These are public archival identifiers so people can look up the scan at the archive.
    ref_cols = [c for c in ("collection", "register", "inventory_number", "certificate_number", "folio")
                if c in cert_cols]
    conn.execute(f"""CREATE TABLE pub.restricted_links (
        person_id INTEGER NOT NULL,      -- visible person
        relation_type TEXT, confidence TEXT,
        record_label TEXT NOT NULL,      -- e.g. 'Geboorteakte'
        record_date TEXT                 -- date (or year) of the hidden record
        {''.join(f', {q(c)} TEXT' for c in ref_cols)})""")
    n_links = 0
    if link_only and "relations" in src_tables:
        rel_cols = cols_of(conn, "main", "relations")
        date_expr = ", ".join(f"c.{q(c)}" for c in ("event_date", "cert_date", "event_year") if c in cert_cols) or "NULL"
        date_expr = f"COALESCE({date_expr})" if "," in date_expr else date_expr
        rtype = "r.relation_type" if "relation_type" in rel_cols else "NULL"
        conf = "r.confidence" if "confidence" in rel_cols else "NULL"
        ph = ",".join("?" * len(link_only))
        rows = []
        for vis_col, hid_col in (("from_person", "to_person"), ("to_person", "from_person")):
            if vis_col not in rel_cols or hid_col not in rel_cols:
                continue
            refs_sql = "".join(f", c.{q(c)}" for c in ref_cols)
            rows += conn.execute(f"""
                SELECT r.{vis_col}, {rtype}, {conf}, c.record_type, {date_expr}{refs_sql}
                FROM main.relations r
                JOIN pub.persons pv ON pv.person_id = r.{vis_col}
                JOIN main.persons ph ON ph.person_id = r.{hid_col}
                JOIN main.certificates c ON c.certificate_id = ph.certificate_id
                WHERE ph.source_dataset IN ({ph})""", link_only).fetchall()
        ph_n = 5 + len(ref_cols)
        conn.executemany(f"INSERT INTO pub.restricted_links VALUES ({','.join('?' * ph_n)})",
                         [(r[0], r[1], r[2], label_for(r[3]), None if r[4] is None else str(r[4]))
                          + tuple(None if v is None else str(v) for v in r[5:])
                          for r in rows])
        n_links = len(rows)

    # 4) per-record access level + link to the archive's own web page
    conn.execute("""CREATE TABLE pub.record_access (
        certificate_id INTEGER PRIMARY KEY, access_level TEXT, external_url TEXT)""")
    for rule in url_rules:
        if rule[0] not in visible:
            print(f"NOTE: --external-url for {rule[0]} ignored (dataset not visible in this tier).")
        for col in [rule[1]] + re.findall(r"\{(\w+)\}", rule[3]):
            if col and col not in cert_cols:
                sys.exit(f"--external-url uses column '{col}', which is not in certificates. "
                         f"Available: {', '.join(cert_cols)}")
    n_urls = {}
    for ds in visible:
        rules = [r for r in url_rules if r[0] == ds]
        if not rules and level[ds] != "view_only":
            continue
        cur = conn.execute("SELECT * FROM pub.certificates WHERE source_dataset=?", (ds,))
        names = [d[0] for d in cur.description]
        batch = []
        for row in cur:
            rec = dict(zip(names, row))
            url = None
            for _, mcol, mtext, tpl in rules:
                if mcol and mtext.lower() not in str(rec.get(mcol) or "").lower():
                    continue
                vals = {k: rec.get(k) for k in re.findall(r"\{(\w+)\}", tpl)}
                if all(v not in (None, "") for v in vals.values()):
                    url = tpl.format(**{k: str(v) for k, v in vals.items()})
                break
            batch.append((rec["certificate_id"], level[ds], url or DATASET_URL.get(ds)))
        conn.executemany("INSERT INTO pub.record_access VALUES (?,?,?)", batch)
        n_urls[ds] = (sum(1 for b in batch if b[2] and b[2] != DATASET_URL.get(ds)), len(batch))
        if level[ds] == "view_only" and not rules and not DATASET_URL.get(ds):
            print(f"NOTE: no --external-url for {ds}; link to the archive website is still missing.")

    # 5) dataset-level description of every dataset
    conn.execute("""CREATE TABLE pub.dataset_access (
        source_dataset TEXT PRIMARY KEY, title TEXT, access_level TEXT,
        record_count INTEGER, note TEXT, source_url TEXT)""")
    for ds in all_ds:
        title = conn.execute("SELECT title FROM main.sources WHERE source_dataset=?", (ds,)).fetchone()[0] \
            if "title" in src_cols else None
        n = conn.execute("SELECT COUNT(*) FROM main.certificates WHERE source_dataset=?", (ds,)).fetchone()[0]
        conn.execute("INSERT INTO pub.dataset_access VALUES (?,?,?,?,?,?)",
                     (ds, title, level[ds], n, ACCESS_NOTE[level[ds]], DATASET_URL.get(ds)))

    # 6) indexes and full-text search
    for (sql,) in conn.execute("SELECT sql FROM main.sqlite_master WHERE type='index' AND sql IS NOT NULL").fetchall():
        tbl = sql.split(" ON ", 1)[1].split("(", 1)[0].strip().strip('"')
        if tbl in plain and tbl not in skipped and tbl not in DERIVED_TABLES:
            if " IF NOT EXISTS " in sql.upper():
                i = sql.upper().index(" IF NOT EXISTS ") + len(" IF NOT EXISTS ")
            else:
                i = sql.upper().index("INDEX ") + len("INDEX ")
            conn.execute(sql[:i] + "pub." + sql[i:])
    conn.execute("CREATE INDEX pub.idx_restricted_links_person ON restricted_links(person_id)")
    for name, sql in fts.items():
        if "content=" not in sql.replace(" ", "").lower():
            skipped[name] = "standalone search table not copied (fail closed)"
            continue
        conn.execute("CREATE VIRTUAL TABLE pub." + sql[len("CREATE VIRTUAL TABLE "):])
        conn.execute(f"INSERT INTO pub.{q(name)}({q(name)}) VALUES('rebuild')")
    conn.commit()

    # 7) recompute derived lookup tables over the visible persons only
    derived_present = [t for t in DERIVED_TABLES if t in plain]
    if derived_present:
        derived_sql = load_derived_sql()
        if derived_sql:
            conn.execute("DETACH DATABASE pub")
            out_conn = sqlite3.connect(args.out)
            out_conn.executescript(derived_sql)
            out_conn.commit()
            for t in derived_present:
                exists = out_conn.execute("SELECT 1 FROM sqlite_master WHERE name=?", (t,)).fetchone()
                copied[t] = out_conn.execute(f"SELECT COUNT(*) FROM {q(t)}").fetchone()[0] if exists else 0
                if not exists:
                    skipped[t] = "not recomputed (build_db.py SQL did not create it)"
            out_conn.close()
            conn.execute("ATTACH DATABASE ? AS pub", (args.out,))
        else:
            for t in derived_present:
                skipped[t] = "derived lookup table left out (build_db.py not found next to this script)"

    # ---- verification ---------------------------------------------------------------------
    problems = []
    for t in plain:
        if t in skipped:
            continue
        if "source_dataset" in cols_of(conn, "pub", t):
            bad = conn.execute(f"SELECT COUNT(*) FROM pub.{q(t)} WHERE source_dataset NOT IN (SELECT ds FROM vis_ds)").fetchone()[0]
            if bad:
                problems.append(f"{t}: {bad} rows from a non-visible dataset")
    needles = set(hidden)
    if "raw_path" in src_cols and hidden:
        for (p,) in conn.execute(f"SELECT raw_path FROM main.sources WHERE source_dataset IN ({','.join('?' * len(hidden))})", hidden):
            if p:
                needles.add(p.rstrip("/").split("/")[-1])
    for (t,) in conn.execute("SELECT name FROM pub.sqlite_master WHERE type='table' AND sql NOT LIKE 'CREATE VIRTUAL%'").fetchall():
        if t == "dataset_access" or any(t.startswith(f + "_") for f in fts):
            continue
        for c in cols_of(conn, "pub", t):
            for n in needles:
                hit = conn.execute(f"SELECT COUNT(*) FROM pub.{q(t)} WHERE CAST({q(c)} AS TEXT) LIKE ?", (f"%{n}%",)).fetchone()[0]
                if hit:
                    problems.append(f"{t}.{c} contains '{n}' ({hit}x)")
    # sample of names that occur ONLY in hidden datasets must not appear anywhere in the file
    sample = []
    if hidden:
        ph = ",".join("?" * len(hidden))
        sample = [r[0] for r in conn.execute(f"""
            SELECT DISTINCT full_name FROM main.persons
            WHERE source_dataset IN ({ph}) AND length(full_name) >= 6
              AND full_name NOT IN (SELECT full_name FROM main.persons
                                    WHERE source_dataset NOT IN ({ph}) AND full_name IS NOT NULL)
            ORDER BY random() LIMIT 300""", hidden + hidden)]
    leaked = []
    if sample:
        with open(args.out, "rb") as fh, mmap.mmap(fh.fileno(), 0, access=mmap.ACCESS_READ) as mm:
            hits = [s for s in sample if mm.find(s.encode("utf-8")) != -1]
        # A hidden name that is only a given name (e.g. "Adriaan Salomon") also occurs
        # inside longer public names ("Adriaan Salomon Parke"). Such a hit is explained
        # by visible data and is not a leak; the same holds for alternative names of
        # visible persons (e.g. an emancipation name in person_names). Only
        # unexplained hits count.
        explain_sql = ["SELECT 1 FROM pub.persons WHERE full_name LIKE ?1"]
        if "person_names" in plain and "person_names" not in skipped \
                and "value" in cols_of(conn, "pub", "person_names"):
            explain_sql.append("SELECT 1 FROM pub.person_names WHERE value LIKE ?1")
        explain_sql = " UNION ALL ".join(explain_sql) + " LIMIT 1"
        leaked = [s for s in hits if not conn.execute(explain_sql, (f"%{s}%",)).fetchone()]
        if hits:
            print(f"Sampled hidden names also found in the file: {len(hits)}, "
                  f"of which explained by visible names: {len(hits) - len(leaked)}")
    conn.execute("DETACH DATABASE pub")
    conn.close()
    if sample:
        if leaked:
            problems.append(f"{len(leaked)} of {len(sample)} sampled names from hidden records found, e.g. {leaked[:3]}")

    out = sqlite3.connect(args.out)
    out.execute("ANALYZE")
    out.commit()
    out.close()

    print("\nRows copied:")
    for t, n in copied.items():
        print(f"  {t:<22}{n:>12,}")
    print(f"  {'restricted_links':<22}{n_links:>12,}  (record type, date, archive reference)")
    for ds, (n_ok, n_all) in n_urls.items():
        print(f"  archive links {ds:<21} {n_ok:,} of {n_all:,} records")
    if skipped:
        print("\nNot included:")
        for t, why in skipped.items():
            print(f"  {t}: {why}")
    print(f"\nFile: {args.out} ({os.path.getsize(args.out) / 1_048_576:,.1f} MB)")
    print(f"Sample of hidden names checked: {len(sample)}")

    if problems:
        print("\nCHECK FAILED, possible leak:")
        for p in problems:
            print("  -", p)
        os.remove(args.out)
        sys.exit("File deleted. Do not use.")
    print("Check passed.")
    if args.tier == "presentation":
        print("\nThis file contains view_only data: do not share or publish the file itself; only serve it with:")
        print("  " + SERVE_CMD.format(out=args.out))


if __name__ == "__main__":
    main()
