#!/usr/bin/env python3
"""
GIBS Layer Validator
====================
1. Fetches WMTS Capabilities for BOTH the 'best' and 'all' GIBS endpoints.
2. Parses every available layer — ID, formats, tileMatrixSets, temporal range.
3. For every layer in layers.json (and any extra candidates you add), fires a
   real HTTP GET at a tile over Africa and records the HTTP status.
4. Tries multiple recent dates so a single bad date doesn't kill a good layer.
5. Writes a final report (JSON + human-readable summary) and a ready-to-use
   new layers.json containing ONLY verified-working layers.

Usage:
    python test_gibs_layers.py                  # test current layers.json
    python test_gibs_layers.py --all-caps       # also probe every layer in caps
    python test_gibs_layers.py --workers 8      # parallel requests (default 4)
"""

import argparse
import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
import xml.etree.ElementTree as ET

# ─── Config ──────────────────────────────────────────────────────────────────

ENDPOINTS = {
    "best": "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best",
    "all":  "https://gibs.earthdata.nasa.gov/wmts/epsg3857/all",
}
DEFAULT_ENDPOINT = "best"

SCRIPT_DIR  = Path(__file__).parent
REPO_ROOT   = SCRIPT_DIR.parent
LAYERS_JSON = REPO_ROOT / "src" / "config" / "layers.json"

# Tile coordinates over central Africa (lon≈20°, lat≈0°) at various zoom levels
# Calculated: col = floor((lon+180)/360 * 2^z), row = floor(0.5 * 2^z)
AFRICA_TILES = {
    2: (2, 2),
    3: (4, 4),
    4: (8, 9),
    5: (16, 18),
    6: (32, 36),
    7: (64, 72),
    8: (128, 144),
    9: (256, 288),
}

# How many days back to try (we try each before giving up)
DAYS_BACK = [1, 2, 3, 5, 7, 10, 14, 20, 30, 45, 60, 90]

REQUEST_TIMEOUT = 12  # seconds per tile request

# ─── Capabilities ─────────────────────────────────────────────────────────────

WMTS_NS = {
    "wmts": "http://www.opengis.net/wmts/1.0",
    "ows":  "http://www.opengis.net/ows/1.1",
    "xlink":"http://www.w3.org/1999/xlink",
}


def fetch_capabilities(endpoint_key: str) -> ET.Element:
    base = ENDPOINTS[endpoint_key]
    url  = f"{base}/1.0.0/WMTSCapabilities.xml"
    print(f"  Fetching capabilities: {url}")
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    return ET.fromstring(r.text)


def parse_capabilities(root: ET.Element) -> dict:
    """Return dict[layer_id] = {title, formats, tms_list, time_default, time_range}"""
    layers = {}
    contents = root.find(".//wmts:Contents", WMTS_NS)
    if contents is None:
        return layers

    for layer in contents.findall("wmts:Layer", WMTS_NS):
        lid = layer.findtext("ows:Identifier", namespaces=WMTS_NS)
        if not lid:
            continue

        formats = [
            f.text for f in layer.findall("wmts:Format", WMTS_NS) if f.text
        ]

        tms_list = [
            link.findtext("wmts:TileMatrixSet", namespaces=WMTS_NS)
            for link in layer.findall("wmts:TileMatrixSetLink", WMTS_NS)
        ]
        tms_list = [t for t in tms_list if t and "GoogleMapsCompatible_Level" in t]

        time_default = None
        time_range   = None
        for dim in layer.findall("wmts:Dimension", WMTS_NS):
            dim_id = dim.findtext("ows:Identifier", namespaces=WMTS_NS) or ""
            if dim_id.lower() != "time":
                continue
            time_default = dim.findtext("wmts:Default", namespaces=WMTS_NS)
            # Value may be an extent like "2012-01-01/2024-12-31/P1D"
            val = dim.findtext("wmts:Value", namespaces=WMTS_NS)
            if val:
                time_range = val

        layers[lid] = {
            "title":        layer.findtext("ows:Title", namespaces=WMTS_NS),
            "formats":      formats,
            "tms_list":     tms_list,
            "time_default": time_default,
            "time_range":   time_range,
        }

    return layers


# ─── Tile testing ─────────────────────────────────────────────────────────────

def zoom_from_tms(tms: str) -> int:
    m = re.search(r"Level(\d+)", tms)
    return int(m.group(1)) if m else 6


def build_tile_url(base: str, layer_id: str, tms: str, fmt: str,
                   date_str: str, zoom: int, row: int, col: int) -> str:
    ext = "jpg" if "jpeg" in fmt else "png"
    return f"{base}/{layer_id}/default/{date_str}/{tms}/{zoom}/{row}/{col}.{ext}"


