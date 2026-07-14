# NASA GIBS Layers

All layers are served from NASA GIBS WMTS at `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best`.

## Corrected Reflectance

### VIIRS NOAA-20 True Color
| Field | Value |
|---|---|
| ID | `VIIRS_NOAA20_CorrectedReflectance_TrueColor` |
| Resolution | 375m |
| Tile Matrix Set | `GoogleMapsCompatible_Level9` |
| Description | True-colour imagery from VIIRS on NOAA-20. Complements SNPP coverage. |

## Temperature

### Surface Air Temperature (Day)
| Field | Value |
|---|---|
| ID | `AIRS_L2_Surface_Air_Temperature_Day` |
| Resolution | ~50km |
| Tile Matrix Set | `GoogleMapsCompatible_Level6` |
| Description | Daytime air temperature at 2m above surface from AIRS. |

### Surface Air Temperature (Night)
| Field | Value |
|---|---|
| ID | `AIRS_L2_Surface_Air_Temperature_Night` |
| Resolution | ~50km |
| Tile Matrix Set | `GoogleMapsCompatible_Level6` |
| Description | Nighttime air temperature at 2m above surface from AIRS. |

### Land Surface Temperature (Terra, Day)
| Field | Value |
|---|---|
| ID | `MODIS_Terra_Land_Surface_Temp_Day` |
| Resolution | 1km |
| Tile Matrix Set | `GoogleMapsCompatible_Level7` |
| Description | Daytime land surface temperature from MODIS Terra. |

### Land Surface Temperature (Aqua, Day)
| Field | Value |
|---|---|
| ID | `MODIS_Aqua_Land_Surface_Temp_Day` |
| Resolution | 1km |
| Tile Matrix Set | `GoogleMapsCompatible_Level7` |
| Description | Afternoon land surface temperature from MODIS Aqua. |

## Precipitation & Soil Moisture

### Precipitation Rate (30-min)
| Field | Value |
|---|---|
| ID | `IMERG_Precipitation_Rate` |
| Resolution | 10km |
| Tile Matrix Set | `GoogleMapsCompatible_Level6` |
| Description | Global precipitation from GPM constellation. 30-minute updates. |

## Water Vapor & Clouds

### Water Vapor (MODIS Aqua, Day)
| Field | Value |
|---|---|
| ID | `MODIS_Aqua_Water_Vapor_5km_Day` |
| Resolution | 5km |
| Tile Matrix Set | `GoogleMapsCompatible_Level6` |
| Description | Total column water vapour from MODIS Aqua. |

### Cloud Top Temperature (Aqua, Day)
| Field | Value |
|---|---|
| ID | `MODIS_Aqua_Cloud_Top_Temp_Day` |
| Resolution | 5km |
| Tile Matrix Set | `GoogleMapsCompatible_Level6` |
| Description | Cloud top temperature from MODIS Aqua. |

### Cloud Top Temperature (Terra, Day)
| Field | Value |
|---|---|
| ID | `MODIS_Terra_Cloud_Top_Temp_Day` |
| Resolution | 5km |
| Tile Matrix Set | `GoogleMapsCompatible_Level6` |
| Description | Cloud top temperature from MODIS Terra. |

## Ocean & Water Quality

### Sea Surface Temperature
| Field | Value |
|---|---|
| ID | `GHRSST_L4_MUR_Sea_Surface_Temperature` |
| Resolution | 1km |
| Tile Matrix Set | `GoogleMapsCompatible_Level7` |
| Description | Multi-sensor blended sea surface temperature (MUR). Daily. |

## Aerosols & Air Quality

### Aerosol Optical Depth
| Field | Value |
|---|---|
| ID | `MODIS_Combined_Value_Added_AOD` |
| Resolution | 10km |
| Tile Matrix Set | `GoogleMapsCompatible_Level6` |
| Description | Combined aerosol optical depth from Terra + Aqua MODIS. |

### UV Aerosol Index
| Field | Value |
|---|---|
| ID | `OMI_Aerosol_Index` |
| Resolution | 13km |
| Tile Matrix Set | `GoogleMapsCompatible_Level6` |
| Description | Absorbing aerosol index from OMI. Detects dust and smoke. |
