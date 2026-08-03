/**
 * NASA GIBS layer configuration.
 *
 * Full layer set ported from the reference app (`gibson/src/config/layers.json`).
 * Each layer is grouped by category for the accordion browser, and tagged with
 * the image MIME type GIBS returns for it and a human-readable description.
 *
 * GIBS WMTS tiles are great for an interactive map, but to drop a single image
 * onto a Canva canvas we want one rendered snapshot. The GIBS WMS `GetMap`
 * endpoint returns exactly that for a given bounding box, so we use it here.
 */

export type GibsLayer = {
  /** GIBS layer identifier, e.g. "VIIRS_NOAA20_CorrectedReflectance_TrueColor". */
  id: string;
  /** Human-readable name shown in the UI. */
  name: string;
  /** Short description of the layer shown beneath the name in the UI. */
  description: string;
  /** Image MIME type returned by GIBS for this layer. */
  format: "image/jpeg" | "image/png";
};

/**
 * GIBS WMS endpoint for the EPSG:4326 (geographic) projection. WMS `GetMap`
 * returns a single composited image for a bounding box, which is what we upload
 * to Canva as an image asset.
 */
export const GIBS_WMS_BASE =
  "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";

/**
 * GIBS WMTS endpoint for the EPSG:3857 (Web Mercator) projection. Used for the
 * interactive region-selection map — MapLibre GL natively uses EPSG:3857 and the
 * `GoogleMapsCompatible` tile matrix sets.
 */
export const GIBS_WMTS_BASE_3857 =
  "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";

/** A geographic bounding box: [minLat, minLon, maxLat, maxLon] in degrees. */
export type BoundingBox = {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
};

/** A named group of layers for the accordion. */
export type GibsLayerCategory = {
  /** Category label shown as the accordion item title. */
  name: string;
  /** Layers in this category. */
  layers: GibsLayer[];
};

