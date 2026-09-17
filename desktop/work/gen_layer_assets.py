#!/usr/bin/env python3
"""Generate per-layer preview images, legends and corrected dates for Gibson.

Reads:
  - src/config/layers.json          (layer catalogue)
  - work/wmts_caps.xml              (GIBS WMTS capabilities: time dims + legends)
  - work/layer-content.json         (hand-authored intro/about/links/metadata)

Writes:
  - public/layer-previews/<id>.jpg  (example image per layer, via GIBS snapshot)
  - public/legends/<name>.png       (rasterized GIBS legend, via ImageMagick)
  - src/config/layers.json          (merged: dates, legend, preview, content)

Usage: python3 work/gen_layer_assets.py
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LAYERS_JSON = os.path.join(ROOT, 'src', 'config', 'layers.json')
CAPS_XML = os.path.join(ROOT, 'work', 'wmts_caps.xml')
CONTENT_JSON = os.path.join(ROOT, 'work', 'layer-content.json')
PREVIEW_DIR = os.path.join(ROOT, 'public', 'layer-previews')
LEGEND_DIR = os.path.join(ROOT, 'public', 'legends')

SNAPSHOT = 'https://wvs.earthdata.nasa.gov/api/v1/snapshot'
WMS_GETMAP = 'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi'
LEGEND_URL = 'https://gibs.earthdata.nasa.gov/legends/{name}_V.svg'

# Default composite base per section (bottom layer of the preview).
BASE_BY_SECTION = {
    'imagery': 'MODIS_Terra_CorrectedReflectance_TrueColor',
    'base': None,
    'reference': 'BlueMarble_NextGeneration',
}

# Per-layer preview: (bbox, time, base_layer_or_None). base None -> section default.
PREVIEWS = {
    'MODIS_Terra_CorrectedReflectance_TrueColor': ('-20,-20,50,40', '2024-01-15', None),
    'VIIRS_NOAA21_CorrectedReflectance_TrueColor': ('-20,-20,50,40', '2026-09-10', None),
    'IMERG_Precipitation_Rate': ('-25,30,-15,42', '2023-03-11', None),
    'IMERG_Precipitation_Rate_30min': ('-25,30,-15,42', '2026-09-10', None),
    'MODIS_Terra_L3_NDVI_Monthly': ('-10,5,40,20', '2023-08-01', None),
    'VIIRS_NOAA20_NDVI_8Day': ('-10,5,40,20', '2026-08-20', None),
    'MODIS_Combined_Value_Added_AOD': ('0,-20,30,20', '2022-03-15', None),
    'TROPOMI_L2_Nitrogen_Dioxide_Tropospheric_Column': ('25,29,33,32', '2023-01-15', None),
    'TROPOMI_L2_Sulfur_Dioxide_Total_Vertical_Column': ('25,-5,32,2', '2021-05-23', None),
    'MODIS_Combined_Thermal_Anomalies_All': ('-30,15,-10,40', '2023-09-15', None),
    'VIIRS_NOAA20_Thermal_Anomalies_375m_All': ('-30,15,-10,40', '2023-09-15', None),
    'VIIRS_NOAA21_Thermal_Anomalies_375m_All': ('-30,15,-10,40', '2024-09-15', None),
    'VIIRS_SNPP_Thermal_Anomalies_375m_All': ('-30,15,-10,40', '2023-09-15', None),
    'VIIRS_NOAA20_CorrectedReflectance_BandsM11-I2-I1': ('-30,15,-10,40', '2023-09-15', None),
    'MODIS_Combined_Flood_1-Day': ('4,5,8,7', '2022-11-23', None),
    'MODIS_Combined_Flood_2-Day': ('4,5,8,7', '2022-11-23', None),
    'MODIS_Combined_Flood_3-Day': ('4,5,8,7', '2022-11-23', None),
    'VIIRS_Combined_Flood_1-Day': ('4,5,8,7', '2026-08-20', None),
    'VIIRS_Combined_Flood_2-Day': ('4,5,8,7', '2026-08-20', None),
    'VIIRS_Combined_Flood_3-Day': ('4,5,8,7', '2026-08-20', None),
    'OPERA_L3_Dynamic_Surface_Water_Extent-Sentinel-1': ('4,5,8,7', '2024-09-15', None),
    'OPERA_L3_Dynamic_Surface_Water_Extent-HLS': ('4,5,8,7', '2024-09-15', None),
    'NDH_Flood_Hazard_Frequency_Distribution_1985-2003': ('-20,-20,50,40', '2024-01-15', 'BlueMarble_NextGeneration'),
    'MODIS_Terra_CorrectedReflectance_Bands721': ('4,5,8,7', '2022-11-23', None),
    'VIIRS_SNPP_CorrectedReflectance_BandsM11-I2-I1': ('4,5,8,7', '2022-11-23', None),
    'GRACE_Tellus_Liquid_Water_Equivalent_Thickness_Mascon_CRI': ('5,8,20,18', '2022-06-01', 'BlueMarble_NextGeneration'),
    'MODIS_Terra_L3_Land_Surface_Temp_Daily_Day': ('30,0,50,15', '2022-03-15', None),
    'SMAP_L3_Passive_Day_Soil_Moisture': ('30,0,50,15', '2022-03-15', None),
    # Geostationary (sub-daily) layers. The layer is opaque inside its disk and
    # empty outside it, so the base is composited underneath to show what the
    # empty part looks like in the app. Times are full datetimes (a bare date
    # means 00:00Z, i.e. the middle of the night over most of these disks).
    'GOES-East_ABI_GeoColor': ('-95,0,-25,50', '2026-09-10T18:00:00Z', 'MODIS_Terra_CorrectedReflectance_TrueColor'),
    'GOES-West_ABI_GeoColor': ('-165,10,-100,55', '2026-09-10T18:00:00Z', 'MODIS_Terra_CorrectedReflectance_TrueColor'),
    'Himawari_AHI_Band3_Red_Visible_1km': ('100,-15,160,40', '2026-09-10T02:00:00Z', 'MODIS_Terra_CorrectedReflectance_TrueColor'),
    'GOES-East_ABI_Band13_Clean_Infrared': ('-95,0,-25,50', '2026-09-10T18:00:00Z', 'MODIS_Terra_CorrectedReflectance_TrueColor'),
    'GOES-West_ABI_Band13_Clean_Infrared': ('-165,10,-100,55', '2026-09-10T18:00:00Z', 'MODIS_Terra_CorrectedReflectance_TrueColor'),
    'Himawari_AHI_Band13_Clean_Infrared': ('100,-15,160,40', '2026-09-10T02:00:00Z', 'MODIS_Terra_CorrectedReflectance_TrueColor'),
}


def fetch(url, timeout=60, retries=3):
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'gibson-suite/1.0'})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f'fetch failed after {retries} tries: {url} ({last})')


def parse_caps(caps_xml):
    """Return {layer_id: {'from': str, 'to': str, 'legend': str}}."""
    xml = open(caps_xml, encoding='utf-8').read()
    out = {}
    for blk in re.findall(r'<Layer>(.*?)</Layer>', xml, re.S):
        m = re.search(r'<ows:Identifier>([^<]+)</ows:Identifier>', blk)
        if not m:
            continue
        lid = m.group(1)
        dim = re.search(
            r'<Dimension>\s*<ows:Identifier>Time</ows:Identifier>.*?<Default>([^<]*)</Default>.*?<Value>([^<]*)</Value>',
            blk, re.S)
        leg = re.search(r"<LegendURL[^>]*xlink:href='([^']*_V\.svg)'", blk)
        entry = {'from': None, 'to': None, 'legend': None}
        if dim:
            # Value holds one or more 'start/end/period' ranges; the first range
            # start is the product start, the last range end is the product end.
            ranges = re.findall(r'<Value>([^<]+)</Value>', blk)
            starts = [r.split('/')[0] for r in ranges if '/' in r]
            ends = [r.split('/')[1] for r in ranges if '/' in r]
            if starts:
                entry['from'] = min(starts)
            if ends:
                entry['to'] = max(ends)
        if leg:
            entry['legend'] = leg.group(1).split('/')[-1][:-6]
        out[lid] = entry
    return out


def rasterize_legend(name, out_path):
    svg = fetch(LEGEND_URL.format(name=name))
    tmp = out_path + '.svg'
    with open(tmp, 'wb') as f:
        f.write(svg)
    subprocess.run(
        ['magick', '-density', '150', tmp, '-resize', '260x', out_path],
        check=True, capture_output=True)
    os.remove(tmp)


def snapshot_preview(layer_id, bbox, time_, base, out_path):
    # Snapshot API renders the LAST listed layer on top, so the base goes first.
    layers = layer_id if not base else f'{base},{layer_id}'
    url = (f'{SNAPSHOT}?REQUEST=GetSnapshot&TIME={time_}&BBOX={bbox}'
           f'&CRS=EPSG:4326&LAYERS={layers}&FORMAT=image/jpeg&WIDTH=480&HEIGHT=480')
    data = fetch(url, timeout=90)
    if data[:5] == b'<?xml':
        raise RuntimeError(f'snapshot returned an error for {layer_id}: {data[:200]!r}')
    with open(out_path, 'wb') as f:
        f.write(data)


def _mercator(lon, lat):
    import math
    x = lon * math.pi * 6378137.0 / 180.0
    y = math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) * 6378137.0
    return x, y


def wms_preview(layer_id, bbox, time_, base, out_path):
    """Preview via GIBS WMS instead of the Worldview snapshot API.

    Used for the sub-daily geostationary layers: the snapshot API answers with
    a blank image for the ABI/AHI disks, while WMS (the endpoint the app itself
    renders them from) composites them correctly. `bbox` is in degrees
    (lon/lat, EPSG:4326); WMS 1.3.0 needs metres in EPSG:3857.
    """
    l0, b0, l1, b1 = [float(v) for v in bbox.split(',')]
    x0, y0 = _mercator(l0, b0)
    x1, y1 = _mercator(l1, b1)
    # Bottom layer first: the base fills the frame, the product goes on top.
    layers = layer_id if not base else f'{base},{layer_id}'
    url = (f'{WMS_GETMAP}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS={layers}'
           f'&STYLES=&FORMAT=image%2Fjpeg&TRANSPARENT=TRUE&CRS=EPSG:3857'
           f'&WIDTH=480&HEIGHT=480&TIME={time_}'
           f'&BBOX={x0:.0f},{y0:.0f},{x1:.0f},{y1:.0f}')
    data = fetch(url, timeout=90)
    if data[:5] == b'<?xml':
        raise RuntimeError(f'WMS returned an error for {layer_id}: {data[:200]!r}')
    with open(out_path, 'wb') as f:
        f.write(data)


def main():
    layers = json.load(open(LAYERS_JSON, encoding='utf-8'))
    content = json.load(open(CONTENT_JSON, encoding='utf-8'))
    caps = parse_caps(CAPS_XML)

    os.makedirs(PREVIEW_DIR, exist_ok=True)
    os.makedirs(LEGEND_DIR, exist_ok=True)

    all_layers = [l for sec in layers['sections'].values() for l in sec]
    by_id = {l['id']: l for l in all_layers}

    for layer in all_layers:
        lid = layer['id']
        sec = layer.get('section', 'imagery')
        cap = caps.get(lid, {})
        c = content.get(lid, {})

        # 1. Dates from caps (authoritative availability window).
        #    NOT for sub-daily layers: the capabilities document only lists the
        #    latest ~100 time periods, which for a 10-minute product is the last
        #    ~17 hours — their real window comes from DescribeDomains (see
        #    work/add_subdaily_layers.py) and is already in layers.json.
        if not layer.get('subdaily'):
            if cap.get('from'):
                layer['startDate'] = cap['from']
            if cap.get('to'):
                layer['endDate'] = cap['to']

        # 2. Legend (rasterize the GIBS vertical SVG legend).
        legend_name = cap.get('legend')
        if legend_name:
            legend_path = f'/legends/{legend_name}.png'
            out = os.path.join(LEGEND_DIR, f'{legend_name}.png')
            if not os.path.exists(out):
                print(f'legend  {legend_name}')
                try:
                    rasterize_legend(legend_name, out)
                except Exception as e:  # noqa: BLE001
                    print(f'  !! legend failed for {lid}: {e}')
                    legend_name = None
            if legend_name:
                layer['legend'] = legend_path
        if not legend_name:
            layer.pop('legend', None)

        # 3. Preview image (GIBS snapshot, or WMS for the geostationary disks).
        if lid in PREVIEWS:
            bbox, time_, base = PREVIEWS[lid]
            if base is None:
                base = BASE_BY_SECTION.get(sec)
            preview_path = f'/layer-previews/{lid}.jpg'
            out = os.path.join(PREVIEW_DIR, f'{lid}.jpg')
            if not os.path.exists(out):
                print(f'preview {lid}')
                try:
                    if layer.get('subdaily'):
                        wms_preview(lid, bbox, time_, base, out)
                    else:
                        snapshot_preview(lid, bbox, time_, base, out)
                except Exception as e:  # noqa: BLE001
                    print(f'  !! preview failed for {lid}: {e}')
                    out = None
            if out and os.path.exists(out):
                layer['preview'] = preview_path
            else:
                layer.pop('preview', None)
        else:
            layer.pop('preview', None)

        # 4. Hand-authored content.
        if c.get('intro'):
            layer['description'] = c['intro']
        if 'about' in c:
            layer['about'] = c['about']
        if 'links' in c:
            layer['links'] = c['links']
        if 'period' in c:
            layer['period'] = c['period']
        else:
            layer.pop('period', None)
        for k, v in (c.get('metadata') or {}).items():
            layer.setdefault('metadata', {})[k] = v

    layers['_notes']['layerAssets'] = (
        'preview/legend/from-to generated by work/gen_layer_assets.py from GIBS '
        'snapshot API + WMTS capabilities; intro/about/links hand-authored in '
        'work/layer-content.json. Re-run the script to refresh assets.'
    )
    with open(LAYERS_JSON, 'w', encoding='utf-8') as f:
        json.dump(layers, f, indent=2, ensure_ascii=False)
        f.write('\n')
    print('layers.json updated.')


if __name__ == '__main__':
    sys.exit(main())