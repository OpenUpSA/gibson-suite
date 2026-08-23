# Improving Gibson's Flood Layers — Short Report

**Goal:** Better layers for showing flooding (focus: Africa, last ~10 years), based on what NASA Worldview uses, and how to replicate that in Gibson.

**Date:** 2026-06-10

---

## 1. Current state (what Gibson has now)

The `Floods` category in `desktop/src/config/layers.json` has **3 layers**:

| Layer | Sensor | Resolution | Record start | Problem |
|---|---|---|---|---|
| `MODIS_Combined_Flood_1-Day` | MODIS Terra+Aqua (optical) | 250 m | 2000-02-24 | Cloud-contaminated over Africa |
| `MODIS_Combined_Flood_3-Day` | MODIS (optical, 3-day composite) | 250 m | 2000-02-24 | Cloud-contaminated; smoother |
| `VIIRS_Combined_Flood_1-Day` | VIIRS (optical) | 375 m | **2025-01-01** | No historical data; still cloud-affected |

**Key gaps:**
- All three are **optical** → useless during the heavy cloud cover that accompanies African flood events.
- The "Current" VIIRS layer has **no data before ~2025**, so it can't show any of the major recent African floods (2019 Idai, 2022 Nigeria/Bayelsa, 2024 Sahel/Sudan).
- No **cloud-penetrating / SAR** flood layer, which is exactly what Worldview reaches for during an active event.

---

## 2. What Worldview uses for floods (and what we should copy)

Comparing against Worldview's flood products and our local GIBS inventory (`desktop/work/gibs_report.json`):

| Layer | Type | Res | Why it's "better" | In Gibson? |
|---|---|---|---|---|
| **OPERA DSWE – Sentinel-1** (`OPERA_L3_Dynamic_Surface_Water_Extent-Sentinel-1`) | SAR (radar) | 30 m | **Penetrates clouds** — the only near-real-time flood extent that works *during* rain/cloud. The headline improvement. | ❌ draft only in `gen_layers.py` |
| **OPERA DSWE – HLS** (`OPERA_L3_Dynamic_Surface_Water_Extent-HLS`) | Optical (HLS fusion) | 30 m | Higher-res optical flood extent; pair with SAR | ❌ draft only |
| `MODIS_Combined_Flood_2-Day` | Optical | 250 m | Smoother composite than 1-Day, already in GIBS | ❌ |
| `VIIRS_Combined_Flood_2-Day` / `_3-Day` | Optical | 375 m | More temporal options for the "current" view | ❌ |
| `NDH_Flood_Hazard_Frequency_Distribution_1985-2003` | Static risk | ~5 km | **Long-term flood hazard context** (where floods recur) | ❌ |

All of the above were verified **HTTP 200** against GIBS (`GoogleMapsCompatible_Level12` for OPERA, `Level9` for the MODIS/VIIRS composites, `Level7` for NDH).

---

## 3. Feasibility in Gibson — good news

- **Tile serving already supports them.** `buildTileUrlTemplate` in `desktop/src/config/tileUrl.js` builds WMTS REST URLs from `tileMatrixSet` + `format`. OPERA DSWE is delivered as **tiled PNG in EPSG:3857**, so it needs **no `wms: true` flag** (unlike the existing MODIS flood layers, which are WMS-only in GIBS).
- **Zoom is fine.** OPERA is `Level12`; `mapSettings.maxZoom` is already `12`, so it renders once the user zooms to ~10+ (see note in `gen_layers.py` `_notes.highResTiles`).
- **No code changes required** — only catalog edits in `layers.json`.

---

## 4. How to add them (SAFE process)

> ⚠️ **Do NOT re-run `desktop/work/gen_layers.py`.** Its `L()` helper emits only 7 fields and uses category key `"Floods & Surface Water"` (not the live `"Floods"`), and it has **no `sections` array**. Re-running it would `json.dump` over `layers.json` and **destroy the rich hand-curated metadata** (role, metadata, storyPreset, etc.).
>
> Instead, **hand-edit `layers.json`** by mirroring the existing flood entries. A layer must be added to **two places**: `categories.Floods.layers` **and** `sections.imagery`.

### 4a. OPERA DSWE – Sentinel-1 (recommended first add)

Add this object to **both** `categories.Floods.layers` and `sections.imagery`:

```json
{
  "id": "OPERA_L3_Dynamic_Surface_Water_Extent-Sentinel-1",
  "name": "Flood Extent — SAR (Sentinel-1, 30 m)",
  "subtitle": "OPERA DSWE · Sentinel-1 SAR",
  "description": "Dynamic surface water extent from Sentinel-1 SAR at 30 m. SAR penetrates clouds, so this is the only near-real-time flood layer that works during active rain and heavy cloud cover over Africa. Zoom to level 10+; record starts ~2024.",
  "role": "primary",
  "storyDefault": true,
  "tileMatrixSet": "GoogleMapsCompatible_Level12",
  "format": "image/png",
  "legendId": null,
  "section": "imagery",
  "category": "Floods",
  "metadata": {
    "mission": "NASA OPERA",
    "satellite": "Sentinel-1A / Sentinel-1B",
    "sensors": "C-band SAR",
    "orbit": "Sun-synchronous",
    "energySource": "Active (radar)",
    "spectralRange": "Microwave (C-band)",
    "spectralResolution": "N/A",
    "spatialCoverage": "Global (60N–60S)",
    "spatialResolution": "30 m",
    "temporalResolution": "Scene-based (near-daily where repeats)"
  },
  "storyPreset": {
    "label": "Recent African flood (SAR)",
    "before": { "date": "2024-09-01", "center": [9.0, 7.5], "zoom": 10.5 },
    "after":  { "date": "2024-10-01", "center": [9.0, 7.5], "zoom": 10.5 }
  },
  "startDate": "2024-09-04"
}
```

> Confirm the exact `startDate` from the GIBS WMTS `GetCapabilities` `<Dimension>` list (the value above is the commonly published first date; verify before shipping).

### 4b. Missing MODIS / VIIRS composites (trivial adds)

Mirror the existing 1-Day/3-Day entries, changing only `id`, `name`, `description`, and `temporalResolution`:

- `MODIS_Combined_Flood_2-Day` → `wms: true`, `Level9`, `png`, `startDate: "2000-02-24"`, `temporalResolution: "2-day"`.
- `VIIRS_Combined_Flood_2-Day` / `_3-Day` → **no `wms`**, `Level9`, `png`, `startDate: "2025-01-01"`.

### 4c. (Optional) NDH long-term flood hazard

Add `NDH_Flood_Hazard_Frequency_Distribution_1985-2003` (`Level7`, `png`, **no `wms`**) as a `role: "secondary"` context layer so users can show *where floods recur*, distinct from *where they are right now*.

---

## 5. Recommended priority

1. **Add OPERA DSWE – Sentinel-1** — solves the cloud-penetration gap and enables real-time African flood stories (2024 Sahel/Sudan, any future event).
2. **Add the missing 2-Day/3-Day MODIS & VIIRS composites** — cheap wins already drafted in `gen_layers.py`.
3. **Add one NDH flood-risk layer** — for historical/hazard context.
4. **UX note in the Floods category description:** "OPERA SAR is high-resolution — zoom in (level 10+) to see flood extent."

## 6. One-line summary

Gibson's flood offering is entirely optical and (for the "current" layer) post-2025 only; adding the **OPERA Sentinel-1 SAR** layer plus the already-existing MODIS/VIIRS composites gives cloud-proof, historical, and high-res flood mapping for African events with **zero code changes** — just two-entry catalog edits per layer, and do **not** regenerate from `gen_layers.py`.
