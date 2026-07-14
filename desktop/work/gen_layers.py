#!/usr/bin/env python3
"""
Generates the expanded, curated src/config/layers.json.

Selection principles:
  - Every layer verified HTTP 200 from the gibs_report.json scan.
  - At most 2-3 sensors per variable (pick newest/best, not every duplicate).
  - Composite products carry their actual period boundary date, not today.
  - Sub-daily products keep their T{time}Z component.
  - 13 categories, ~79 layers total.
"""
import json
from pathlib import Path

OUT = Path(__file__).parent.parent / "src" / "config" / "layers.json"

def L(id, name, description, tms, fmt, time, legend=None):
    return {"id": id, "name": name, "description": description,
            "tileMatrixSet": tms, "format": fmt, "time": time, "legendId": legend}

J  = "image/jpeg"
P  = "image/png"
L6 = "GoogleMapsCompatible_Level6"
L7 = "GoogleMapsCompatible_Level7"
L8 = "GoogleMapsCompatible_Level8"
L9 = "GoogleMapsCompatible_Level9"
L12= "GoogleMapsCompatible_Level12"

data = {
  "categories": {

    # ── 1. CORRECTED REFLECTANCE ──────────────────────────────────────────────
    "Corrected Reflectance": [
      L("VIIRS_NOAA20_CorrectedReflectance_TrueColor",
        "VIIRS NOAA-20 True Color",
        "True-color imagery from VIIRS on NOAA-20. 375m resolution, daily. "
        "Current-generation JPSS sensor with excellent calibration.",
        L9, J, "2024-11-20"),
      L("VIIRS_NOAA21_CorrectedReflectance_TrueColor",
        "VIIRS NOAA-21 True Color",
        "True-color imagery from the newest JPSS satellite (launched 2022). "
        "375m resolution, daily. Use for the most current daily imagery.",
        L9, J, "2026-06-09"),
      L("VIIRS_SNPP_CorrectedReflectance_TrueColor",
        "VIIRS SNPP True Color",
        "True-color from VIIRS on Suomi NPP. 375m resolution. Near-real-time, "
        "available within ~3 hours of acquisition. Record dates back to 2012.",
        L9, J, "2024-11-20"),
      L("MODIS_Terra_CorrectedReflectance_TrueColor",
        "MODIS Terra True Color",
        "True-color corrected reflectance from MODIS Terra. 250m resolution, "
        "morning overpass (~10:30 am local). Longest daily record from 2000.",
        L9, J, "2024-11-20"),
      L("MODIS_Aqua_CorrectedReflectance_TrueColor",
        "MODIS Aqua True Color",
        "True-color from MODIS Aqua. 250m resolution, afternoon overpass "
        "(~1:30 pm local). Pairs with Terra for fuller daily coverage.",
        L9, J, "2024-11-20"),
      L("MODIS_Terra_CorrectedReflectance_Bands721",
        "MODIS Terra False Color (7-2-1)",
        "False-color mapping SWIR, NIR, and Red from MODIS Terra. Burn scars "
        "appear vivid red-brown, healthy vegetation bright green, bare soil tan. "
        "Essential for fire and flood analysis at 250m.",
        L9, J, "2024-11-20"),
      L("VIIRS_NOAA20_CorrectedReflectance_BandsM11-I2-I1",
        "VIIRS NOAA-20 False Color (fire/burn, M11-I2-I1)",
        "False-color from VIIRS NOAA-20 mapping SWIR, NIR, and Red at 375m. "
        "Burn scars appear orange-red, healthy vegetation bright green, flooded "
        "areas dark. Higher resolution than MODIS false colour.",
        L9, J, "2026-06-09"),
      L("VIIRS_NOAA20_CorrectedReflectance_BandsM3-I3-M11",
        "VIIRS NOAA-20 False Color (vegetation, M3-I3-M11)",
        "False-color from VIIRS NOAA-20 using Blue, SWIR, and SWIR-2. Highlights "
        "vegetation health and moisture — healthy canopy appears cyan, stressed "
        "vegetation turns yellow-orange. 375m resolution.",
        L9, J, "2026-06-09"),
    ],

    # ── 2. TEMPERATURE ────────────────────────────────────────────────────────
    "Temperature": [
      L("AIRS_L3_Surface_Air_Temperature_Daily_Day",
        "Surface Air Temp (AIRS L3, Day)",
        "L3 gridded daytime air temperature at 2 m above surface from AIRS. "
        "Gap-free daily global coverage at ~1° resolution — no orbital banding. "
        "Note: 3–5 day processing lag; use a recent but not yesterday's date.",
        L6, P, "2024-11-20", "AIRS_Surface_Air_Temperature_Daily_Day"),
      L("AIRS_L3_Surface_Air_Temperature_Daily_Night",
        "Surface Air Temp (AIRS L3, Night)",
        "L3 gridded nighttime air temperature at 2 m from AIRS. "
        "Gap-free daily global at ~1°. Compare with day to see diurnal range.",
        L6, P, "2024-11-20", "AIRS_Surface_Air_Temperature_Daily_Night"),
      L("MODIS_Terra_L3_Land_Surface_Temp_Daily_Day",
        "Land Surface Temp (MODIS Terra L3, Day)",
        "L3 daytime land surface temperature from MODIS Terra. 1 km, daily. "
        "Measures ground temperature — critical for drought, urban heat, "
        "and crop stress. Morning overpass captures mid-morning temperatures.",
        L7, P, "2024-11-20", "MODIS_Land_Surface_Temp"),
      L("MODIS_Terra_L3_Land_Surface_Temp_Daily_Night",
        "Land Surface Temp (MODIS Terra L3, Night)",
        "L3 nighttime land surface temperature from MODIS Terra. 1 km, daily. "
        "Night temperatures reveal soil moisture conditions and minimum cooling. "
        "Compare with day to study heat retention.",
        L7, P, "2026-06-08", "MODIS_Land_Surface_Temp"),
      L("MODIS_Aqua_L3_Land_Surface_Temp_Daily_Day",
        "Land Surface Temp (MODIS Aqua L3, Day)",
        "L3 afternoon daytime land surface temperature from MODIS Aqua. 1 km, daily. "
        "Afternoon overpass captures peak daily temperatures — ideal for heat-stress "
        "and urban heat-island analysis.",
        L7, P, "2026-06-08", "MODIS_Land_Surface_Temp"),
      L("MODIS_Aqua_L3_Land_Surface_Temp_Daily_Night",
        "Land Surface Temp (MODIS Aqua L3, Night)",
        "L3 nighttime land surface temperature from MODIS Aqua. 1 km, daily. "
        "Aqua night pass fills spatial gaps left by Terra — useful in persistently "
        "cloudy regions.",
        L7, P, "2026-06-08", "MODIS_Land_Surface_Temp"),
      L("VIIRS_NOAA20_Land_Surface_Temp_Day",
        "Land Surface Temp (VIIRS NOAA-20, Day)",
        "Daytime land surface temperature from VIIRS on NOAA-20. 750 m, daily. "
        "Current-generation sensor with improved calibration over MODIS. "
        "Good spatial detail for urban and agricultural heat monitoring.",
        L7, P, "2026-06-09"),
      L("VIIRS_NOAA20_Land_Surface_Temp_Night",
        "Land Surface Temp (VIIRS NOAA-20, Night)",
        "Nighttime land surface temperature from VIIRS NOAA-20. 750 m, daily. "
        "Night temperatures assess surface moisture and map minimum temperatures.",
        L7, P, "2026-06-09"),
    ],

    # ── 3. VEGETATION & LAND COVER ────────────────────────────────────────────
    "Vegetation & Land Cover": [
      L("MODIS_Terra_NDVI_8Day",
        "NDVI 8-Day Composite (MODIS Terra)",
        "Normalised Difference Vegetation Index from MODIS Terra. 8-day composite "
        "at 250 m — high temporal frequency for monitoring rapid vegetation changes "
        "such as post-rain greening and fire recovery.",
        L9, P, "2026-06-09", "MODIS_NDVI"),
      L("MODIS_Terra_L3_NDVI_16Day",
        "NDVI 16-Day Composite (MODIS Terra, L3)",
        "NDVI from MODIS Terra L3. 16-day composite at 250 m, maximum-value "
        "composite reduces cloud contamination. Values −1 to +1 — higher means "
        "denser vegetation. Note: only valid on 16-day period boundaries.",
        L9, P, "2024-11-20", "MODIS_NDVI"),
      L("MODIS_Terra_L3_NDVI_Monthly",
        "NDVI Monthly Composite (MODIS Terra, L3)",
        "Monthly NDVI composite from MODIS Terra L3 at 1 km. Less cloud "
        "contamination than daily or 8-day products — ideal for trend analysis "
        "and long-term drought monitoring.",
        L7, P, "2026-04-01", "MODIS_NDVI"),
      L("VIIRS_NOAA20_NDVI_8Day",
        "NDVI 8-Day (VIIRS NOAA-20)",
        "Normalised Difference Vegetation Index from VIIRS NOAA-20. 8-day "
        "composite at 500 m. Current-generation sensor — use for the most recent "
        "data or to cross-validate MODIS NDVI.",
        L8, P, "2026-06-09", "MODIS_NDVI"),
      L("MODIS_Terra_EVI_8Day",
        "EVI 8-Day Composite (MODIS Terra)",
        "Enhanced Vegetation Index from MODIS Terra. 8-day composite at 250 m. "
        "More sensitive than NDVI in high-biomass areas — reduces atmospheric and "
        "soil background noise. Preferred in tropical forest regions.",
        L9, P, "2026-06-09", "MODIS_EVI"),
      L("MODIS_Terra_L3_EVI_16Day",
        "EVI 16-Day Composite (MODIS Terra, L3)",
        "EVI from MODIS Terra L3. 16-day composite at 250 m with cloud compositing. "
        "Use in dense forest areas where NDVI saturates.",
        L9, P, "2024-11-20", "MODIS_EVI"),
      L("VIIRS_NOAA20_EVI_8Day",
        "EVI 8-Day (VIIRS NOAA-20)",
        "Enhanced Vegetation Index from VIIRS NOAA-20. 8-day composite at 500 m. "
        "Current-generation EVI — consistent methodology with MODIS for long-term "
        "trend comparisons.",
        L8, P, "2026-06-09", "MODIS_EVI"),
      L("MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual",
        "Land Cover Type (IGBP, Annual)",
        "Annual global land cover at 500 m using the IGBP classification from "
        "combined MODIS Terra+Aqua. 17 classes: forest, savanna, grassland, "
        "cropland, urban, water, and more.",
        L8, P, "2024-01-01"),
      L("GEDI_ISS_L3_Canopy_Height_Mean_RH100_201904-202303",
        "Canopy Height Mean (GEDI 2019–2023)",
        "Mean vegetation canopy height from NASA GEDI lidar on the ISS. "
        "Cumulative 2019–2023 dataset at ~1 km. RH100 = tallest vegetation return. "
        "Critical for mapping Africa's forest cover, degradation, and carbon stocks.",
        L7, P, "2019-04-18"),
      L("GEDI_ISS_L4B_Aboveground_Biomass_Density_Mean_201904-202303",
        "Aboveground Biomass Density (GEDI 2019–2023)",
        "Mean aboveground biomass density in Mg/ha from NASA GEDI lidar. "
        "Cumulative 2019–2023 at ~1 km. Directly estimated from lidar waveform "
        "structure — unprecedented accuracy for African forest carbon monitoring.",
        L7, P, "2019-04-18"),
      L("OPERA_L3_DIST-ALERT-HLS_Color_Index",
        "Vegetation Disturbance Alert (OPERA/HLS, 30 m)",
        "Near-real-time vegetation disturbance detection at 30 m from Harmonized "
        "Landsat Sentinel-2. Highlights recent changes from fire, drought, "
        "deforestation, or flooding. Zoom to level 10+ for full detail.",
        L12, P, "2026-06-07"),
    ],

    # ── 4. FLOODS & SURFACE WATER ─────────────────────────────────────────────
    "Floods & Surface Water": [
      L("MODIS_Combined_Flood_1-Day",
        "Flood Extent 1-Day (MODIS)",
        "Daily surface water and flood extent from combined MODIS Terra+Aqua. "
        "250 m. Detects anomalous surface water vs a long-term baseline — "
        "use for near-real-time flood mapping.",
        L9, P, "2026-06-09"),
      L("MODIS_Combined_Flood_2-Day",
        "Flood Extent 2-Day (MODIS)",
        "2-day composite flood extent from combined MODIS. 250 m. "
        "Fewer cloud gaps than the 1-day product with minimal temporal lag.",
        L9, P, "2026-06-09"),
      L("MODIS_Combined_Flood_3-Day",
        "Flood Extent 3-Day (MODIS)",
        "3-day composite flood extent from MODIS. 250 m. Best cloud coverage "
        "of the MODIS flood series — use in persistently cloudy regions.",
        L9, P, "2026-06-09"),
      L("VIIRS_Combined_Flood_1-Day",
        "Flood Extent 1-Day (VIIRS, 375 m)",
        "Daily flood extent from combined VIIRS sensors. 375 m — finer spatial "
        "detail than MODIS flood products. Best available near-real-time flood "
        "mapping at this resolution.",
        L9, P, "2026-06-09"),
      L("VIIRS_Combined_Flood_2-Day",
        "Flood Extent 2-Day (VIIRS, 375 m)",
        "2-day composite flood extent from VIIRS. 375 m resolution. Reduces "
        "cloud gaps while keeping near-real-time response.",
        L9, P, "2026-06-09"),
      L("VIIRS_Combined_Flood_3-Day",
        "Flood Extent 3-Day (VIIRS, 375 m)",
        "3-day composite flood extent from VIIRS. 375 m. Best cloud coverage "
        "of the VIIRS flood series.",
        L9, P, "2026-06-09"),
      L("OPERA_L3_Dynamic_Surface_Water_Extent-HLS",
        "Surface Water Extent (OPERA/HLS, 30 m)",
        "Dynamic surface water extent at 30 m from Harmonized Landsat Sentinel-2. "
        "Near-real-time high-resolution water mapping. Detects rivers, lakes, "
        "reservoirs, and floodplains. Zoom to level 10+ for full detail.",
        L12, P, "2026-06-08"),
      L("OPERA_L3_Dynamic_Surface_Water_Extent-Sentinel-1",
        "Surface Water Extent (SAR, Sentinel-1, 30 m)",
        "Dynamic surface water extent at 30 m from Sentinel-1 SAR. Works through "
        "cloud cover — SAR penetrates clouds unlike optical sensors, making it "
        "essential for flood monitoring during active rain events.",
        L12, P, "2026-06-06"),
    ],

    # ── 5. PRECIPITATION ──────────────────────────────────────────────────────
    "Precipitation": [
      L("IMERG_Precipitation_Rate_30min",
        "Precipitation Rate — Near Real-Time (IMERG, 30-min)",
        "Near-real-time global precipitation from the GPM constellation. "
        "10 km resolution, updated every 30 minutes. The most current available "
        "global rainfall estimate. Use dates within the last few days.",
        L6, P, "2026-06-10", "GPM_Precipitation_Rate"),
      L("IMERG_Precipitation_Rate",
        "Precipitation Rate — Archive (IMERG, 30-min)",
        "GPM IMERG 30-minute precipitation archive. 10 km resolution. Use for "
        "specific historical events — supply a full datetime e.g. "
        "2024-11-29T23:30:00Z. Archive dates back to 2000.",
        L6, P, "2024-11-29T23:30:00Z", "GPM_Precipitation_Rate"),
      L("GMI_Precipitation_Rate_Asc",
        "Precipitation Rate — GPM Core Satellite (Ascending)",
        "Instantaneous precipitation rate from the GPM Microwave Imager on the "
        "GPM Core Observatory. Ascending orbital swath — shows the actual "
        "satellite pass, not a gridded product. 5 km resolution.",
        L6, P, "2026-06-10"),
      L("AIRS_Precipitation_Day",
        "Precipitation (AIRS, Daily)",
        "Daily precipitation estimate from AIRS sounder on Aqua. Global coverage "
        "at ~50 km resolution. Note: 7–10 day processing lag; use a recent "
        "archived date.",
        L6, P, "2025-12-16"),
      L("GLDAS_Surface_Total_Precipitation_Rate_Monthly",
        "Precipitation Rate — Monthly Climatology (GLDAS)",
        "Monthly mean precipitation from the Global Land Data Assimilation System "
        "(GLDAS). 0.25° resolution, updated monthly. Useful for seasonal "
        "climatology and drought indices.",
        L6, P, "2026-01-01"),
    ],

    # ── 6. SOIL MOISTURE ──────────────────────────────────────────────────────
    "Soil Moisture": [
      L("SMAP_L3_Passive_Day_Soil_Moisture",
        "Soil Moisture — Surface (SMAP L3, Day)",
        "Daily surface soil moisture (0–5 cm) from NASA SMAP passive radiometer. "
        "~36 km resolution. Near-real-time daily global coverage. "
        "High values indicate wet soil; low values indicate drought stress.",
        L6, P, "2026-05-06"),
      L("SMAP_L4_Analyzed_Surface_Soil_Moisture",
        "Soil Moisture — Surface (SMAP L4, Modeled)",
        "Surface soil moisture (0–5 cm) from SMAP Level-4 land surface model. "
        "~9 km resolution, 3-hourly. Gap-filled using model + observations. "
        "More spatially complete than L3 passive alone.",
        L6, P, "2026-05-05"),
      L("SMAP_L4_Analyzed_Root_Zone_Soil_Moisture",
        "Soil Moisture — Root Zone (SMAP L4, Modeled)",
        "Root-zone soil moisture (0–100 cm) from SMAP Level-4. ~9 km, 3-hourly. "
        "Captures moisture available to plant roots — most directly related to "
        "agricultural drought and vegetation stress.",
        L6, P, "2026-05-05"),
      L("LPRM_AMSR2_Surface_Soil_Moisture_C1_Band_Day_Daily",
        "Soil Moisture — Surface (AMSR-2 LPRM, Day)",
        "Daily surface soil moisture from AMSR-2 using the Land Parameter "
        "Retrieval Model (LPRM). ~25 km resolution. Independent of SMAP — "
        "useful for cross-validation and continuity with the AMSRE record.",
        L6, P, "2026-06-04"),
      L("GRACE_Tellus_Liquid_Water_Equivalent_Thickness_Mascon_CRI",
        "Groundwater Anomaly (GRACE-FO Mascon)",
        "Liquid water equivalent thickness anomaly from GRACE-FO mascon "
        "solutions. ~300 km resolution, monthly. Captures total water storage "
        "change including groundwater — the only satellite product sensitive to "
        "deep aquifer depletion.",
        L6, P, "2022-07-01"),
    ],

    # ── 7. SNOW & ICE ─────────────────────────────────────────────────────────
    "Snow & Ice": [
      L("MODIS_Terra_L3_NDSI_Snow_Cover_Daily",
        "Snow Cover Daily (MODIS Terra, NDSI)",
        "Daily snow cover from MODIS Terra at 500 m using the Normalised "
        "Difference Snow Index (NDSI). Morning overpass. Shows snow on land "
        "and ice on water bodies.",
        L8, P, "2024-11-20", "MODIS_Snow_Cover"),
      L("MODIS_Aqua_L3_NDSI_Snow_Cover_Daily",
        "Snow Cover Daily (MODIS Aqua, NDSI)",
        "Daily snow cover from MODIS Aqua at 500 m using NDSI. Afternoon overpass "
        "complements Terra for fuller daily coverage, particularly useful where "
        "morning pass is cloud-obscured.",
        L8, P, "2024-11-20", "MODIS_Snow_Cover"),
      L("VIIRS_NOAA20_NDSI_Snow_Cover",
        "Snow Cover Daily (VIIRS NOAA-20, NDSI)",
        "Daily snow cover from VIIRS NOAA-20 at 375 m — higher resolution than "
        "MODIS snow products. Current-generation sensor. Useful for mountain "
        "snowpack monitoring in the Atlas and Ethiopian Highlands.",
        L8, P, "2026-06-09", "MODIS_Snow_Cover"),
    ],

    # ── 8. WATER VAPOR & CLOUDS ───────────────────────────────────────────────
    "Water Vapor & Clouds": [
      L("MODIS_Aqua_Water_Vapor_5km_Day",
        "Water Vapor Column (MODIS Aqua, Day)",
        "Total column water vapor from MODIS Aqua. 5 km, daily. Shows "
        "atmospheric moisture content — useful for weather forecasting "
        "and tracking moisture transport into Africa.",
        L6, P, "2024-11-20", "MODIS_Water_Vapor"),
      L("MODIS_Terra_Water_Vapor_5km_Day",
        "Water Vapor Column (MODIS Terra, Day)",
        "Total column water vapor from MODIS Terra. 5 km, daily. Morning "
        "overpass complements Aqua — use together to see diurnal moisture "
        "changes over land.",
        L6, P, "2026-06-09", "MODIS_Water_Vapor"),
      L("MODIS_Aqua_Cloud_Top_Temp_Day",
        "Cloud Top Temperature (MODIS Aqua, Day)",
        "Temperature at cloud tops from MODIS Aqua. 5 km. Colder values indicate "
        "taller, more vigorous convective clouds and potentially severe weather. "
        "Essential for thunderstorm monitoring.",
        L6, P, "2024-11-20", "MODIS_Cloud_Top_Temp"),
      L("MODIS_Terra_Cloud_Top_Temp_Day",
        "Cloud Top Temperature (MODIS Terra, Day)",
        "Cloud top temperature from MODIS Terra. 5 km. Pairs with Aqua to give "
        "two daily snapshots of cloud height and storm intensity.",
        L6, P, "2024-11-20", "MODIS_Cloud_Top_Temp"),
      L("VIIRS_NOAA20_Cloud_Top_Height_Day",
        "Cloud Top Height (VIIRS NOAA-20, Day)",
        "Geometric cloud top height from VIIRS NOAA-20. 750 m, daily. Height "
        "in metres rather than temperature — directly interpretable for "
        "convective storm analysis.",
        L7, P, "2026-06-08"),
      L("AIRS_L2_Total_Cloud_Fraction_Day",
        "Cloud Fraction (AIRS, Day)",
        "Fraction of sky covered by cloud from the AIRS sounder. Daily swath "
        "at ~15 km resolution. Useful for understanding cloud climatology "
        "and regional cloud cover patterns.",
        L6, P, "2026-06-09"),
    ],

    # ── 9. OCEAN & WATER QUALITY ──────────────────────────────────────────────
    "Ocean & Water Quality": [
      L("GHRSST_L4_MUR_Sea_Surface_Temperature",
        "Sea Surface Temperature (MUR L4)",
        "Multi-sensor blended L4 SST. Gap-free daily global at 1 km. Shows "
        "ocean temperature patterns, upwelling zones, and thermal fronts. "
        "MUR algorithm combines multiple satellite sensors. "
        "Use full datetime: e.g. 2024-11-29T09:00:00Z.",
        L7, P, "2024-11-29T09:00:00Z", "GHRSST_Sea_Surface_Temperature"),
      L("GHRSST_L4_MUR_Sea_Surface_Temperature_Anomalies",
        "Sea Surface Temperature Anomaly (MUR L4)",
        "Daily SST anomaly relative to a long-term climatological baseline. "
        "1 km, gap-free. Positive anomalies (warm) highlight marine heat waves; "
        "negative anomalies reveal upwelling and cold events.",
        L7, P, "2026-06-08"),
      L("GHRSST_L4_GAMSSA_GDS2_Sea_Surface_Temperature",
        "Sea Surface Temperature (GAMSSA L4)",
        "Australian BoM GAMSSA blended L4 SST using AVHRR + AMSR sensors. "
        "Daily global at ~11 km resolution. An independent SST dataset useful "
        "for cross-comparison with MUR around the southern African coast.",
        L6, P, "2026-06-08"),
      L("MODIS_Aqua_L2_Chlorophyll_A",
        "Ocean Chlorophyll-a (MODIS Aqua L2)",
        "Ocean chlorophyll-a concentration from MODIS Aqua. Proxy for "
        "phytoplankton biomass and ocean primary productivity. 1 km swath. "
        "High values (green) = algal blooms; low values (blue) = clear ocean.",
        L7, P, "2024-11-20", "MODIS_Chlorophyll_A"),
      L("VIIRS_NOAA20_Chlorophyll_a",
        "Ocean Chlorophyll-a (VIIRS NOAA-20)",
        "Chlorophyll-a from VIIRS NOAA-20. 750 m swath, daily. "
        "Current-generation ocean color product — useful for monitoring "
        "Benguela and Somali upwelling productivity.",
        L7, P, "2026-06-09", "MODIS_Chlorophyll_A"),
      L("S3A_OLCI_Chlorophyll_a",
        "Ocean Chlorophyll-a (Sentinel-3A OLCI)",
        "Chlorophyll-a from the Sentinel-3A OLCI ocean colour sensor. "
        "~300 m resolution — the highest-resolution operational ocean colour "
        "product. Ideal for coastal and inland water quality monitoring.",
        L7, P, "2026-04-28", "MODIS_Chlorophyll_A"),
    ],

    # ── 10. AEROSOLS & AIR QUALITY ────────────────────────────────────────────
    "Aerosols & Air Quality": [
      L("MODIS_Combined_Value_Added_AOD",
        "Aerosol Optical Depth (MODIS Combined)",
        "Combined aerosol optical depth from Terra+Aqua MODIS at 10 km. Shows "
        "air quality, Saharan dust storms, and smoke from biomass burning. "
        "Higher values = more aerosols.",
        L6, P, "2024-11-20", "MODIS_Combined_Value_Added_AOD"),
      L("VIIRS_NOAA20_AOD_Dark_Target_Land_Ocean",
        "Aerosol Optical Depth (VIIRS NOAA-20, Dark Target)",
        "AOD from VIIRS NOAA-20 using the Dark Target algorithm. ~6 km, daily. "
        "Current-generation replacement for MODIS AOD with improved retrieval "
        "over bright desert surfaces relevant to northern Africa.",
        L6, P, "2026-06-09"),
      L("OMI_Aerosol_Index",
        "UV Aerosol Index (OMI)",
        "Absorbing aerosol index from OMI using UV measurements. Positive values "
        "indicate absorbing aerosols — dust or smoke. 13 km, daily. Good for "
        "tracking Saharan dust transport and wildfire smoke plumes.",
        L6, P, "2024-11-20", "OMI_Aerosol_Index"),
      L("TROPOMI_L2_Nitrogen_Dioxide_Tropospheric_Column",
        "Tropospheric NO₂ (TROPOMI/Sentinel-5P)",
        "Tropospheric nitrogen dioxide column from TROPOMI on Sentinel-5P. "
        "~7 km, near-daily global. Best-available satellite NO₂ product. "
        "Maps urban air pollution, industrial emissions, and biomass burning.",
        L6, P, "2026-06-09"),
      L("OMI_Nitrogen_Dioxide_Tropo_Column",
        "Tropospheric NO₂ (OMI, Aura)",
        "Tropospheric NO₂ from OMI on the Aura satellite. 13 km, daily. "
        "Longer record than TROPOMI (from 2004) — use for long-term "
        "air quality trend analysis.",
        L6, P, "2026-06-06"),
      L("TROPOMI_L2_Sulfur_Dioxide_Total_Vertical_Column",
        "Sulfur Dioxide Column (TROPOMI/Sentinel-5P)",
        "SO₂ total vertical column from TROPOMI. ~7 km, near-daily. "
        "Detects volcanic eruptions, industrial smelters, and power plants. "
        "Highly relevant for monitoring East African Rift volcanoes.",
        L6, P, "2026-06-09"),
      L("OMI_SO2_Lower_Troposphere",
        "SO₂ Lower Troposphere (OMI)",
        "Sulfur dioxide in the lower troposphere from OMI. 13 km, daily. "
        "Longer record than TROPOMI — maps industrial SO₂ and diffuse "
        "volcanic degassing over the African Rift.",
        L6, P, "2026-06-09"),
      L("OMI_Ozone_DOAS_Total_Column",
        "Total Ozone Column (OMI, DOAS)",
        "Total column ozone from OMI using the DOAS algorithm. ~13 km, daily. "
        "Monitors stratospheric ozone — important for UV radiation exposure "
        "and long-term ozone layer recovery.",
        L6, P, "2026-06-06"),
    ],

    # ── 11. NIGHT LIGHTS ──────────────────────────────────────────────────────
    "Night Lights": [
      L("VIIRS_NOAA20_DayNightBand",
        "Day/Night Band (VIIRS NOAA-20, Daily)",
        "Near-daily low-light imagery from the VIIRS Day/Night Band on NOAA-20. "
        "750 m resolution. Shows city lights, fires, fishing fleets, gas flares, "
        "and aurora. Valuable for tracking electrification and conflict events.",
        L7, P, "2026-06-10"),
      L("VIIRS_CityLights_2012",
        "City Lights Annual Composite (VIIRS 2012–)",
        "Monthly and annual composites of VIIRS night-light radiance. "
        "500 m. Cleaned of moonlight, fires, and aurora — shows stable "
        "human-made light sources. Available as annual and monthly products.",
        L8, J, "2026-06-09"),
      L("VIIRS_Night_Lights",
        "Night Lights (VIIRS Black Marble, 2016)",
        "Annual night-light composite from the VIIRS Black Marble product. "
        "500 m. Atmospherically corrected and cloud-screened. "
        "Best product for mapping electrification and economic activity.",
        L8, P, "2016-01-01"),
    ],

    # ── 12. POPULATION & LAND USE ─────────────────────────────────────────────
    "Population & Land Use": [
      L("GPW_Population_Density_2020",
        "Population Density 2020 (GPW v4)",
        "Gridded Population of the World population density for 2020. "
        "~5 km resolution. People per km². Use alongside climate layers "
        "to assess exposure of populations to floods, heat, or drought.",
        L7, P, "2026-06-09"),
      L("GPW_Population_Density_2000",
        "Population Density 2000 (GPW v4)",
        "Gridded Population of the World for the year 2000. Compare with "
        "the 2020 layer to visualise 20 years of population growth and "
        "urbanisation across Africa.",
        L7, P, "2026-06-09"),
      L("Probabilities_of_Urban_Expansion_2000-2030",
        "Probability of Urban Expansion 2000–2030",
        "Statistical probability that a grid cell transitions from non-urban "
        "to urban between 2000 and 2030. ~1 km. Highlights likely future "
        "urban growth corridors.",
        L7, P, "2026-06-09"),
      L("Agricultural_Lands_Croplands_2000",
        "Cropland Extent 2000",
        "Global cropland extent circa 2000 from satellite-derived land use. "
        "~1 km. Shows the fraction of each grid cell under cultivated crops. "
        "Baseline for monitoring agricultural expansion and food security.",
        L7, P, "2026-06-09"),
      L("Agricultural_Lands_Pastures_2000",
        "Pasture Extent 2000",
        "Global pastureland extent circa 2000. ~1 km. Fraction of grid cell "
        "used for grazing livestock. Pairs with cropland layer to map "
        "total agricultural footprint.",
        L7, P, "2026-06-09"),
      L("Human_Footprint_1995-2004",
        "Human Footprint Index 1995–2004",
        "Composite index of cumulative human influence on the land: built areas, "
        "roads, agriculture, population, and night lights. Higher values = more "
        "impacted. Useful for biodiversity and conservation planning.",
        L7, P, "2026-06-09"),
    ],

    # ── 13. ELEVATION & TERRAIN ───────────────────────────────────────────────
    "Elevation & Terrain": [
      L("ASTER_GDEM_Color_Shaded_Relief",
        "Elevation — ASTER GDEM (Colour Shaded Relief)",
        "Colour-coded shaded relief from the ASTER Global Digital Elevation "
        "Model at 30 m resolution. Covers 83°N–83°S. Zoom to level 10+ for "
        "full detail. Use to understand topographic context for climate "
        "and flood vulnerability.",
        L12, J, "2026-06-09"),
      L("SRTM_Color_Index",
        "Elevation — SRTM (Colour Index)",
        "Colour elevation index from the Shuttle Radar Topography Mission (SRTM). "
        "~30 m resolution (1 arc-second). Acquired in 11 days in Feb 2000. "
        "Widely used baseline DEM for Africa. Zoom to level 10+ for detail.",
        L12, P, "2026-06-09"),
    ],
  },

  "mapSettings": {
    "center": [0, 30],
    "zoom": 3,
    "minZoom": 2,
    "maxZoom": 12
  },
  "wmtsBaseUrl": "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best",
  "format": "image/png",
  "_notes": {
    "validation": "All layers verified HTTP 200 against GIBS epsg3857/best endpoint June 2026.",
    "timeFormat": "Most layers use YYYY-MM-DD. Sub-daily products (IMERG archive, GHRSST MUR) use full ISO datetime.",
    "compositeDates": "NDVI/EVI 16-day products use period-boundary dates — changing the date arbitrarily will 404.",
    "airsLag": "AIRS L3 products have a 3–5 day processing lag — use dates at least 4 days in the past.",
    "highResTiles": "Level12 layers (OPERA, ASTER, SRTM) render blank at low zoom; they require zoom 10+.",
    "maxZoom": "mapSettings.maxZoom raised to 12 to allow exploration of high-res layers."
  }
}

# Count layers
total = sum(len(v) for v in data["categories"].values())
print(f"Writing {total} layers across {len(data['categories'])} categories → {OUT}")

with open(OUT, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")

print("Done.")
