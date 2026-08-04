#!/usr/bin/env python3
"""Regenerate layers.json with GIBS metadata (descriptions, dates, categories).

Reads the Worldview metadata markdown files (fetched from
nasa-gibs/worldview repo) + WMTS capabilities date ranges, and writes the
section-based layers.json that the app consumes.

Usage: python3 gen_layers_meta.py
"""
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MD = Path('/tmp')  # metadata markdown files live here after download

# ---- markdown -> minimal HTML ----------------------------------------------
def md_to_html(text: str) -> str:
    if not text:
        return ''
    # Escape & then apply structures (order matters)
    text = text.replace('&', '&amp;')
    out = []
    for line in text.split('\n'):
        line = line.strip()
        if not line:
            continue
        if line.startswith('### '):
            out.append(f'<h4>{line[4:]}</h4>')
            continue
        if line.startswith('###'):
            out.append(f'<h4>{line[3:].strip()}</h4>')
            continue
        # links [text](url)
        line = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2" target="_blank" rel="noopener">\1</a>', line)
        out.append(f'<p>{line}</p>')
    return '\n'.join(out)


# ---- date ranges from WMTS capabilities ------------------------------------
def extract_dates(caps_path: Path):
    tree = ET.parse(caps_path)
    root = tree.getroot()
    ns = {'wmts': 'http://www.opengis.net/wmts/1.0', 'ows': 'http://www.opengis.net/ows/1.1'}
    out = {}

    def get_text(el, xpath):
        e = el.find(xpath, ns)
        return e.text.strip() if e is not None and e.text else None

    for layer in root.findall('.//wmts:Layer', ns):
        ident = get_text(layer, 'ows:Identifier')
        if not ident:
            continue
        values = []
        latest = None
        for dim in layer.findall('wmts:Dimension', ns):
            if get_text(dim, 'ows:Identifier') and get_text(dim, 'ows:Identifier').lower() == 'time':
                d = dim.find('wmts:Default', ns)
                if d is not None and d.text:
                    latest = d.text.strip()
                for v in dim.findall('wmts:Value', ns):
                    if v.text:
                        values.append(v.text.strip())
        if not values:
            continue
        start = None
        end = None
        for v in values:
            parts = v.split('/')
            if len(parts) == 3:
                if not start:
                    start = parts[0]
                end = parts[1]
        out[ident] = {'startDate': start, 'endDate': end, 'latestDate': latest}
    return out


