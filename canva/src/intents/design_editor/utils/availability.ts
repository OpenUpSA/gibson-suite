/**
 * Utilities for determining which dates have GIBS imagery available for a given
 * layer, based on the time-interval data extracted from GIBS GetCapabilities.
 */

import type { DateObj } from "@canva/app-ui-kit";
import { LAYER_TIMES, type TimeInterval } from "../config/layer_times";

/**
 * Parse an ISO 8601 period string (e.g. "P1D", "P8D") and return the number of
 * days between images. Falls back to 1 (daily) for unparseable strings.
 */
export const periodToDays = (period: string): number => {
  const match = period.match(/P(?:(\d+)D)?/);
  if (match?.[1]) {
    return parseInt(match[1], 10);
  }
  return 1;
};

/**
 * Convert a `YYYY-MM-DD` string to a JS `Date` at local midnight.
 */
export const dateStringToDate = (s: string): Date => {
  const parts = s.split("-").map(Number);
  const y = parts[0] ?? 2000;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  return new Date(y, m - 1, d);
};

/**
 * Convert a `DateObj` to a `YYYY-MM-DD` string.
 */
export const dateObjToDateString = ({ year, month, day }: DateObj): string =>
  `${String(year).padStart(4, "0")}-${String(month).padStart(
    2,
    "0",
  )}-${String(day).padStart(2, "0")}`;

/**
 * Convert a `Date` to a `DateObj` (1-indexed month).
 */
export const dateToDateObj = (d: Date): DateObj => ({
  year: d.getFullYear(),
  month: d.getMonth() + 1,
  day: d.getDate(),
});

/**
 * Check whether a given date string (`YYYY-MM-DD`) falls within any of the
 * layer's availability intervals, accounting for the repetition period.
 *
 * For daily layers (P1D), every day in [start, end] is available.
 * For 8-day composites (P8D), only the start date and every 8th day after it
 * are available.
 */
export const isDateAvailable = (
  dateString: string,
  intervals: TimeInterval[],
): boolean => {
  const target = dateStringToDate(dateString).getTime();
  for (const { start, end, period } of intervals) {
    const startMs = dateStringToDate(start).getTime();
    const endMs = dateStringToDate(end).getTime();
    if (target < startMs || target > endMs) {
      continue;
    }
    const days = periodToDays(period);
    if (days <= 1) {
      return true;
    }
    // For composite products, check if the date aligns with the period
    const diffDays = Math.round((target - startMs) / 86_400_000);
    return diffDays % days === 0;
  }
  return false;
};

/**
 * Returns the time intervals for a given GIBS layer, or `null` if the layer has
 * no time dimension (static products like population density or terrain).
 */
export const getLayerIntervals = (layerId: string): TimeInterval[] | null => {
  return LAYER_TIMES[layerId]?.intervals ?? null;
};

/**
 * Returns the default (latest available) date for a layer as a `YYYY-MM-DD`
 * string, or `null` for static layers.
 */
export const getLayerDefaultDate = (layerId: string): string | null => {
  return LAYER_TIMES[layerId]?.default ?? null;
};

/**
 * Returns the latest available date for a layer as a `DateObj`, or `null` for
 * static layers.
 */
export const getLayerLatestDateObj = (layerId: string): DateObj | null => {
  const def = getLayerDefaultDate(layerId);
  if (!def) {
    return null;
  }
  return dateToDateObj(dateStringToDate(def));
};

/**
 * Returns the earliest available date for a layer as a `DateObj`, or `null` for
 * static layers.
 */
export const getLayerEarliestDateObj = (layerId: string): DateObj | null => {
  const intervals = getLayerIntervals(layerId);
  if (!intervals || intervals.length === 0) {
    return null;
  }
  const earliest = intervals.reduce((min, i) =>
    i.start < min.start ? i : min,
  );
  return dateToDateObj(dateStringToDate(earliest.start));
};

/**
 * Check whether a given `DateObj` has imagery available for the specified layer.
 *
 * Static layers (no time dimension) are considered available for any date.
 */
export const isLayerDateAvailable = (
  layerId: string,
  date: DateObj,
): boolean => {
  const intervals = getLayerIntervals(layerId);
  if (!intervals) {
    // Static layer — date doesn't matter
    return true;
  }
  return isDateAvailable(dateObjToDateString(date), intervals);
};

/**
 * Get all available dates in a given month for a layer.
 *
 * @param layerId  The GIBS layer ID.
 * @param year     The year.
 * @param month    The 1-indexed month.
 * @returns A `Set` of day numbers (1-31) that have imagery.
 */
export const getAvailableDaysInMonth = (
  layerId: string,
  year: number,
  month: number,
): Set<number> => {
  const intervals = getLayerIntervals(layerId);
  if (!intervals) {
    // Static layer — all days are "available"
    const daysInMonth = new Date(year, month, 0).getDate();
    return new Set(Array.from({ length: daysInMonth }, (_, i) => i + 1));
  }

  const daysInMonth = new Date(year, month - 1, 0).getDate();
  const available = new Set<number>();
  for (let day = 1; day <= daysInMonth; day++) {
    const ds = `${String(year).padStart(4, "0")}-${String(month).padStart(
      2,
      "0",
    )}-${String(day).padStart(2, "0")}`;
    if (isDateAvailable(ds, intervals)) {
      available.add(day);
    }
  }
  return available;
};

/**
 * Check if a layer is static (no time dimension).
 */
export const isStaticLayer = (layerId: string): boolean => {
  return getLayerIntervals(layerId) == null;
};