def test_one_tile(url: str) -> int:
    """Return HTTP status code, or -1 on network error."""
    try:
        r = requests.get(url, timeout=REQUEST_TIMEOUT)
        return r.status_code
    except Exception:
        return -1


def probe_layer(layer_id: str, cap_info: dict | None, endpoint_key: str,
                forced_tms: str | None = None, forced_fmt: str | None = None,
                hint_date: str | None = None) -> dict:
    """
    Try real tile requests for *layer_id* until we get a 200.
    Returns a result dict.
    """
    base = ENDPOINTS[endpoint_key]

    if cap_info is None:
        return {
            "layer_id": layer_id, "status": "not_in_caps",
            "working_date": None, "tms": None, "format": None, "url": None,
        }

    tms_options = [forced_tms] if forced_tms else cap_info["tms_list"]
    if not tms_options:
        return {
            "layer_id": layer_id, "status": "no_gmc_tms",
            "working_date": None, "tms": None, "format": None, "url": None,
        }

    fmt = forced_fmt or (
        "image/jpeg" if "image/jpeg" in cap_info["formats"] else "image/png"
    )

    today = datetime.now(tz=timezone.utc)

    # Build candidate dates
    candidate_dates = []
    if hint_date:
        candidate_dates.append(hint_date[:10])
    if cap_info.get("time_default"):
        d = cap_info["time_default"][:10]
        if d not in candidate_dates:
            candidate_dates.append(d)
    for days_back in DAYS_BACK:
        d = (today - timedelta(days=days_back)).strftime("%Y-%m-%d")
        if d not in candidate_dates:
            candidate_dates.append(d)

    # For each TMS option and each date, try a tile
    for tms in tms_options:
        max_zoom = zoom_from_tms(tms)
        # Use zoom = max_zoom-1 or max_zoom clamped to our test tile dict
        test_zoom = max(2, min(max_zoom, 5))
        # Find closest zoom with pre-computed Africa tile coords
        z = min(AFRICA_TILES.keys(), key=lambda k: abs(k - test_zoom))
        row, col = AFRICA_TILES[z]

        for date_str in candidate_dates:
            url = build_tile_url(base, layer_id, tms, fmt, date_str, z, row, col)
            code = test_one_tile(url)
            if code == 200:
                return {
                    "layer_id":     layer_id,
                    "status":       "ok",
                    "http_code":    code,
                    "working_date": date_str,
                    "tms":          tms,
                    "format":       fmt,
                    "url":          url,
                    "max_zoom":     max_zoom,
                }
            time.sleep(0.03)

    # Nothing worked — record the last URL tried and code
    last_url = build_tile_url(base, layer_id, tms_options[0], fmt,
                              candidate_dates[-1], z, row, col)
    return {
        "layer_id":     layer_id,
        "status":       "broken",
        "http_code":    test_one_tile(last_url),
        "working_date": None,
        "tms":          tms_options[0],
        "format":       fmt,
        "url":          last_url,
        "max_zoom":     zoom_from_tms(tms_options[0]),
    }


# ─── Load current layers.json ─────────────────────────────────────────────────

def load_current_layers() -> tuple[dict, list[dict]]:
    """Returns (raw_config, flat list of layer dicts with 'category' key added)"""
    with open(LAYERS_JSON) as f:
        cfg = json.load(f)
    flat = []
    for cat, items in cfg.get("categories", {}).items():
        for item in items:
            flat.append({**item, "_category": cat})
    return cfg, flat


# ─── Build new layers.json ────────────────────────────────────────────────────

