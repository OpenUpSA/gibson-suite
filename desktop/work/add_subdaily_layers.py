#!/usr/bin/env python3
"""Add the live geostationary (sub-daily) layers to the Gibson catalogue.

GOES-East/West ABI and Himawari AHI publish a new full-disk frame every 10
minutes over their own hemisphere — the only sub-daily imagery in GIBS that is
a real "what is happening right now" view (IMERG being the other, for rain).

This script is idempotent: it adds the layer objects to src/config/layers.json
(sections.imagery + a new "Storms" category) and the hand-authored copy to
work/layer-content.json, then leaves the assets (legends, previews, dates) to
work/gen_layer_assets.py.

Notes that matter:
  * format is image/png — these are disk products: everything outside the
    satellite's disk has no data, and GIBS only keeps that transparent for PNG
    (a JPEG request comes back with opaque BLACK outside the disk, which would
    paint over the base map wherever the user pans).
  * startDate/endDate come from DescribeDomains, not the WMTS capabilities:
    caps only lists the latest ~100 time periods, which for a 10-minute product
    is the last ~17 hours.

Usage: python3 work/add_subdaily_layers.py
"""
import json
import os
import re
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LAYERS_JSON = os.path.join(ROOT, 'src', 'config', 'layers.json')
CONTENT_JSON = os.path.join(ROOT, 'work', 'layer-content.json')

WMTS_CGI = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi'

CATEGORY = 'Storms'
CATEGORY_ICON = 'fluent:weather-thunderstorm-20-filled'
CATEGORY_DESCRIPTION = (
    'Live geostationary views, refreshed every 10 minutes. Satellites parked '
    'over one spot on Earth watch a single hemisphere continuously — hurricanes, '
    'typhoons and overnight storm intensification as they happen. Each layer '
    'covers its own part of the world (Americas/Atlantic, Pacific, Asia-Pacific).'
)

IR_LEGEND = 'Clean_Longwave_Infrared_Window_Band'

GOES_META = {
    'mission': 'GOES-R Series (NOAA / NASA)',
    'sensors': 'ABI (Advanced Baseline Imager)',
    'energySource': 'Passive',
    'spectralRange': 'Visible & Infrared',
    'spectralResolution': '16 bands',
    'spatialResolution': '0.5–2 km',
    'temporalResolution': '10 minutes',
}

HIMAWARI_META = {
    'mission': 'Himawari (Japan Meteorological Agency)',
    'satellite': 'Himawari-9 (geostationary)',
    'sensors': 'AHI (Advanced Himawari Imager)',
    'energySource': 'Passive',
    'spectralRange': 'Visible & Infrared',
    'spectralResolution': '16 bands',
    'spatialResolution': '0.5–2 km',
    'temporalResolution': '10 minutes',
}

