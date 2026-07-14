/**
 * Helpers for working with NASA GIBS imagery inside the Canva app.
 *
 * The reference app (`gibson/`) renders GIBS as an interactive MapLibre map of
 * WMTS raster tiles. In Canva we instead produce a single snapshot image (via
 * the GIBS WMS `GetMap` endpoint) and upload it as a Canva image asset, which
 * can then be placed on the canvas as a block.
 */

import type { DateObj } from "@canva/app-ui-kit";
import { GIBS_WMS_BASE, type GibsLayer } from "../config/layers";

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
 */
export const buildSnapshotUrl = (
  layer: GibsLayer,
  time: string,
  width: number,
  height: number,
): string => {
  const params = new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetMap",
    VERSION: "1.3.0",
    LAYERS: layer.id,
    CRS: "EPSG:4326",
    BBOX: "-90,-180,90,180",
    WIDTH: String(width),
    HEIGHT: String(height),
    FORMAT: layer.format,
    TRANSPARENT: "FALSE",
    TIME: time,
  });
  return `${GIBS_WMS_BASE}?${params.toString()}`;
};