def build_new_config(original_cfg: dict, results: list[dict],
                     flat_layers: list[dict]) -> dict:
    """
    Returns a new config dict containing only layers that passed.
    Updates tms / format / time fields with the verified values.
    """
    ok_ids = {r["layer_id"]: r for r in results if r["status"] == "ok"}

    new_cats = {}
    for layer in flat_layers:
        lid = layer["id"]
        cat = layer["_category"]
        if lid not in ok_ids:
            continue
        res = ok_ids[lid]
        new_layer = {k: v for k, v in layer.items() if not k.startswith("_")}
        new_layer["tileMatrixSet"] = res["tms"]
        new_layer["format"]        = res["format"]
        new_layer["time"]          = res["working_date"]
        new_cats.setdefault(cat, []).append(new_layer)

    new_cfg = {**original_cfg, "categories": new_cats}
    return new_cfg


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="GIBS Layer Validator")
    parser.add_argument(
        "--endpoint", choices=["best", "all"], default="best",
        help="Which GIBS endpoint to test against (default: best)",
    )
    parser.add_argument(
        "--all-caps", action="store_true",
        help="Also probe every layer found in capabilities (slow — hundreds of layers)",
    )
    parser.add_argument(
        "--workers", type=int, default=4,
        help="Parallel worker threads (default: 4)",
    )
    args = parser.parse_args()

    print("=" * 70)
    print("GIBS Layer Validator")
    print("=" * 70)

    # 1. Fetch capabilities
    print("\n[1] Fetching WMTS capabilities …")
    caps = {}
    for ep_key in ("best", "all"):
        try:
            root = fetch_capabilities(ep_key)
            caps[ep_key] = parse_capabilities(root)
            print(f"      {ep_key}: {len(caps[ep_key])} layers found")
        except Exception as e:
            print(f"      {ep_key}: FAILED ({e})")
            caps[ep_key] = {}

    # Use the chosen endpoint's caps as primary; fall back to 'all'
    ep = args.endpoint
    primary_caps = caps.get(ep, {})

    # 2. Load current layers.json
    print(f"\n[2] Loading current layers.json …")
    original_cfg, flat_layers = load_current_layers()
    print(f"      {len(flat_layers)} layers across {len(original_cfg['categories'])} categories")

    # 3. Build probe list
    probe_list = [(l["id"], l.get("tileMatrixSet"), l.get("format"), l.get("time"))
                  for l in flat_layers]

    if args.all_caps:
        existing_ids = {l["id"] for l in flat_layers}
        for lid in primary_caps:
            if lid not in existing_ids:
                probe_list.append((lid, None, None, None))

    print(f"\n[3] Probing {len(probe_list)} layers against endpoint '{ep}' …")
    print(f"      Workers: {args.workers}  |  Tile region: central Africa")
    print()

    results = []
    done = 0

    def probe_task(item):
        lid, forced_tms, forced_fmt, hint_date = item
        cap_info = primary_caps.get(lid)
        return probe_layer(lid, cap_info, ep,
                           forced_tms=forced_tms,
                           forced_fmt=forced_fmt,
                           hint_date=hint_date)

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(probe_task, item): item for item in probe_list}
        for fut in as_completed(futures):
            res = fut.result()
            results.append(res)
            done += 1
            icon = "✓" if res["status"] == "ok" else "✗"
            detail = (
                f"  → {res['working_date']} via {res['tms']}"
                if res["status"] == "ok"
                else f"  → {res['status']} (HTTP {res.get('http_code', '?')})"
            )
            print(f"  [{done:>3}/{len(probe_list)}] {icon} {res['layer_id']}{detail}")

    # 4. Separate results
    ok      = [r for r in results if r["status"] == "ok"]
    broken  = [r for r in results if r["status"] not in ("ok",)]
    in_cur  = {l["id"] for l in flat_layers}
    ok_cur  = [r for r in ok     if r["layer_id"] in in_cur]
    ok_new  = [r for r in ok     if r["layer_id"] not in in_cur]
    bad_cur = [r for r in broken if r["layer_id"] in in_cur]

    print("\n" + "=" * 70)
    print("RESULTS SUMMARY")
    print("=" * 70)
    print(f"  Current layers tested : {len([r for r in results if r['layer_id'] in in_cur])}")
    print(f"  ✓  Working            : {len(ok_cur)}")
    print(f"  ✗  Broken             : {len(bad_cur)}")
    if args.all_caps:
        print(f"  Extra caps layers OK  : {len(ok_new)}")

    if bad_cur:
        print("\n  BROKEN (in your current layers.json):")
        for r in sorted(bad_cur, key=lambda x: x["layer_id"]):
            print(f"    ✗ {r['layer_id']} — {r['status']} HTTP {r.get('http_code','?')}")
            if r.get("url"):
                print(f"        last tried: {r['url']}")

    if ok_cur:
        print("\n  WORKING:")
        for r in sorted(ok_cur, key=lambda x: x["layer_id"]):
            print(f"    ✓ {r['layer_id']}")
            print(f"        date={r['working_date']}  tms={r['tms']}  fmt={r['format']}")

    # 5. Write report JSON
    report_path = SCRIPT_DIR / "gibs_report.json"
    report = {
        "generated":    datetime.now(tz=timezone.utc).isoformat(),
        "endpoint":     ep,
        "caps_counts":  {k: len(v) for k, v in caps.items()},
        "results":      results,
    }
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)
    print(f"\n[4] Full report written → {report_path}")

    # 6. Write new layers.json (working layers only)
    new_cfg = build_new_config(original_cfg, results, flat_layers)
    new_path = SCRIPT_DIR / "layers_verified.json"
    with open(new_path, "w") as f:
        json.dump(new_cfg, f, indent=2)

    total_new = sum(len(v) for v in new_cfg["categories"].values())
    print(f"[5] Verified layers.json written → {new_path}")
    print(f"      {total_new} working layers across {len(new_cfg['categories'])} categories")

    if total_new < len(flat_layers):
        dropped = len(flat_layers) - total_new
        print(f"      ⚠  {dropped} layers DROPPED (not returning tiles)")

    print("\nDone.")
    return 0 if len(bad_cur) == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