def main():
    caps = ROOT / 'work' / 'wmts_caps.xml'
    dates = extract_dates(caps)

    def d(name):
        return (MD / name).read_text(encoding='utf-8')

    layers = {
        'base': [
            {
                'id': 'BlueMarble_NextGeneration',
                'name': 'Blue Marble',
                'subtitle': 'Static reference',
                'category': 'Base',
                'description': 'Static NASA Blue Marble reference imagery. Good fallback base when daily imagery is patchy; loads at Level8.',
                'gibsDescription': md_to_html(d('md_blue_marble.md')),
                'role': 'base',
                'section': 'base',
                'storyDefault': False,
                'tileMatrixSet': 'GoogleMapsCompatible_Level8',
                'format': 'image/jpeg',
                'legendId': None,
                'startDate': None,
                'endDate': None,
            }
        ],
        'imagery': [
            {
                'id': 'VIIRS_NOAA21_CorrectedReflectance_TrueColor',
                'name': 'True Color',
                'subtitle': 'Current (VIIRS NOAA-21)',
                'category': 'True Color',
                'description': 'Default base map. Most current-generation daily true color, 375m. Use for \'what does it look like today/recently\'.',
                'gibsDescription': md_to_html(d('md_viirs_tc.md')),
                'role': 'base',
                'section': 'imagery',
                'storyDefault': True,
                'tileMatrixSet': 'GoogleMapsCompatible_Level9',
                'format': 'image/jpeg',
                'legendId': None,
                **dates['VIIRS_NOAA21_CorrectedReflectance_TrueColor'],
            },
            {
                'id': 'MODIS_Terra_CorrectedReflectance_TrueColor',
                'name': 'True Color',
                'subtitle': 'Long Record (MODIS Terra)',
                'category': 'True Color',
                'description': 'Only true-color option with a record back to 2000. Use for multi-year/decade before-after comparisons, not day-to-day snapshots.',
                'gibsDescription': md_to_html(d('md_modis_tc.md')),
                'role': 'base',
                'section': 'imagery',
                'storyDefault': False,
                'tileMatrixSet': 'GoogleMapsCompatible_Level9',
                'format': 'image/jpeg',
                'legendId': None,
                **dates['MODIS_Terra_CorrectedReflectance_TrueColor'],
            },
        ],
        'reference': [
            {
                'id': 'Coastlines',
                'name': 'Coastlines',
                'subtitle': 'Shoreline reference',
                'category': 'Reference',
                'description': 'Static vector coastline reference overlay. Uses the GIBS \'default\' time keyword, so it is date-independent and always available.',
                'gibsDescription': md_to_html(d('md_coastlines.md')),
                'role': 'overlay',
                'section': 'reference',
                'storyDefault': True,
                'tileMatrixSet': 'GoogleMapsCompatible_Level9',
                'format': 'image/png',
                'legendId': None,
                'startDate': None,
                'endDate': None,
            },
            {
                'id': 'Reference_Labels',
                'name': 'Place Labels',
                'subtitle': 'City & country names',
                'category': 'Reference',
                'description': 'Place and country labels (GIBS Reference_Labels, Level9). Static reference overlay.',
                'gibsDescription': md_to_html(d('md_labels.md')),
                'role': 'overlay',
                'section': 'reference',
                'storyDefault': False,
                'tileMatrixSet': 'GoogleMapsCompatible_Level9',
                'format': 'image/png',
                'legendId': None,
                'startDate': None,
                'endDate': None,
            },
            {
                'id': 'Reference_Features',
                'name': 'Reference Features',
                'subtitle': 'Political borders',
                'category': 'Reference',
                'description': 'Political border and feature lines (GIBS Reference_Features, Level9). Static reference overlay.',
                'gibsDescription': md_to_html(d('md_features.md')),
                'role': 'overlay',
                'section': 'reference',
                'storyDefault': False,
                'tileMatrixSet': 'GoogleMapsCompatible_Level9',
                'format': 'image/png',
                'legendId': None,
                'startDate': None,
                'endDate': None,
            },
            {
                'id': 'Graticule_15m',
                'name': 'Graticule Grid',
                'subtitle': 'Lat / lon lines',
                'category': 'Reference',
                'description': 'Latitude/longitude graticule (GIBS Graticule_15m, Level13). Static reference overlay.',
                'gibsDescription': md_to_html(d('md_graticule.md')),
                'role': 'overlay',
                'section': 'reference',
                'storyDefault': False,
                'tileMatrixSet': 'GoogleMapsCompatible_Level13',
                'format': 'image/png',
                'legendId': None,
                'startDate': None,
                'endDate': None,
            },
            {
                'id': 'OSM_Land_Mask',
                'name': 'Land Mask',
                'subtitle': 'Ocean darkening',
                'category': 'Reference',
                'description': 'OpenStreetMap-derived land/ocean mask (GIBS OSM_Land_Mask, Level9). Darkens oceans as an underlay.',
                'gibsDescription': md_to_html(d('md_landmask.md')),
                'role': 'overlay',
                'section': 'reference',
                'storyDefault': False,
                'tileMatrixSet': 'GoogleMapsCompatible_Level9',
                'format': 'image/png',
                'legendId': None,
                'startDate': None,
                'endDate': None,
            },
        ],
    }

    cfg = {
        'sections': layers,
        'mapSettings': {
            'center': [0, 30],
            'zoom': 4,
            'minZoom': 2,
            'maxZoom': 12,
        },
        'wmtsBaseUrl': 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best',
        'wmsBaseUrl': 'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi',
        'format': 'image/png',
        '_notes': {
            'provenance': 'Reworked 2026-08-04: full catalogue preserved in layers-full-backup.json. GIBS descriptions fetched from nasa-gibs/worldview metadata; date ranges from WMTS GetCapabilities. Descriptions may contain HTML (rendered in the Add Layer details panel).',
            'timeFormat': 'Per-layer dates are intentionally NOT stored here — resolved at runtime (default for daily layers is yesterday). startDate/endDate reflect GIBS availability windows, shown in layer details.',
        },
    }

    dest = ROOT / 'src' / 'config' / 'layers.json'
    dest.write_text(json.dumps(cfg, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'wrote {dest} ({dest.stat().st_size} bytes)')

    # sanity check
    data = json.loads(dest.read_text(encoding='utf-8'))
    for sec, ls in data['sections'].items():
        for l in ls:
            assert l['name'] and l['subtitle'], f'{l["id"]} missing name/subtitle'
    print('OK: all layers have name + subtitle')


if __name__ == '__main__':
    main()
