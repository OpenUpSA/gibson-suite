# GIBS layer candidates — not yet added

Compiled June 2026 by diffing the live GIBS capabilities (1,256 layers,
`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml`)
against `src/config/layers.json`. The June 2026 batch already added: fires/thermal
anomalies, 8 orbit tracks, NDH hazard risk, settlement/built-up layers, Blue Marble.

## How to add a layer

1. Get `TileMatrixSet`, `Format` and the time `Dimension` default from the capabilities XML.
2. If `Format` is `application/vnd.mapbox-vector-tile`, the layer must be flagged
   `"wms": true` in layers.json (rendered via `wmsBaseUrl`, see `src/config/tileUrl.js`).
3. Verify a sample tile returns HTTP 200 before committing.
4. `legendId` → colormap XML must exist in `public/colormaps/`. **TODO:** the June 2026
   batch set `legendId: null` everywhere; fetch colormaps from
   `https://gibs.earthdata.nasa.gov/colormaps/v1.3/<id>.xml` for the NDH and fire layers
   and wire up legends.

## Candidates

### Air quality & atmosphere
- `AIRS_L3_Carbon_Monoxide_500hPa_Volume_Mixing_Ratio_Daily_Day` (+Night, Monthly) — CO from biomass burning
- `AIRS_L3_Methane_400hPa_Volume_Mixing_Ratio_Daily_Day` (+Night, Monthly)
- `AIRS_L2_Dust_Score_Day` / `_Night` — Saharan dust tracking
- `MERRA2_Dust_Surface_Mass_Concentration_PM25_Monthly` — PM2.5 dust
- `MERRA2_Carbon_Monoxide_Emission_Monthly`

### Lightning (Africa = global hotspot, Congo basin)
- `LIS_Very_High_Resolution_Lightning_Full_Climatology_LIS_Mean_Flash_Rate`
- `LIS_Very_High_Resolution_Lightning_Monthly_Climatology_LIS_Mean_Flash_Rate` (12 monthly steps)
- `LIS_Very_High_Resolution_Lightning_Seasonal_Climatology_LIS_Mean_Flash_Rate`

### Ocean
- `JPL_MEaSUREs_L4_Sea_Surface_Height_Anomalies` — sea level rise
- `SMAP_L3_Sea_Surface_Salinity_CAP_Monthly` (also 8-day running mean)
- `OSCAR_Sea_Surface_Currents_Zonal` / `_Meridional` (single components — visualisation is awkward)
- `AMSRU2_Sea_Ice_Concentration_12km` — sea ice
- `GHRSST_L4_MUR_Sea_Ice_Concentration`

### Vegetation / carbon
- `OCO-2_Solar_Induced_Florescence_Blended` — photosynthesis proxy, complements NDVI (historical record)
- `MODIS_Combined_L3_Black_Sky_Albedo_Daily` / `White_Sky` — surface albedo
- `MEaSUREs_Daily_Landscape_Freeze_Thaw_AMSRE` — freeze/thaw state

### Biodiversity (SEDAC, static)
- `Amphibian_Richness_All_Species_2013` (+ Endangered/Threatened variants)

### Water infrastructure (vector → needs `wms: true`)
- `GRanD_Dams` / `GRanD_Reservoirs` — Global Reservoir and Dam database

### Geostationary near-real-time — **deliberately skipped**
`GOES-East_ABI_GeoColor`, `GOES-West_ABI_GeoColor`, `Himawari_AHI_*`: sub-hourly
(PT10M) time steps with patchy ~3-day retention. The app's date model (date scrubbing
with a fixed HH:MM component) would 404 on most dates. Needs dedicated time handling first.
Also note no Meteosat in GIBS, so no geostationary view centred on Africa.

### Reference overlays — **deliberately skipped**
`Coastlines_15m`, `Reference_Labels_15m`, `Reference_Features_15m`, `Graticule_15m`:
the app shows one layer at a time over an OSM basemap that already provides these.
Only useful if the app gains multi-layer/overlay support.

### Orbit tracks not added (38 satellites total, each Asc/Desc)
Aura, Calipso, CloudSat, CYGNSS, EarthCARE, GCOM-C/W1, GOSAT(-2), ICESat-2,
Landsat-7/8, METOP-A/B/C, NISAR, NOAA-21, OCO-2, PACE, SAOCOM1-A, SMAP,
Sentinel-1A/B/C, -2A/B/C, -3A/B, TRMM. Same pattern as the added ones
(`wms: true`, Level6, daily).
