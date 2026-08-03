/**
 * Helpers for working with NASA GIBS imagery inside the Canva app.
 *
 * The reference app (`gibson/`) renders GIBS as an interactive MapLibre map of
 * WMTS raster tiles. In Canva we instead produce a single snapshot image (via
 * the GIBS WMS `GetMap` endpoint) and upload it as a Canva image asset, which
 * can then be placed on the canvas as a block.
 */

import type { DateObj } from "@canva/app-ui-kit";
import {
  GIBS_WMS_BASE,
  type BoundingBox,
  type GibsLayer,
} from "../config/layers";

// Re-export the UI Kit's `DateObj` (`{ year, month, day }`, 1-indexed month) so
// the whole app shares one canonical date type with the `DateInput` component.
export type { DateObj };

/** Format a `DateObj` as a `YYYY-MM-DD` string (the GIBS `TIME` format). */
export const dateObjToString = ({ year, month, day }: DateObj): string =>
  `${String(year).padStart(4, "0")}-${String(month).padStart(
    2,
    "0",
  )}-${String(day).padStart(2, "0")}`;

/** Convert a `Date` to a `DateObj` (1-indexed month). */
export const dateToDateObj = (d: Date): DateObj => ({
  year: d.getFullYear(),
  month: d.getMonth() + 1,
  day: d.getDate(),
});

/** Parse a `YYYY-MM-DD` string into a `DateObj` (1-indexed month). */
export const stringToDateObj = (s: string): DateObj => {
  const parts = s.split("-").map(Number);
  return {
    year: parts[0] ?? 2000,
    month: parts[1] ?? 1,
    day: parts[2] ?? 1,
  };
};

/** Return a `DateObj` for the local calendar date `n` days before today. */
export const daysAgo = (n: number): DateObj => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dateToDateObj(d);
};

/**
 * Build a GIBS WMS `GetMap` URL that renders a full-globe snapshot of the given
 * layer for the given date.
 *
 * The bounding box covers the whole globe in EPSG:4326 (`-90,-180,90,180`).
 * For WMS 1.3.0 with `CRS=EPSG:4326` the bbox axis order is lat,lon.
 *
 * The returned URL is a stable, publicly accessible HTTPS URL with no redirects,
 * which satisfies the requirements of `upload()` from `@canva/asset`.
 *
 * @param layer     The GIBS layer to render.
 * @param time      A `YYYY-MM-DD` date string (GIBS `TIME` parameter).
 * @param width     Output image width in pixels.
 * @param height    Output image height in pixels.
 * @param bbox      Optional bounding box. Defaults to the full globe.
 */
export const buildSnapshotUrl = (
  layer: GibsLayer,
  time: string,
  width: number,
  height: number,
  bbox?: BoundingBox,
): string => {
  const bboxStr = bbox
    ? `${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon}`
    : "-90,-180,90,180";
  const params = new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetMap",
    VERSION: "1.3.0",
    LAYERS: layer.id,
    CRS: "EPSG:4326",
    BBOX: bboxStr,
    WIDTH: String(width),
    HEIGHT: String(height),
    FORMAT: layer.format,
    TRANSPARENT: "FALSE",
    TIME: time,
  });
  return `${GIBS_WMS_BASE}?${params.toString()}`;
};

/** Output resolution presets.
 *
 *  GIBS WMS reliably serves up to 8192×4096. The presets below give users a
 *  trade-off between detail and file size (a full-globe "high" JPEG is
 *  ~5–8 MB; "low" is ~200 KB).
 *
 *  - **high**   — 8192×4096  (max reliable, near-Worldview detail)
 *  - **medium** — 4096×2048  (good quality, ~2 MB)
 *  - **low**    — 2048×1024  (fast, light, ~500 KB)
 */
export type Resolution = "high" | "medium" | "low";

export const RESOLUTION_PRESETS: Record<
  Resolution,
  { maxWidth: number; maxHeight: number }
> = {
  high: { maxWidth: 8192, maxHeight: 4096 },
  medium: { maxWidth: 4096, maxHeight: 2048 },
  low: { maxWidth: 2048, maxHeight: 1024 },
};

/**
 * Compute output pixel dimensions for a region that preserve its aspect ratio
 * while staying within the resolution preset's maximum size.
 *
 * @param bbox       The selected region, or `undefined` for full globe.
 * @param resolution One of "high", "medium", "low" (default "high").
 * @returns `{ width, height }` in pixels.
 */
export const computeDimensions = (
  bbox: BoundingBox | undefined,
  resolution: Resolution = "high",
): { width: number; height: number } => {
  const { maxWidth, maxHeight } = RESOLUTION_PRESETS[resolution];
  if (!bbox) {
    // Full globe is 2:1 (360° × 180°).
    return { width: maxWidth, height: maxHeight };
  }
  const lonSpan = bbox.maxLon - bbox.minLon;
  const latSpan = bbox.maxLat - bbox.minLat;
  const aspect = lonSpan / latSpan;

  let width = maxWidth;
  let height = Math.round(width / aspect);

  if (height > maxHeight) {
    height = maxHeight;
    width = Math.round(height * aspect);
  }
  // Ensure even dimensions (some encoders prefer it).
  if (width % 2 !== 0) width -= 1;
  if (height % 2 !== 0) height -= 1;
  return { width, height };
};