# id → layer entry + hand-authored copy.
#   tms    tile matrix set (Level6 = native cap 6, Level7 = 7)
#   bbox   preview snapshot window (degrees, lon/lat, EPSG:4326)
LAYERS = [
    {
        'id': 'GOES-East_ABI_GeoColor',
        'name': 'Storms — Americas & Atlantic',
        'subtitle': 'GOES-East GeoColor',
        'description': "Natural-colour view of the Americas and Atlantic, a new "
                       "frame every 10 minutes. The layer for tracking hurricanes "
                       "and storms as they happen — a night-time component keeps "
                       "them visible after dark.",
        'about': "GOES-East sits over the equator at 75°W watching one hemisphere "
                 "continuously, so unlike the polar-orbiting daily layers it can "
                 "show a storm growing hour by hour. GeoColor is a natural-colour "
                 "composite with a night-time component (city lights, fires and "
                 "low cloud), which means a hurricane or a dust plume stays "
                 "visible overnight. Outside the satellite's disk there is no "
                 "data — that part of the map shows the base layer only.",
        'links': [
            {'label': 'View in NASA Worldview', 'url': 'https://worldview.earthdata.nasa.gov/?l=GOES-East_ABI_GeoColor'},
            {'label': 'GOES-R mission', 'url': 'https://www.goes-r.gov/'},
        ],
        'tms': 'GoogleMapsCompatible_Level7',
        'bbox': '-95,0,-25,50',
        'meta': {**GOES_META, 'satellite': 'GOES-East (75°W)',
                 'orbit': 'Geostationary, 35,786 km — Americas & Atlantic',
                 'spatialCoverage': 'Americas + Atlantic (full disk)'},
    },
    {
        'id': 'GOES-West_ABI_GeoColor',
        'name': 'Storms — East Pacific',
        'subtitle': 'GOES-West GeoColor',
        'description': "Natural-colour view of the eastern Pacific and western "
                       "Americas, refreshed every 10 minutes — Pacific storm "
                       "systems and hurricanes closing on Mexico or the US.",
        'about': "GOES-West watches the eastern Pacific from 137°W. Same 10-minute "
                 "GeoColor product as its eastern twin, pointed at the other half "
                 "of the Americas' weather.",
        'links': [
            {'label': 'View in NASA Worldview', 'url': 'https://worldview.earthdata.nasa.gov/?l=GOES-West_ABI_GeoColor'},
            {'label': 'GOES-R mission', 'url': 'https://www.goes-r.gov/'},
        ],
        'tms': 'GoogleMapsCompatible_Level7',
        'bbox': '-165,10,-100,55',
        'meta': {**GOES_META, 'satellite': 'GOES-West (137°W)',
                 'orbit': 'Geostationary, 35,786 km — East Pacific',
                 'spatialCoverage': 'E Pacific + W Americas (full disk)'},
    },
    {
        'id': 'Himawari_AHI_Band3_Red_Visible_1km',
        'name': 'Storms — Asia-Pacific',
        'subtitle': 'Himawari Red Visible',
        'description': "Daylight natural-colour view of Asia and the western "
                       "Pacific, a new frame every 10 minutes — typhoon and "
                       "monsoon tracking at 1 km.",
        'about': "Himawari-9 (Japan Meteorological Agency) watches Asia and the "
                 "western Pacific from 140.7°E. This is its red visible band: "
                 "sharp 1 km daylight imagery, but unlike GeoColor it shows "
                 "nothing at night.",
        'links': [
            {'label': 'View in NASA Worldview', 'url': 'https://worldview.earthdata.nasa.gov/?l=Himawari_AHI_Band3_Red_Visible_1km'},
            {'label': 'Himawari (JMA)', 'url': 'https://www.data.jma.go.jp/mscweb/en/himawari89/'},
        ],
        'tms': 'GoogleMapsCompatible_Level7',
        'bbox': '100,-15,160,40',
        'meta': dict(HIMAWARI_META),
    },
    {
        'id': 'GOES-East_ABI_Band13_Clean_Infrared',
        'name': 'Cloud Tops — Americas & Atlantic',
        'subtitle': 'GOES-East Clean IR',
        'description': "Cloud-top temperatures over the Americas and Atlantic "
                       "every 10 minutes. The coldest tops are the tallest, most "
                       "intense storms — and it works day and night.",
        'about': "Clean Infrared (band 13, 10.3 µm) measures the temperature of "
                 "whatever the satellite sees: the colder the top, the higher and "
                 "more violent the cloud. That makes it the standard way to judge "
                 "storm intensity — and unlike visible imagery it keeps working "
                 "after sunset, when many storms peak.",
        'links': [
            {'label': 'View in NASA Worldview', 'url': 'https://worldview.earthdata.nasa.gov/?l=GOES-East_ABI_Band13_Clean_Infrared'},
            {'label': 'GOES-R mission', 'url': 'https://www.goes-r.gov/'},
        ],
        'tms': 'GoogleMapsCompatible_Level6',
        'legend': IR_LEGEND,
        'bbox': '-95,0,-25,50',
        'meta': {**GOES_META, 'satellite': 'GOES-East (75°W)',
                 'orbit': 'Geostationary, 35,786 km — Americas & Atlantic',
                 'spatialCoverage': 'Americas + Atlantic (full disk)'},
    },
    {
        'id': 'GOES-West_ABI_Band13_Clean_Infrared',
        'name': 'Cloud Tops — East Pacific',
        'subtitle': 'GOES-West Clean IR',
        'description': "Cloud-top temperatures over the eastern Pacific every 10 "
                       "minutes — storm intensity day and night for Pacific "
                       "systems.",
        'about': "The infrared twin of the GOES-East cloud-top layer, watching the "
                 "eastern Pacific. Cold, high cloud tops show where a system is "
                 "deepening; the imagery is unaffected by the day/night line.",
        'links': [
            {'label': 'View in NASA Worldview', 'url': 'https://worldview.earthdata.nasa.gov/?l=GOES-West_ABI_Band13_Clean_Infrared'},
            {'label': 'GOES-R mission', 'url': 'https://www.goes-r.gov/'},
        ],
        'tms': 'GoogleMapsCompatible_Level6',
        'legend': IR_LEGEND,
        'bbox': '-165,10,-100,55',
        'meta': {**GOES_META, 'satellite': 'GOES-West (137°W)',
                 'orbit': 'Geostationary, 35,786 km — East Pacific',
                 'spatialCoverage': 'E Pacific + W Americas (full disk)'},
    },
    {
        'id': 'Himawari_AHI_Band13_Clean_Infrared',
        'name': 'Cloud Tops — Asia-Pacific',
        'subtitle': 'Himawari Clean IR',
        'description': "Cloud-top temperatures over Asia and the western Pacific "
                       "every 10 minutes — typhoon intensity, day or night.",
        'about': "Himawari's infrared band, refreshed every 10 minutes. Where the "
                 "visible band goes dark, this one keeps showing the structure of "
                 "a typhoon or a monsoon surge.",
        'links': [
            {'label': 'View in NASA Worldview', 'url': 'https://worldview.earthdata.nasa.gov/?l=Himawari_AHI_Band13_Clean_Infrared'},
            {'label': 'Himawari (JMA)', 'url': 'https://www.data.jma.go.jp/mscweb/en/himawari89/'},
        ],
        'tms': 'GoogleMapsCompatible_Level6',
        'legend': IR_LEGEND,
        'bbox': '100,-15,160,40',
        'meta': dict(HIMAWARI_META),
    },
]