export const LAYER_CATEGORIES: GibsLayerCategory[] = [
  {
    name: "Corrected Reflectance",
    layers: [
      {
        id: "VIIRS_NOAA20_CorrectedReflectance_TrueColor",
        name: "VIIRS NOAA-20 True Color",
        description:
          "True-color imagery from VIIRS on NOAA-20. 375m resolution, daily. Current-generation JPSS sensor with excellent calibration.",
        format: "image/jpeg",
      },
      {
        id: "VIIRS_NOAA21_CorrectedReflectance_TrueColor",
        name: "VIIRS NOAA-21 True Color",
        description:
          "True-color imagery from the newest JPSS satellite (launched 2022). 375m resolution, daily. Use for the most current daily imagery.",
        format: "image/jpeg",
      },
      {
        id: "VIIRS_SNPP_CorrectedReflectance_TrueColor",
        name: "VIIRS SNPP True Color",
        description:
          "True-color from VIIRS on Suomi NPP. 375m resolution. Near-real-time, available within ~3 hours of acquisition. Record dates back to 2012.",
        format: "image/jpeg",
      },
      {
        id: "MODIS_Terra_CorrectedReflectance_TrueColor",
        name: "MODIS Terra True Color",
        description:
          "True-color corrected reflectance from MODIS Terra. 250m resolution, morning overpass (~10:30 am local). Longest daily record from 2000.",
        format: "image/jpeg",
      },
      {
        id: "MODIS_Aqua_CorrectedReflectance_TrueColor",
        name: "MODIS Aqua True Color",
        description:
          "True-color from MODIS Aqua. 250m resolution, afternoon overpass (~1:30 pm local). Pairs with Terra for fuller daily coverage.",
        format: "image/jpeg",
      },
      {
        id: "MODIS_Terra_CorrectedReflectance_Bands721",
        name: "MODIS Terra False Color (7-2-1)",
        description:
          "False-color mapping SWIR, NIR, and Red from MODIS Terra. Burn scars appear vivid red-brown, healthy vegetation bright green, bare soil tan. Essential for fire and flood analysis at 250m.",
        format: "image/jpeg",
      },
      {
        id: "VIIRS_NOAA20_CorrectedReflectance_BandsM11-I2-I1",
        name: "VIIRS NOAA-20 False Color (fire/burn, M11-I2-I1)",
        description:
          "False-color from VIIRS NOAA-20 mapping SWIR, NIR, and Red at 375m. Burn scars appear orange-red, healthy vegetation bright green, flooded areas dark. Higher resolution than MODIS false colour.",
        format: "image/jpeg",
      },
      {
        id: "VIIRS_NOAA20_CorrectedReflectance_BandsM3-I3-M11",
        name: "VIIRS NOAA-20 False Color (vegetation, M3-I3-M11)",
        description:
          "False-color from VIIRS NOAA-20 using Blue, SWIR, and SWIR-2. Highlights vegetation health and moisture — healthy canopy appears cyan, stressed vegetation turns yellow-orange. 375m resolution.",
        format: "image/jpeg",
      },
    ],
  },
  {
    name: "Temperature",
    layers: [
      {
        id: "AIRS_L3_Surface_Air_Temperature_Daily_Day",
        name: "Surface Air Temp (AIRS L3, Day)",
        description:
          "L3 gridded daytime air temperature at 2 m above surface from AIRS. Gap-free daily global coverage at ~1° resolution — no orbital banding. Note: 3–5 day processing lag; use a recent but not yesterday's date.",
        format: "image/png",
      },
      {
        id: "AIRS_L3_Surface_Air_Temperature_Daily_Night",
        name: "Surface Air Temp (AIRS L3, Night)",
        description:
          "L3 gridded nighttime air temperature at 2 m from AIRS. Gap-free daily global at ~1°. Compare with day to see diurnal range.",
        format: "image/png",
      },
      {
        id: "MODIS_Terra_L3_Land_Surface_Temp_Daily_Day",
        name: "Land Surface Temp (MODIS Terra L3, Day)",
        description:
          "L3 daytime land surface temperature from MODIS Terra. 1 km, daily. Measures ground temperature — critical for drought, urban heat, and crop stress. Morning overpass captures mid-morning temperatures.",
        format: "image/png",
      },
      {
        id: "MODIS_Terra_L3_Land_Surface_Temp_Daily_Night",
        name: "Land Surface Temp (MODIS Terra L3, Night)",
        description:
          "L3 nighttime land surface temperature from MODIS Terra. 1 km, daily. Night temperatures reveal soil moisture conditions and minimum cooling. Compare with day to study heat retention.",
        format: "image/png",
      },
      {
        id: "MODIS_Aqua_L3_Land_Surface_Temp_Daily_Day",
        name: "Land Surface Temp (MODIS Aqua L3, Day)",
        description:
          "L3 afternoon daytime land surface temperature from MODIS Aqua. 1 km, daily. Afternoon overpass captures peak daily temperatures — ideal for heat-stress and urban heat-island analysis.",
        format: "image/png",
      },
      {
        id: "MODIS_Aqua_L3_Land_Surface_Temp_Daily_Night",
        name: "Land Surface Temp (MODIS Aqua L3, Night)",
        description:
          "L3 nighttime land surface temperature from MODIS Aqua. 1 km, daily. Aqua night pass fills spatial gaps left by Terra — useful in persistently cloudy regions.",
        format: "image/png",
      },
      {
        id: "MODIS_Terra_L3_Land_Surface_Temp_8Day_Day",
        name: "Land Surface Temp 8-Day (MODIS Terra, Day)",
        description:
          "8-day composite daytime land surface temperature from MODIS Terra. 1 km. Best-quality pixel over 8 days — far fewer cloud gaps than the daily product. Use for heat stress and drought monitoring where daily coverage is too patchy.",
        format: "image/png",
      },
      {
        id: "MODIS_Terra_L3_Land_Surface_Temp_8Day_Night",
        name: "Land Surface Temp 8-Day (MODIS Terra, Night)",
        description:
          "8-day composite nighttime land surface temperature from MODIS Terra. 1 km. Reduced cloud gaps vs daily — use to study minimum temperatures and heat retention over persistently cloudy regions.",
        format: "image/png",
      },
      {
        id: "MODIS_Aqua_L3_Land_Surface_Temp_8Day_Day",
        name: "Land Surface Temp 8-Day (MODIS Aqua, Day)",
        description:
          "8-day composite daytime land surface temperature from MODIS Aqua. 1 km. Afternoon overpass composite — captures peak daily temperatures with fewer cloud gaps than the daily product.",
        format: "image/png",
      },
      {
        id: "MODIS_Aqua_L3_Land_Surface_Temp_8Day_Night",
        name: "Land Surface Temp 8-Day (MODIS Aqua, Night)",
        description:
          "8-day composite nighttime land surface temperature from MODIS Aqua. 1 km. Aqua night composite fills persistent gap regions left by Terra — good for cloud-prone coastal and tropical areas.",
        format: "image/png",
      },
      {
        id: "VIIRS_NOAA20_Land_Surface_Temp_Day",
        name: "Land Surface Temp (VIIRS NOAA-20, Day)",
        description:
          "Daytime land surface temperature from VIIRS on NOAA-20. 750 m, daily. Current-generation sensor with improved calibration over MODIS. Good spatial detail for urban and agricultural heat monitoring.",
        format: "image/png",
      },
      {
        id: "VIIRS_NOAA20_Land_Surface_Temp_Night",
        name: "Land Surface Temp (VIIRS NOAA-20, Night)",
        description:
          "Nighttime land surface temperature from VIIRS NOAA-20. 750 m, daily. Night temperatures assess surface moisture and map minimum temperatures.",
        format: "image/png",
      },
    ],
  },
  {
    name: "Vegetation & Land Cover",
    layers: [
      {
        id: "MODIS_Terra_NDVI_8Day",
        name: "NDVI 8-Day Composite (MODIS Terra)",
        description:
          "Normalised Difference Vegetation Index from MODIS Terra. 8-day composite at 250 m — high temporal frequency for monitoring rapid vegetation changes such as post-rain greening and fire recovery.",
        format: "image/png",
      },
      {
        id: "MODIS_Terra_L3_NDVI_16Day",
        name: "NDVI 16-Day Composite (MODIS Terra, L3)",
        description:
          "NDVI from MODIS Terra L3. 16-day composite at 250 m, maximum-value composite reduces cloud contamination. Values −1 to +1 — higher means denser vegetation. Note: only valid on 16-day period boundaries.",
        format: "image/png",
      },
      {
        id: "MODIS_Terra_L3_NDVI_Monthly",
        name: "NDVI Monthly Composite (MODIS Terra, L3)",
        description:
          "Monthly NDVI composite from MODIS Terra L3 at 1 km. Less cloud contamination than daily or 8-day products — ideal for trend analysis and long-term drought monitoring.",
        format: "image/png",
      },
      {
        id: "VIIRS_NOAA20_NDVI_8Day",
        name: "NDVI 8-Day (VIIRS NOAA-20)",
        description:
          "Normalised Difference Vegetation Index from VIIRS NOAA-20. 8-day composite at 500 m. Current-generation sensor — use for the most recent data or to cross-validate MODIS NDVI.",
        format: "image/png",
      },
      {
        id: "MODIS_Terra_EVI_8Day",
        name: "EVI 8-Day Composite (MODIS Terra)",
        description:
          "Enhanced Vegetation Index from MODIS Terra. 8-day composite at 250 m. More sensitive than NDVI in high-biomass areas — reduces atmospheric and soil background noise. Preferred in tropical forest regions.",
        format: "image/png",
      },
      {
        id: "MODIS_Terra_L3_EVI_16Day",
        name: "EVI 16-Day Composite (MODIS Terra, L3)",
        description:
          "EVI from MODIS Terra L3. 16-day composite at 250 m with cloud compositing. Use in dense forest areas where NDVI saturates.",
        format: "image/png",
      },
      {
        id: "VIIRS_NOAA20_EVI_8Day",
        name: "EVI 8-Day (VIIRS NOAA-20)",
        description:
          "Enhanced Vegetation Index from VIIRS NOAA-20. 8-day composite at 500 m. Current-generation EVI — consistent methodology with MODIS for long-term trend comparisons.",
        format: "image/png",
      },
      // -- Added layers for Aqua and SNPP to fill gaps --
      {
        id: "MODIS_Aqua_NDVI_8Day",
        name: "NDVI 8-Day Composite (MODIS Aqua)",
        description:
          "Normalised Difference Vegetation Index from MODIS Aqua. 8-day composite at 250 m. Afternoon overpass complements Terra for vegetation monitoring, especially useful in cloudy regions where Terra may be obscured.",
        format: "image/png",
      },
      {
        id: "MODIS_Aqua_EVI_8Day",
        name: "EVI 8-Day Composite (MODIS Aqua)",
        description:
          "Enhanced Vegetation Index from MODIS Aqua. 8-day composite at 250 m. Afternoon overpass, good for monitoring afternoon stress in tropical forests.",
        format: "image/png",
      },
      {
        id: "MODIS_Aqua_L3_NDVI_16Day",
        name: "NDVI 16-Day Composite (MODIS Aqua, L3)",
        description:
          "NDVI from MODIS Aqua L3. 16-day composite at 250 m, maximum-value composite. Use for long-term trend analysis with afternoon overpass data.",
        format: "image/png",
      },
      {
        id: "MODIS_Aqua_L3_EVI_16Day",
        name: "EVI 16-Day Composite (MODIS Aqua, L3)",
        description:
          "EVI from MODIS Aqua L3. 16-day composite at 250 m. Use in dense forest areas with afternoon overpass.",
        format: "image/png",
      },
      {
        id: "VIIRS_SNPP_NDVI_8Day",
        name: "NDVI 8-Day (VIIRS SNPP)",
        description:
          "Normalised Difference Vegetation Index from VIIRS on Suomi NPP. 8-day composite at 500 m. Longer record (since 2012) than NOAA-20, useful for time-series analysis.",
        format: "image/png",
      },
      {
        id: "VIIRS_SNPP_EVI_8Day",
        name: "EVI 8-Day (VIIRS SNPP)",
        description:
          "Enhanced Vegetation Index from VIIRS SNPP. 8-day composite at 500 m. Consistent with MODIS EVI for cross-sensor comparisons.",
        format: "image/png",
      },
      // -------------------------------------------------
      {
        id: "MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual",
        name: "Land Cover Type (IGBP, Annual)",
        description:
          "Annual global land cover at 500 m using the IGBP classification from combined MODIS Terra+Aqua. 17 classes: forest, savanna, grassland, cropland, urban, water, and more.",
        format: "image/png",
      },
      {
        id: "GEDI_ISS_L3_Canopy_Height_Mean_RH100_201904-202303",
        name: "Canopy Height Mean (GEDI 2019–2023)",
        description:
          "Mean vegetation canopy height from NASA GEDI lidar on the ISS. Cumulative 2019–2023 dataset at ~1 km. RH100 = tallest vegetation return. Critical for mapping forest cover, degradation, and carbon stocks.",
        format: "image/png",
      },
      {
        id: "GEDI_ISS_L4B_Aboveground_Biomass_Density_Mean_201904-202303",
        name: "Aboveground Biomass Density (GEDI 2019–2023)",
        description:
          "Mean aboveground biomass density in Mg/ha from NASA GEDI lidar. Cumulative 2019–2023 at ~1 km. Directly estimated from lidar waveform structure — unprecedented accuracy for forest carbon monitoring.",
        format: "image/png",
      },
      {
        id: "OPERA_L3_DIST-ALERT-HLS_Color_Index",
        name: "Vegetation Disturbance Alert (OPERA/HLS, 30 m)",
        description:
          "Near-real-time vegetation disturbance detection at 30 m from Harmonized Landsat Sentinel-2. Highlights recent changes from fire, drought, deforestation, or flooding.",
        format: "image/png",
      },
      {
        id: "OCO-2_Solar_Induced_Florescence_Blended",
        name: "Solar-Induced Fluorescence (OCO-2, Blended)",
        description:
          "Solar-induced chlorophyll fluorescence (SIF) from OCO-2. A direct proxy for gross primary production (photosynthesis). More sensitive than NDVI to actual carbon uptake — reveals drought stress before greenness declines.",
        format: "image/png",
      },
      {
        id: "MODIS_Combined_L3_Black_Sky_Albedo_Daily",
        name: "Black-Sky Albedo Daily (MODIS Combined L3)",
        description:
          "Daily black-sky (directional-hemispherical) albedo from combined MODIS Terra+Aqua at 1 km. Measures the fraction of incoming solar radiation reflected under direct beam illumination. Input for surface energy balance and climate models.",
        format: "image/png",
      },
      {
        id: "MODIS_Combined_L3_White_Sky_Albedo_Daily",
        name: "White-Sky Albedo Daily (MODIS Combined L3)",
        description:
          "Daily white-sky (bi-hemispherical) albedo from combined MODIS Terra+Aqua at 1 km. Albedo under completely diffuse illumination. Compare with black-sky albedo to see the effect of atmospheric scattering.",
        format: "image/png",
      },
      {
        id: "MEaSUREs_Daily_Landscape_Freeze_Thaw_AMSRE",
        name: "Freeze/Thaw State (MEaSUREs, AMSR-E)",
        description:
          "Daily landscape freeze/thaw state from AMSR-E on Aqua. Classifies each grid cell as frozen, thawed or transitional. ~1 km. Important for high-latitude phenology, carbon cycle and permafrost studies.",
        format: "image/png",
      },
    ],
  },
  {
    name: "Floods & Surface Water",
    layers: [
      {
        id: "MODIS_Combined_Flood_1-Day",
        name: "Flood Extent 1-Day (MODIS)",
        description:
          "Daily surface water and flood extent from combined MODIS Terra+Aqua. 250 m. Detects anomalous surface water vs a long-term baseline — use for near-real-time flood mapping.",
        format: "image/png",
      },
      {
        id: "MODIS_Combined_Flood_2-Day",
        name: "Flood Extent 2-Day (MODIS)",
        description:
          "2-day composite flood extent from combined MODIS. 250 m. Fewer cloud gaps than the 1-day product with minimal temporal lag.",
        format: "image/png",
      },
      {
        id: "MODIS_Combined_Flood_3-Day",
        name: "Flood Extent 3-Day (MODIS)",
        description:
          "3-day composite flood extent from MODIS. 250 m. Best cloud coverage of the MODIS flood series — use in persistently cloudy regions.",
        format: "image/png",
      },
      {
        id: "VIIRS_Combined_Flood_1-Day",
        name: "Flood Extent 1-Day (VIIRS, 375 m)",
        description:
          "Daily flood extent from combined VIIRS sensors. 375 m — finer spatial detail than MODIS flood products. Best available near-real-time flood mapping at this resolution.",
        format: "image/png",
      },
      {
        id: "VIIRS_Combined_Flood_2-Day",
        name: "Flood Extent 2-Day (VIIRS, 375 m)",
        description:
          "2-day composite flood extent from VIIRS. 375 m resolution. Reduces cloud gaps while keeping near-real-time response.",
        format: "image/png",
      },
      {
        id: "VIIRS_Combined_Flood_3-Day",
        name: "Flood Extent 3-Day (VIIRS, 375 m)",
        description:
          "3-day composite flood extent from VIIRS. 375 m. Best cloud coverage of the VIIRS flood series.",
        format: "image/png",
      },
      {
        id: "OPERA_L3_Dynamic_Surface_Water_Extent-HLS",
        name: "Surface Water Extent (OPERA/HLS, 30 m)",
        description:
          "Dynamic surface water extent at 30 m from Harmonized Landsat Sentinel-2. Near-real-time high-resolution water mapping. Detects rivers, lakes, reservoirs, and floodplains.",
        format: "image/png",
      },
      {
        id: "OPERA_L3_Dynamic_Surface_Water_Extent-Sentinel-1",
        name: "Surface Water Extent (SAR, Sentinel-1, 30 m)",
        description:
          "Dynamic surface water extent at 30 m from Sentinel-1 SAR. Works through cloud cover — SAR penetrates clouds unlike optical sensors, making it essential for flood monitoring during active rain events.",
        format: "image/png",
      },
    ],
  },
  {
    name: "Precipitation",
    layers: [
      {
        id: "IMERG_Precipitation_Rate_30min",
        name: "Precipitation Rate — Near Real-Time (IMERG, 30-min)",
        description:
          "Near-real-time global precipitation from the GPM constellation. 10 km resolution, updated every 30 minutes. The most current available global rainfall estimate. Use dates within the last few days.",
        format: "image/png",
      },
      {
        id: "IMERG_Precipitation_Rate",
        name: "Precipitation Rate — Archive (IMERG, 30-min)",
        description:
          "GPM IMERG 30-minute precipitation archive. 10 km resolution. Use for specific historical events — supply a full datetime e.g. 2024-11-29T23:30:00Z. Archive dates back to 2000.",
        format: "image/png",
      },
      {
        id: "GMI_Precipitation_Rate_Asc",
        name: "Precipitation Rate — GPM Core Satellite (Ascending)",
        description:
          "Instantaneous precipitation rate from the GPM Microwave Imager on the GPM Core Observatory. Ascending orbital swath — shows the actual satellite pass, not a gridded product. 5 km resolution.",
        format: "image/png",
      },
      {
        id: "AIRS_Precipitation_Day",
        name: "Precipitation (AIRS, Daily)",
        description:
          "Daily precipitation estimate from AIRS sounder on Aqua. Global coverage at ~50 km resolution. Note: 7–10 day processing lag; use a recent archived date.",
        format: "image/png",
      },
      {
        id: "GLDAS_Surface_Total_Precipitation_Rate_Monthly",
        name: "Precipitation Rate — Monthly Climatology (GLDAS)",
        description:
          "Monthly mean precipitation from the Global Land Data Assimilation System (GLDAS). 0.25° resolution, updated monthly. Useful for seasonal climatology and drought indices.",
        format: "image/png",
      },
      {
        id: "LIS_Very_High_Resolution_Lightning_Full_Climatology_LIS_Mean_Flash_Rate",
        name: "Lightning Flash Rate Climatology (LIS, Full)",
        description:
          "Mean total lightning flash rate from the LIS (TRMM + ISS) full climatology. ~0.5°. The Congo Basin is the most lightning-prone region on Earth — this layer visualises the global hotspot.",
        format: "image/png",
      },
      {
        id: "LIS_Very_High_Resolution_Lightning_Monthly_Climatology_LIS_Mean_Flash_Rate",
        name: "Lightning Flash Rate Monthly Climatology (LIS)",
        description:
          "Monthly mean lightning flash rate from LIS climatology. 12 monthly steps reveal the seasonal migration of thunderstorm activity.",
        format: "image/png",
      },
      {
        id: "LIS_Very_High_Resolution_Lightning_Seasonal_Climatology_LIS_Mean_Flash_Rate",
        name: "Lightning Flash Rate Seasonal Climatology (LIS)",
        description:
          "Seasonal mean lightning flash rate from LIS climatology (DJF, MAM, JJA, SON). Shows the progression of thunderstorm activity through the year.",
        format: "image/png",
      },
    ],
  },
  {
    name: "Soil Moisture",
    layers: [
      {
        id: "SMAP_L3_Passive_Day_Soil_Moisture",
        name: "Soil Moisture — Surface (SMAP L3, Day)",
        description:
          "Daily surface soil moisture (0–5 cm) from NASA SMAP passive radiometer. ~36 km resolution. Near-real-time daily global coverage. High values indicate wet soil; low values indicate drought stress.",
        format: "image/png",
      },
      {
        id: "SMAP_L4_Analyzed_Surface_Soil_Moisture",
        name: "Soil Moisture — Surface (SMAP L4, Modeled)",
        description:
          "Surface soil moisture (0–5 cm) from SMAP Level-4 land surface model. ~9 km resolution, 3-hourly. Gap-filled using model + observations. More spatially complete than L3 passive alone.",
        format: "image/png",
      },
      {
        id: "SMAP_L4_Analyzed_Root_Zone_Soil_Moisture",
        name: "Soil Moisture — Root Zone (SMAP L4, Modeled)",
        description:
          "Root-zone soil moisture (0–100 cm) from SMAP Level-4. ~9 km, 3-hourly. Captures moisture available to plant roots — most directly related to agricultural drought and vegetation stress.",
        format: "image/png",
      },
      {
        id: "LPRM_AMSR2_Surface_Soil_Moisture_C1_Band_Day_Daily",
        name: "Soil Moisture — Surface (AMSR-2 LPRM, Day)",
        description:
          "Daily surface soil moisture from AMSR-2 using the Land Parameter Retrieval Model (LPRM). ~25 km resolution. Independent of SMAP — useful for cross-validation and continuity with the AMSRE record.",
        format: "image/png",
      },
      {
        id: "GRACE_Tellus_Liquid_Water_Equivalent_Thickness_Mascon_CRI",
        name: "Groundwater Anomaly (GRACE-FO Mascon)",
        description:
          "Liquid water equivalent thickness anomaly from GRACE-FO mascon solutions. ~300 km resolution, monthly. Captures total water storage change including groundwater — the only satellite product sensitive to deep aquifer depletion.",
        format: "image/png",
      },
    ],
  },
  {
    name: "Snow & Ice",
    layers: [
      {
        id: "MODIS_Terra_L3_NDSI_Snow_Cover_Daily",
        name: "Snow Cover Daily (MODIS Terra, NDSI)",
        description:
          "Daily snow cover from MODIS Terra at 500 m using the Normalised Difference Snow Index (NDSI). Morning overpass. Shows snow on land and ice on water bodies.",
        format: "image/png",
      },
      {
        id: "MODIS_Aqua_L3_NDSI_Snow_Cover_Daily",
        name: "Snow Cover Daily (MODIS Aqua, NDSI)",
        description:
          "Daily snow cover from MODIS Aqua at 500 m using NDSI. Afternoon overpass complements Terra for fuller daily coverage, particularly useful where morning pass is cloud-obscured.",
        format: "image/png",
      },
      {
        id: "VIIRS_NOAA20_NDSI_Snow_Cover",
        name: "Snow Cover Daily (VIIRS NOAA-20, NDSI)",
        description:
          "Daily snow cover from VIIRS NOAA-20 at 375 m — higher resolution than MODIS snow products. Current-generation sensor. Useful for mountain snowpack monitoring.",
        format: "image/png",
      },
    ],
  },
  {
    name: "Water Vapor & Clouds",
    layers: [
      {
        id: "MODIS_Aqua_Water_Vapor_5km_Day",
        name: "Water Vapor Column (MODIS Aqua, Day)",
        description:
          "Total column water vapor from MODIS Aqua. 5 km, daily. Shows atmospheric moisture content — useful for weather forecasting and tracking moisture transport.",
        format: "image/png",
      },
      {
        id: "MODIS_Terra_Water_Vapor_5km_Day",
        name: "Water Vapor Column (MODIS Terra, Day)",
        description:
          "Total column water vapor from MODIS Terra. 5 km, daily. Morning overpass complements Aqua — use together to see diurnal moisture changes over land.",
        format: "image/png",
      },
      {
        id: "MODIS_Aqua_Cloud_Top_Temp_Day",
        name: "Cloud Top Temperature (MODIS Aqua, Day)",
        description:
          "Temperature at cloud tops from MODIS Aqua. 5 km. Colder values indicate taller, more vigorous convective clouds and potentially severe weather. Essential for thunderstorm monitoring.",
        format: "image/png",
      },
      {
        id: "MODIS_Terra_Cloud_Top_Temp_Day",
        name: "Cloud Top Temperature (MODIS Terra, Day)",
        description:
          "Cloud top temperature from MODIS Terra. 5 km. Pairs with Aqua to give two daily snapshots of cloud height and storm intensity.",
        format: "image/png",
      },
      {
        id: "VIIRS_NOAA20_Cloud_Top_Height_Day",
        name: "Cloud Top Height (VIIRS NOAA-20, Day)",
        description:
          "Geometric cloud top height from VIIRS NOAA-20. 750 m, daily. Height in metres rather than temperature — directly interpretable for convective storm analysis.",
        format: "image/png",
      },
      {
        id: "AIRS_L2_Total_Cloud_Fraction_Day",
        name: "Cloud Fraction (AIRS, Day)",
        description:
          "Fraction of sky covered by cloud from the AIRS sounder. Daily swath at ~15 km resolution. Useful for understanding cloud climatology and regional cloud cover patterns.",
        format: "image/png",
      },
    ],
  },
  {
    name: "Ocean & Water Quality",
    layers: [
      {
        id: "GHRSST_L4_MUR_Sea_Surface_Temperature",
        name: "Sea Surface Temperature (MUR L4)",
        description:
          "Multi-sensor blended L4 SST. Gap-free daily global at 1 km. Shows ocean temperature patterns, upwelling zones, and thermal fronts. MUR algorithm combines multiple satellite sensors.",
        format: "image/png",
      },
      {
        id: "GHRSST_L4_MUR_Sea_Surface_Temperature_Anomalies",
        name: "Sea Surface Temperature Anomaly (MUR L4)",
        description:
          "Daily SST anomaly relative to a long-term climatological baseline. 1 km, gap-free. Positive anomalies (warm) highlight marine heat waves; negative anomalies reveal upwelling and cold events.",
        format: "image/png",
      },
      {
        id: "GHRSST_L4_GAMSSA_GDS2_Sea_Surface_Temperature",
        name: "Sea Surface Temperature (GAMSSA L4)",
        description:
          "Australian BoM GAMSSA blended L4 SST using AVHRR + AMSR sensors. Daily global at ~11 km resolution. An independent SST dataset useful for cross-comparison with MUR.",
        format: "image/png",
      },
      {
        id: "MODIS_Aqua_L2_Chlorophyll_A",
        name: "Ocean Chlorophyll-a (MODIS Aqua L2)",
        description:
          "Ocean chlorophyll-a concentration from MODIS Aqua. Proxy for phytoplankton biomass and ocean primary productivity. 1 km swath. High values (green) = algal blooms; low values (blue) = clear ocean.",
        format: "image/png",
      },
      {
        id: "VIIRS_NOAA20_Chlorophyll_a",
        name: "Ocean Chlorophyll-a (VIIRS NOAA-20)",
        description:
          "Chlorophyll-a from VIIRS NOAA-20. 750 m swath, daily. Current-generation ocean color product — useful for monitoring upwelling productivity.",
        format: "image/png",
      },
      {
        id: "S3A_OLCI_Chlorophyll_a",
        name: "Ocean Chlorophyll-a (Sentinel-3A OLCI)",
        description:
          "Chlorophyll-a from the Sentinel-3A OLCI ocean colour sensor. ~300 m resolution — the highest-resolution operational ocean colour product. Ideal for coastal and inland water quality monitoring.",
        format: "image/png",
      },
      {
        id: "JPL_MEaSUREs_L4_Sea_Surface_Height_Anomalies",
        name: "Sea Surface Height Anomaly (MEaSUREs L4)",
        description:
          "Gridded sea surface height anomaly from multiple altimeters (TOPEX/Poseidon, Jason series). ~25 km, 5-day. Tracks ocean circulation, eddies, and sea level rise. Positive anomalies = higher sea surface.",
        format: "image/png",
      },
      {
        id: "SMAP_L3_Sea_Surface_Salinity_CAP_Monthly",
        name: "Sea Surface Salinity (SMAP L3, Monthly)",
        description:
          "Monthly sea surface salinity from SMAP using the CAP algorithm. ~40 km. Monitors freshwater flux, river plume dispersal, and evaporation-precipitation patterns.",
        format: "image/png",
      },
      {
        id: "SMAP_L3_Sea_Surface_Salinity_CAP_8Day_RunningMean",
        name: "Sea Surface Salinity (SMAP L3, 8-Day Running Mean)",
        description:
          "8-day running mean sea surface salinity from SMAP. Higher temporal frequency than monthly — better for observing short-term freshwater events like flood plumes and monsoon-driven dilution.",
        format: "image/png",
      },
      {
        id: "OSCAR_Sea_Surface_Currents_Zonal",
        name: "Sea Surface Currents — Zonal Component (OSCAR)",
        description:
          "Zonal (east-west) near-surface ocean current velocity from OSCAR. ~25 km, 5-day. Derived from altimetry, scatterometer winds and SST. Shows major current systems.",
        format: "image/png",
      },
      {
        id: "OSCAR_Sea_Surface_Currents_Meridional",
        name: "Sea Surface Currents — Meridional Component (OSCAR)",
        description:
          "Meridional (north-south) near-surface ocean current velocity from OSCAR. Complements the zonal component for full vector current visualisation.",
        format: "image/png",
      },
      {
        id: "AMSRU2_Sea_Ice_Concentration_12km",
        name: "Sea Ice Concentration (AMSR2, 12 km)",
        description:
          "Daily sea ice concentration from AMSR2 on GCOM-W1 at 12 km. Tracks Arctic and Antarctic sea ice extent. Relevant for southern ocean sea ice monitoring around Antarctica.",
        format: "image/png",
      },
      {
        id: "GHRSST_L4_MUR_Sea_Ice_Concentration",
        name: "Sea Ice Concentration (MUR L4)",
        description:
          "Daily sea ice concentration from the MUR multi-sensor blended analysis. 1 km, gap-free. Higher resolution than AMSR2 — better for coastal sea ice and polynya detection.",
        format: "image/png",
      },
    ],
  },
  {
    name: "Aerosols & Air Quality",
    layers: [
      {
        id: "AIRS_L3_Carbon_Monoxide_500hPa_Volume_Mixing_Ratio_Daily_Day",
        name: "Carbon Monoxide 500 hPa (AIRS L3, Day)",
        description:
          "Daily daytime carbon monoxide volume mixing ratio at 500 hPa from AIRS on Aqua. ~50 km. Tracks CO from biomass burning, urban pollution and industrial sources. Lower-tropospheric transport plumes visible for days.",
        format: "image/png",
      },
      {
        id: "AIRS_L3_Carbon_Monoxide_500hPa_Volume_Mixing_Ratio_Daily_Night",
        name: "Carbon Monoxide 500 hPa (AIRS L3, Night)",
        description:
          "Daily nighttime carbon monoxide volume mixing ratio at 500 hPa from AIRS. Complements the daytime product — useful for observing diurnal variation in CO plumes. ~50 km.",
        format: "image/png",
      },
      {
        id: "AIRS_L3_Methane_400hPa_Volume_Mixing_Ratio_Daily_Day",
        name: "Methane 400 hPa (AIRS L3, Day)",
        description:
          "Daily daytime methane volume mixing ratio at 400 hPa from AIRS on Aqua. ~50 km. Monitors the second most important anthropogenic greenhouse gas. Useful for identifying wetland emissions and fossil-fuel sources.",
        format: "image/png",
      },
      {
        id: "AIRS_L3_Methane_400hPa_Volume_Mixing_Ratio_Daily_Night",
        name: "Methane 400 hPa (AIRS L3, Night)",
        description:
          "Daily nighttime methane volume mixing ratio at 400 hPa from AIRS. Supplements daytime methane column for diurnal insight.",
        format: "image/png",
      },
      {
        id: "AIRS_L2_Dust_Score_Day",
        name: "Dust Score (AIRS L2, Day)",
        description:
          "Daytime dust score from AIRS — detects airborne mineral dust using infrared sounding. Maps Saharan dust transport, Harmattan haze, and dust outbreaks across West Africa.",
        format: "image/png",
      },
      {
        id: "AIRS_L2_Dust_Score_Night",
        name: "Dust Score (AIRS L2, Night)",
        description:
          "Nighttime dust score from AIRS infrared sounding. Complements daytime dust product — useful where daytime cloud cover obscures dust plumes.",
        format: "image/png",
      },
      {
        id: "MERRA2_Dust_Surface_Mass_Concentration_PM25_Monthly",
        name: "Dust PM2.5 Surface Mass Concentration (MERRA-2, Monthly)",
        description:
          "Monthly mean dust PM2.5 surface mass concentration from NASA MERRA-2 reanalysis. ~50 km. Estimates surface-level fine dust exposure — directly relevant to air quality and public health in the Sahel and Sahara.",
        format: "image/png",
      },
      {
        id: "MERRA2_Carbon_Monoxide_Emission_Monthly",
        name: "Carbon Monoxide Emission (MERRA-2, Monthly)",
        description:
          "Monthly carbon monoxide emissions from MERRA-2 reanalysis. Quantifies CO sources from biomass burning, fossil fuels and biofuel combustion. Useful for identifying burning seasons and emission hotspots.",
        format: "image/png",
      },
      {
        id: "MODIS_Combined_Value_Added_AOD",
        name: "Aerosol Optical Depth (MODIS Combined)",
        description:
          "Combined aerosol optical depth from Terra+Aqua MODIS at 10 km. Shows air quality, Saharan dust storms, and smoke from biomass burning. Higher values = more aerosols.",
        format: "image/png",
      },
      {
        id: "VIIRS_NOAA20_AOD_Dark_Target_Land_Ocean",
        name: "Aerosol Optical Depth (VIIRS NOAA-20, Dark Target)",
        description:
          "AOD from VIIRS NOAA-20 using the Dark Target algorithm. ~6 km, daily. Current-generation replacement for MODIS AOD with improved retrieval over bright desert surfaces.",
        format: "image/png",
      },
      {
        id: "OMI_Aerosol_Index",
        name: "UV Aerosol Index (OMI)",
        description:
          "Absorbing aerosol index from OMI using UV measurements. Positive values indicate absorbing aerosols — dust or smoke. 13 km, daily. Good for tracking Saharan dust transport and wildfire smoke plumes.",
        format: "image/png",
      },
      {
        id: "TROPOMI_L2_Nitrogen_Dioxide_Tropospheric_Column",
        name: "Tropospheric NO₂ (TROPOMI/Sentinel-5P)",
        description:
          "Tropospheric nitrogen dioxide column from TROPOMI on Sentinel-5P. ~7 km, near-daily global. Best-available satellite NO₂ product. Maps urban air pollution, industrial emissions, and biomass burning.",
        format: "image/png",
      },
      {
        id: "OMI_Nitrogen_Dioxide_Tropo_Column",
        name: "Tropospheric NO₂ (OMI, Aura)",
        description:
          "Tropospheric NO₂ from OMI on the Aura satellite. 13 km, daily. Longer record than TROPOMI (from 2004) — use for long-term air quality trend analysis.",
        format: "image/png",
      },
      {
        id: "TROPOMI_L2_Sulfur_Dioxide_Total_Vertical_Column",
        name: "Sulfur Dioxide Column (TROPOMI/Sentinel-5P)",
        description:
          "SO₂ total vertical column from TROPOMI. ~7 km, near-daily. Detects volcanic eruptions, industrial smelters, and power plants. Highly relevant for monitoring rift volcanoes.",
        format: "image/png",
      },
      {
        id: "OMI_SO2_Lower_Troposphere",
        name: "SO₂ Lower Troposphere (OMI)",
        description:
          "Sulfur dioxide in the lower troposphere from OMI. 13 km, daily. Longer record than TROPOMI — maps industrial SO₂ and diffuse volcanic degassing.",
        format: "image/png",
      },
      {
        id: "OMI_Ozone_DOAS_Total_Column",
        name: "Total Ozone Column (OMI, DOAS)",
        description:
          "Total column ozone from OMI using the DOAS algorithm. ~13 km, daily. Monitors stratospheric ozone — important for UV radiation exposure and long-term ozone layer recovery.",
        format: "image/png",
      },
    ],
  },
  {
    name: "Night Lights",
    layers: [
      {
        id: "VIIRS_NOAA20_DayNightBand",
        name: "Day/Night Band (VIIRS NOAA-20, Daily)",
        description:
          "Near-daily low-light imagery from the VIIRS Day/Night Band on NOAA-20. 750 m resolution. Shows city lights, fires, fishing fleets, gas flares, and aurora. Valuable for tracking electrification and conflict events.",
        format: "image/png",
      },
      {
        id: "VIIRS_CityLights_2012",
        name: "City Lights Annual Composite (VIIRS 2012–)",
        description:
          "Monthly and annual composites of VIIRS night-light radiance. 500 m. Cleaned of moonlight, fires, and aurora — shows stable human-made light sources. Available as annual and monthly products.",
        format: "image/jpeg",
      },
      {
        id: "VIIRS_Night_Lights",
        name: "Night Lights (VIIRS Black Marble, 2016)",
        description:
          "Annual night-light composite from the VIIRS Black Marble product. 500 m. Atmospherically corrected and cloud-screened. Best product for mapping electrification and economic activity.",
        format: "image/png",
      },
    ],
  },
  {
    name: "Population & Land Use",
    layers: [
      {
        id: "GPW_Population_Density_2020",
        name: "Population Density 2020 (GPW v4)",
        description:
          "Gridded Population of the World population density for 2020. ~5 km resolution. People per km². Use alongside climate layers to assess exposure of populations to floods, heat, or drought.",
        format: "image/png",
      },
      {
        id: "GPW_Population_Density_2000",
        name: "Population Density 2000 (GPW v4)",
        description:
          "Gridded Population of the World for the year 2000. Compare with the 2020 layer to visualise 20 years of population growth and urbanisation.",
        format: "image/png",
      },
      {
        id: "Probabilities_of_Urban_Expansion_2000-2030",
        name: "Probability of Urban Expansion 2000–2030",
        description:
          "Statistical probability that a grid cell transitions from non-urban to urban between 2000 and 2030. ~1 km. Highlights likely future urban growth corridors.",
        format: "image/png",
      },
      {
        id: "Agricultural_Lands_Croplands_2000",
        name: "Cropland Extent 2000",
        description:
          "Global cropland extent circa 2000 from satellite-derived land use. ~1 km. Shows the fraction of each grid cell under cultivated crops. Baseline for monitoring agricultural expansion and food security.",
        format: "image/png",
      },
      {
        id: "Agricultural_Lands_Pastures_2000",
        name: "Pasture Extent 2000",
        description:
          "Global pastureland extent circa 2000. ~1 km. Fraction of grid cell used for grazing livestock. Pairs with cropland layer to map total agricultural footprint.",
        format: "image/png",
      },
      {
        id: "Human_Footprint_1995-2004",
        name: "Human Footprint Index 1995–2004",
        description:
          "Composite index of cumulative human influence on the land: built areas, roads, agriculture, population, and night lights. Higher values = more impacted. Useful for biodiversity and conservation planning.",
        format: "image/png",
      },
      {
        id: "GRUMP_Settlements",
        name: "Settlements (GRUMP)",
        description:
          "Settlement points from the Global Rural-Urban Mapping Project. Shows location and extent of cities, towns and villages. Static; best-available vintage ~2000.",
        format: "image/png",
      },
      {
        id: "Landsat_Human_Built-up_And_Settlement_Extent",
        name: "Built-up & Settlement Extent (Landsat, 30 m)",
        description:
          "Human built-up and settlement extent derived from Landsat at 30 m (HBASE, ~2010). High-res footprint of urbanisation.",
        format: "image/png",
      },
      {
        id: "Landsat_Global_Man-made_Impervious_Surface",
        name: "Impervious Surface % (Landsat, 30 m)",
        description:
          "Percentage of man-made impervious surface (roads, roofs, paving) from Landsat at 30 m (GMIS, ~2010). Proxy for urban density and flood runoff risk.",
        format: "image/png",
      },
      {
        id: "Anthropogenic_Biomes_of_the_World_2001-2006",
        name: "Anthropogenic Biomes (2001-2006)",
        description:
          "Anthromes: how humans have reshaped ecosystems — dense settlements, villages, croplands, rangelands and wildlands. Static, ~10 km.",
        format: "image/png",
      },
      {
        id: "Last_of_the_Wild_1995-2004",
        name: "Last of the Wild (1995-2004)",
        description:
          "The 10% wildest areas of each biome with least human influence, from the Global Human Footprint. Complements the existing Human Footprint layer.",
        format: "image/png",
      },
      {
        id: "Amphibian_Richness_All_Species_2013",
        name: "Amphibian Richness — All Species (2013)",
        description:
          "Number of amphibian species per grid cell from the SEDAC Amphibian Richness dataset. ~10 km. Highlights biodiversity hotspots and conservation priorities.",
        format: "image/png",
      },
      {
        id: "Amphibian_Richness_Endangered_Species_2013",
        name: "Amphibian Richness — Endangered Species (2013)",
        description:
          "Number of threatened amphibian species per grid cell (IUCN Endangered + Critically Endangered). Identifies the most vulnerable biodiversity hotspots.",
        format: "image/png",
      },
      {
        id: "GRanD_Dams",
        name: "Global Dams (GRanD v1.3)",
        description:
          "Global Reservoir and Dam database point locations from the GRanD v1.3 dataset. ~7,000 dams including major dams. Each point includes dam height, reservoir area and primary use.",
        format: "image/png",
      },
      {
        id: "GRanD_Reservoirs",
        name: "Global Reservoirs (GRanD v1.3)",
        description:
          "Global Reservoir and Dam database reservoir polygons from GRanD v1.3. Shows the extent of man-made lakes behind major dams. Key for tracking water infrastructure and surface water change.",
        format: "image/png",
      },
    ],
  },
  {
    name: "Elevation & Terrain",
    layers: [
      {
        id: "ASTER_GDEM_Color_Shaded_Relief",
        name: "Elevation — ASTER GDEM (Colour Shaded Relief)",
        description:
          "Colour-coded shaded relief from the ASTER Global Digital Elevation Model at 30 m resolution. Covers 83°N–83°S. Use to understand topographic context for climate and flood vulnerability.",
        format: "image/jpeg",
      },
      {
        id: "SRTM_Color_Index",
        name: "Elevation — SRTM (Colour Index)",
        description:
          "Colour elevation index from the Shuttle Radar Topography Mission (SRTM). ~30 m resolution (1 arc-second). Acquired in 11 days in Feb 2000. Widely used baseline DEM.",
        format: "image/png",
      },
      {
        id: "BlueMarble_ShadedRelief_Bathymetry",
        name: "Blue Marble + Bathymetry (MODIS)",
        description:
          "Classic NASA Blue Marble Next Generation composite with shaded relief and ocean bathymetry. Static. A beautiful cloud-free base image of the planet.",
        format: "image/jpeg",
      },
    ],
  },
  {
    name: "Fires & Thermal Anomalies",
    layers: [
      {
        id: "VIIRS_NOAA20_Thermal_Anomalies_375m_All",
        name: "Fires & Thermal Anomalies (VIIRS NOAA-20, 375 m)",
        description:
          "Active fire detections from VIIRS on NOAA-20 at 375 m, day and night combined. Near-real-time. Each point is a detected thermal anomaly: wildfires, agricultural burning, gas flares, volcanoes.",
        format: "image/png",
      },
      {
        id: "VIIRS_SNPP_Thermal_Anomalies_375m_All",
        name: "Fires & Thermal Anomalies (VIIRS Suomi NPP, 375 m)",
        description:
          "Active fire detections from VIIRS on Suomi NPP at 375 m, day and night combined. Longest VIIRS fire record; afternoon/early-morning overpasses.",
        format: "image/png",
      },
      {
        id: "VIIRS_NOAA21_Thermal_Anomalies_375m_All",
        name: "Fires & Thermal Anomalies (VIIRS NOAA-21, 375 m)",
        description:
          "Active fire detections from VIIRS on NOAA-21 at 375 m, day and night combined. Newest JPSS sensor, adds an extra daily overpass to the fire record.",
        format: "image/png",
      },
      {
        id: "MODIS_Combined_Thermal_Anomalies_All",
        name: "Fires & Thermal Anomalies (MODIS Terra+Aqua, 1 km)",
        description:
          "Active fire detections from combined MODIS Terra+Aqua at 1 km, day and night. Coarser than VIIRS but four overpasses per day and a record back to the early 2000s.",
        format: "image/png",
      },
    ],
  },
  {
    name: "Orbit Tracks",
    layers: [
      {
        id: "OrbitTracks_Terra_Descending",
        name: "Orbit Track — Terra (Descending)",
        description:
          "Daily ground track with overpass times for Terra (MODIS, ASTER, MISR). Descending = daytime ~10:30 local overpass. Pair with MODIS Terra layers to see when imagery was captured.",
        format: "image/png",
      },
      {
        id: "OrbitTracks_Aqua_Ascending",
        name: "Orbit Track — Aqua (Ascending)",
        description:
          "Daily ground track with overpass times for Aqua (MODIS, AIRS). Ascending = daytime ~13:30 local overpass. Pair with MODIS Aqua and AIRS layers.",
        format: "image/png",
      },
      {
        id: "OrbitTracks_NOAA-20_Ascending",
        name: "Orbit Track — NOAA-20 (Ascending)",
        description:
          "Daily ground track with overpass times for NOAA-20 (VIIRS). Ascending = daytime ~13:30 local overpass. Pair with VIIRS NOAA-20 layers.",
        format: "image/png",
      },
      {
        id: "OrbitTracks_Suomi_NPP_Ascending",
        name: "Orbit Track — Suomi NPP (Ascending)",
        description:
          "Daily ground track with overpass times for Suomi NPP (VIIRS). Ascending = daytime ~13:30 local overpass. Pair with VIIRS SNPP layers.",
        format: "image/png",
      },
      {
        id: "OrbitTracks_GPM_Ascending",
        name: "Orbit Track — GPM (Ascending)",
        description:
          "Daily ground track with overpass times for GPM Core Observatory (rain radar + GMI). Non-sun-synchronous 65-degree orbit. Pair with IMERG precipitation layers.",
        format: "image/png",
      },
      {
        id: "OrbitTracks_ISS_Ascending",
        name: "Orbit Track — ISS (Ascending)",
        description:
          "Daily ground track with overpass times for International Space Station (GEDI lidar, LIS lightning sensor). 51.6-degree orbit covering the tropics and mid-latitudes.",
        format: "image/png",
      },
      {
        id: "OrbitTracks_Sentinel-5P_Ascending",
        name: "Orbit Track — Sentinel-5P (Ascending)",
        description:
          "Daily ground track with overpass times for Sentinel-5P (TROPOMI). Ascending = daytime ~13:30 local overpass. Pair with TROPOMI NO2 and SO2 layers.",
        format: "image/png",
      },
      {
        id: "OrbitTracks_Landsat-9_Descending",
        name: "Orbit Track — Landsat-9 (Descending)",
        description:
          "Daily ground track with overpass times for Landsat-9 (OLI-2). Descending = daytime ~10:00 local overpass, 16-day repeat. Useful for planning around high-resolution acquisitions.",
        format: "image/png",
      },
    ],
  },
  {
    name: "Natural Hazard Risk",
    layers: [
      {
        id: "NDH_Drought_Hazard_Frequency_Distribution_1980-2000",
        name: "Drought Hazard Frequency (1980-2000)",
        description:
          "Global drought hazard frequency and distribution, 1980-2000, based on precipitation deficit. Static SEDAC Natural Disaster Hotspots layer (~28 km). Use with population density to assess exposure.",
        format: "image/png",
      },
      {
        id: "NDH_Drought_Mortality_Risks_Distribution_2000",
        name: "Drought Mortality Risk (2000)",
        description:
          "Estimated drought mortality risk based on hazard frequency and population exposure. Static SEDAC Natural Disaster Hotspots layer (~28 km). Use with population density to assess exposure.",
        format: "image/png",
      },
      {
        id: "NDH_Flood_Hazard_Frequency_Distribution_1985-2003",
        name: "Flood Hazard Frequency (1985-2003)",
        description:
          "Global flood hazard frequency and distribution from observed flood events, 1985-2003. Static SEDAC Natural Disaster Hotspots layer (~28 km). Use with population density to assess exposure.",
        format: "image/png",
      },
      {
        id: "NDH_Flood_Mortality_Risks_Distribution_2000",
        name: "Flood Mortality Risk (2000)",
        description:
          "Estimated flood mortality risk based on hazard frequency and population exposure. Static SEDAC Natural Disaster Hotspots layer (~28 km). Use with population density to assess exposure.",
        format: "image/png",
      },
      {
        id: "NDH_Cyclone_Hazard_Frequency_Distribution_1980-2000",
        name: "Cyclone Hazard Frequency (1980-2000)",
        description:
          "Global tropical cyclone hazard frequency and distribution, 1980-2000. Relevant to Madagascar, Mozambique and the Indian Ocean coast. Static SEDAC Natural Disaster Hotspots layer (~28 km).",
        format: "image/png",
      },
      {
        id: "NDH_Cyclone_Mortality_Risks_Distribution_2000",
        name: "Cyclone Mortality Risk (2000)",
        description:
          "Estimated cyclone mortality risk based on hazard frequency and population exposure. Static SEDAC Natural Disaster Hotspots layer (~28 km). Use with population density to assess exposure.",
        format: "image/png",
      },
      {
        id: "NDH_Volcano_Hazard_Frequency_Distribution_1979-2000",
        name: "Volcano Hazard Frequency (1979-2000)",
        description:
          "Global volcano hazard frequency and distribution, 1979-2000. Static SEDAC Natural Disaster Hotspots layer (~28 km). Use with population density to assess exposure.",
        format: "image/png",
      },
      {
        id: "NDH_Landslide_Hazard_Distribution_2000",
        name: "Landslide Hazard (2000)",
        description:
          "Global landslide hazard distribution based on slope, soil, precipitation and seismicity. Static SEDAC Natural Disaster Hotspots layer (~28 km). Use with population density to assess exposure.",
        format: "image/png",
      },
    ],
  },
];

/** All layers flattened into a single list (preserves category order). */
export const ALL_LAYERS: GibsLayer[] = LAYER_CATEGORIES.flatMap(
  (cat) => cat.layers,
);

/**
 * A placeholder thumbnail used for every layer card until real per-layer
 * previews are generated. It's an inline SVG data-URI so it needs no network
 * request and satisfies the UI Kit `thumbnail.url` requirement.
 */
export const DUMMY_THUMBNAIL =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56">' +
      '<rect width="56" height="56" rx="8" fill="#1b2a4a"/>' +
      '<circle cx="28" cy="28" r="14" fill="none" stroke="#e5a700" stroke-width="2.5"/>' +
      '<path d="M14 36 Q28 26 42 36" fill="none" stroke="#7fb2ff" stroke-width="2" opacity="0.8"/>' +
      '<path d="M14 22 Q28 32 42 22" fill="none" stroke="#7fb2ff" stroke-width="2" opacity="0.5"/>' +
      "</svg>",
  );
