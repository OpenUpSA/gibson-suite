#!/usr/bin/env python3
"""Generate public/layer-dates.json — compact per-layer TIME availability.

The timelapse tool needs to know which dates each GIBS layer has imagery for.
That data lives in the WMTS capabilities document, which is huge (5+ MB
minified) and times out when proxied through Netlify (504 Gateway Timeout).

Instead of shipping the whole XML, this script extracts ONLY the raw TIME
dimension values (interval strings like "2023-02-10/2023-02-23/P1D" plus
single dates) for every layer that has a time dimension, and writes them to
public/layer-dates.json. The app fetches that small static file (served
straight from the CDN — no proxy, no timeout) and expands the intervals
client-side exactly as it used to with the XML.

Usage: python3 work/gen_layer_dates.py
Output: public/layer-dates.json  (format: { "<layerId>": ["val", ...], ... })

Regenerate whenever the caps change (e.g. a new satellite comes online):
  1. curl -o work/wmts_caps.xml \
       https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml
  2. python3 work/gen_layer_dates.py
"""
import json
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CAPS = ROOT / 'work' / 'wmts_caps.xml'
OUT = ROOT / 'public' / 'layer-dates.json'

NS = {
    'wmts': 'http://www.opengis.net/wmts/1.0',
    'ows': 'http://www.opengis.net/ows/1.1',
}


def extract_time_values(caps_path: Path) -> dict:
    """Return { layerId: [raw TIME dimension values...] } for every layer
    that declares a time dimension. Values are kept verbatim (intervals
    "start/end/period" and single dates) — the client expands them."""
    tree = ET.parse(caps_path)
    root = tree.getroot()
    out = {}

    def text(el, xpath):
        e = el.find(xpath, NS)
        return e.text.strip() if e is not None and e.text else None

    for layer in root.findall('.//wmts:Layer', NS):
        ident = text(layer, 'ows:Identifier')
        if not ident:
            continue
        for dim in layer.findall('wmts:Dimension', NS):
            if (text(dim, 'ows:Identifier') or '').lower() != 'time':
                continue
            values = [v.text.strip() for v in dim.findall('wmts:Value', NS) if v.text and v.text.strip()]
            if values:
                out[ident] = values
            break
    return out


def main():
    if not CAPS.exists():
        raise SystemExit(f'missing {CAPS} — download it first (see header comment)')
    dates = extract_time_values(CAPS)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(dates, indent=0, separators=(',', ':')), encoding='utf-8')
    n_layers = len(dates)
    n_values = sum(len(v) for v in dates.values())
    size_kb = OUT.stat().st_size / 1024
    print(f'wrote {OUT} ({size_kb:.1f} KB, {n_layers} layers, {n_values} raw values)')


if __name__ == '__main__':
    main()