def domain_span(layer_id, tms):
    """First/last datetimes GIBS has for a layer (DescribeDomains, not caps —
    the capabilities document only lists the latest ~100 periods)."""
    url = (f'{WMTS_CGI}?SERVICE=WMTS&REQUEST=DescribeDomains&VERSION=1.0.0'
           f'&LAYER={layer_id}&TILEMATRIXSET={tms}&TIME=all')
    req = urllib.request.Request(url, headers={'User-Agent': 'gibson-suite/1.0'})
    xml = urllib.request.urlopen(req, timeout=60).read().decode('utf-8', 'replace')
    m = re.search(r'<Domain>([\s\S]*?)</Domain>', xml)
    if not m:
        return None, None
    runs = [r for r in m.group(1).split(',') if '/' in r]
    if not runs:
        return None, None
    return runs[0].split('/')[0], runs[-1].split('/')[1]


def build_layer(cfg):
    """The layers.json entry (legend/preview paths are filled in by
    gen_layer_assets; the coverage window is set here from DescribeDomains)."""
    layer = {
        'id': cfg['id'],
        'name': cfg['name'],
        'subtitle': cfg['subtitle'],
        'description': cfg['description'],
        'role': 'primary',
        'section': 'imagery',
        'category': CATEGORY,
        'tileMatrixSet': cfg['tms'],
        # PNG is required: outside the geostationary disk there is no data, and
        # only PNG keeps that transparent (JPEG comes back opaque black).
        'format': 'image/png',
        # Marks a GIBS "subdaily" product: GIBS needs a full
        # YYYY-MM-DDTHH:MI:SSZ time to address one of its frames.
        'subdaily': True,
        'timeStepMinutes': 10,
        'legendId': cfg.get('legend'),
        'metadata': dict(cfg['meta']),
        'startDate': cfg.get('first'),
        'endDate': cfg.get('last'),
        'latestDate': (cfg.get('last') or '')[:10] or None,
    }
    if not cfg.get('legend'):
        layer.pop('legendId')
    return layer


def main():
    layers = json.load(open(LAYERS_JSON, encoding='utf-8'))
    content = json.load(open(CONTENT_JSON, encoding='utf-8'))

    # 1. Coverage window per layer (DescribeDomains — caps truncates at 100).
    for cfg in LAYERS:
        first, last = domain_span(cfg['id'], cfg['tms'])
        cfg['first'], cfg['last'] = first, last
        print(f"{cfg['id']:40s} {first} -> {last}")

    # 2. sections.imagery — new layers go on top (front = closest to the top).
    imagery = layers['sections']['imagery']
    for cfg in reversed(LAYERS):
        imagery[:] = [l for l in imagery if l.get('id') != cfg['id']]
        imagery.insert(0, build_layer(cfg))

    # 3. categories — the modal groups by category, so the same objects with the
    #    hand-authored copy, dates and legend/preview paths as other categories.
    cat = layers['categories'].setdefault(CATEGORY, {
        'icon': CATEGORY_ICON,
        'description': CATEGORY_DESCRIPTION,
        'layers': [],
    })
    existing = {l.get('id'): i for i, l in enumerate(cat['layers'])}
    for cfg in LAYERS:
        entry = {
            'id': cfg['id'],
            'name': cfg['name'],
            'description': cfg['description'],
            'role': 'primary',
            'section': 'imagery',
            'category': CATEGORY,
            'subtitle': cfg['subtitle'],
            'tileMatrixSet': cfg['tms'],
            'format': 'image/png',
            'subdaily': True,
            'timeStepMinutes': 10,
            'legendId': cfg.get('legend'),
            'metadata': dict(cfg['meta']),
            'startDate': cfg['first'],
            'endDate': cfg['last'],
        }
        if cfg['id'] in existing:
            cat['layers'][existing[cfg['id']]] = entry
        else:
            cat['layers'].append(entry)

    # 4. Hand-authored copy for the asset generator (intro/about/links/metadata).
    for cfg in LAYERS:
        content[cfg['id']] = {
            'intro': cfg['description'],
            'about': cfg['about'],
            'links': cfg['links'],
            'metadata': dict(cfg['meta']),
        }

    with open(LAYERS_JSON, 'w', encoding='utf-8') as f:
        json.dump(layers, f, indent=2, ensure_ascii=False)
    with open(CONTENT_JSON, 'w', encoding='utf-8') as f:
        json.dump(content, f, indent=2, ensure_ascii=False)
        f.write('\n')
    print(f'\nlayers.json: added {len(LAYERS)} layers to sections.imagery + categories.{CATEGORY}')
    print('now run: python3 work/gen_layer_assets.py  (fetches legends + previews)')


if __name__ == '__main__':
    main()
