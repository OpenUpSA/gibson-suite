import { Button, FormField, Text, TextInput } from "@canva/app-ui-kit";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useIntl } from "react-intl";
import * as styles from "styles/components.css";
import type { BoundingBox } from "../config/layers";

/**
 * Imperative handle the parent can use to ask the map to jump to a
 * specific bounding box without firing `onRegionChange` (e.g. when
 * the user clicks a row in the sidebar list).
 */
export type RegionMapHandle = {
  /** Re-render the rectangle at the given bbox and fit the map to it. */
  requestRegion: (bbox: BoundingBox | undefined) => void;
};

type RegionMapProps = {
  /** Called when the user draws / clears / resizes a region. `undefined` = full globe. */
  onRegionChange: (bbox: BoundingBox | undefined) => void;
};

/**
 * GIBS WMTS tile URL template for Leaflet (EPSG:3857 / Web Mercator).
 * Leaflet substitutes `{z}/{x}/{y}` at render time. BlueMarble is a static
 * layer (no date dimension); its tile matrix set is
 * `GoogleMapsCompatible_Level8` and extension `.jpeg`.
 */
const TILE_URL =
  "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg";

const TILE_ATTRIB = "Imagery courtesy NASA GIBS";
const MAX_ZOOM = 8;

/** Visual aspect ratio (width / height) of the drawn rectangle. */
type AspectRatio = "free" | "1:1" | "16:10";

/** Visual width / height ratio for each preset (height = 1). */
const ASPECT_RATIO_VALUES: Record<Exclude<AspectRatio, "free">, number> = {
  "1:1": 1,
  "16:10": 1.6,
};

/**
 * The mode of the region-selection control. The first three modes
 * (`free`, `1:1`, `16:10`) immediately put the user into rectangle-drawing
 * mode with the matching aspect ratio. `full-globe` clears the region so
 * the next export uses the entire globe. `specify` reveals two text inputs
 * where the user can type a start and end "lat, lon" pair by hand.
 */
type RegionMode = AspectRatio | "full-globe" | "specify";

/** Extract the aspect ratio from a region mode (defaults to `"free"`). */
const modeToAspectRatio = (mode: RegionMode): AspectRatio => {
  if (mode === "free" || mode === "1:1" || mode === "16:10") {
    return mode;
  }
  return "free";
};

/** Number of decimal places to display in the lat/long input boxes. */
const COORDINATE_PRECISION = 4;

/** Format a latitude/longitude number for display in the input boxes. */
const formatCoordinate = (value: number): string => {
  if (!Number.isFinite(value)) {
    return "";
  }
  return value.toFixed(COORDINATE_PRECISION);
};

/** Format a `lat, lon` pair for the combined text input. */
const formatLatLon = (lat: number, lon: number): string => {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return "";
  }
  return `${formatCoordinate(lat)}, ${formatCoordinate(lon)}`;
};

/**
 * Parse a combined `"lat, lon"` (or `"lat lon"`) string into a `[lat, lon]`
 * tuple. Returns `undefined` if the string is malformed or the values
 * fall outside the valid lat/long ranges.
 */
const parseLatLon = (str: string): { lat: number; lon: number } | undefined => {
  const parts = str
    .trim()
    .split(/[,\s]+/)
    .filter(Boolean);
  if (parts.length !== 2) return undefined;
  const lat = Number(parts[0]);
  const lon = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
  if (lat < -90 || lat > 90) return undefined;
  if (lon < -180 || lon > 180) return undefined;
  return { lat, lon };
};

/**
 * Compute the rectangle bounds for the current drag, optionally constraining
 * the *visual* aspect ratio of the rectangle.
 *
 * The map is rendered in Web Mercator projection, so the visual width of a
 * bounding box of `Δlon` degrees at latitude `lat` is proportional to
 * `Δlon · cos(lat)`. The visual height is just `Δlat`. So a "1:1" visual
 * square requires `Δlon = Δlat / cos(lat)`, and a "16:10" rectangle (1.6
 * wide : 1 tall) requires `Δlon = 1.6 · Δlat / cos(lat)`.
 *
 * When a preset aspect ratio is active, the first click is treated as one
 * corner of the rectangle and the drag direction (sign) is preserved while
 * one of the two dimensions is shrunk so the visual aspect ratio matches
 * the preset. With `"free"` the raw drag bounds are returned.
 */
const computeDragBounds = (
  start: L.LatLng,
  current: L.LatLng,
  aspectRatio: AspectRatio,
): L.LatLngBounds => {
  if (aspectRatio === "free") {
    return L.latLngBounds(start, current);
  }

  const targetRatio = ASPECT_RATIO_VALUES[aspectRatio];
  const rawLat = Math.abs(current.lat - start.lat);
  const rawLng = Math.abs(current.lng - start.lng);
  const centerLatDeg = (start.lat + current.lat) / 2;
  const cosLat = Math.cos((centerLatDeg * Math.PI) / 180);

  // Determine the signed extents. The dimension that already exceeds the
  // target ratio is kept as-is; the other is derived from it so the visual
  // aspect ratio matches the preset.
  let adjLat: number;
  let adjLng: number;

  if (rawLng * cosLat > rawLat * targetRatio) {
    // Drag is too wide for the target ratio — height is the limiting axis.
    adjLat = rawLat;
    adjLng = (targetRatio * rawLat) / Math.max(cosLat, 0.0001);
  } else {
    // Drag is too tall for the target ratio — width is the limiting axis.
    adjLng = rawLng;
    adjLat = (rawLng * cosLat) / targetRatio;
  }

  // Anchor the first click as one corner; extend in the drag direction.
  const signLat = current.lat >= start.lat ? 1 : -1;
  const signLng = current.lng >= start.lng ? 1 : -1;
  const endLat = start.lat + signLat * adjLat;
  const endLng = start.lng + signLng * adjLng;

  return L.latLngBounds(
    L.latLng(Math.min(start.lat, endLat), Math.min(start.lng, endLng)),
    L.latLng(Math.max(start.lat, endLat), Math.max(start.lng, endLng)),
  );
};

/** Which corner/edge of the rectangle a resize handle is anchored to. */
type HandleAnchor = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

/** All 8 resize handles, in the order they are rendered. */
const HANDLES: readonly HandleAnchor[] = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
];

/** CSS cursor for each handle (matches the standard resize-cursor map). */
const HANDLE_CURSORS: Record<HandleAnchor, string> = {
  nw: "nwse-resize",
  n: "ns-resize",
  ne: "nesw-resize",
  e: "ew-resize",
  se: "nwse-resize",
  s: "ns-resize",
  sw: "nesw-resize",
  w: "ew-resize",
};

/** CSS cursor used when hovering the rectangle interior (move gesture). */
const MOVE_HANDLE_CURSOR = "move";

/** Clamp `value` to the [min, max] range. */
const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

/** Clamp a `LatLng` to a sane world range. */
const clampLatLng = (latLng: L.LatLng): L.LatLng => {
  return L.latLng(clamp(latLng.lat, -85, 85), latLng.lng);
};

/**
 * Compute the new rectangle bounds when the user drags one of the 8
 * resize handles. The handle's **opposite** edge/corner stays fixed:
 *
 * - For a **corner** handle (e.g. `nw`) the opposite corner (`se`) is
 *   anchored — only the dragged corner moves.
 * - For an **edge** handle (e.g. `n`) the opposite edge (`s`) is anchored
 *   — only the dragged edge moves; the other dimension is preserved.
 *
 * If the user drags a handle past the anchor (e.g. dragging the `n` edge
 * south of the `s` edge) the rectangle flips and the anchor swaps sides.
 * We then re-anchor on the new "opposite" side so the rectangle stays
 * well-formed.
 *
 * When `aspectRatio` is a preset, the bounds are also snapped to that
 * visual aspect ratio (compensated for the Mercator distortion at the
 * centre latitude).
 */
const computeResizeBounds = (
  startBounds: BoundingBox,
  anchor: HandleAnchor,
  current: L.LatLng,
  aspectRatio: AspectRatio,
): BoundingBox => {
  const {
    minLat: startMinLat,
    maxLat: startMaxLat,
    minLon: startMinLon,
    maxLon: startMaxLon,
  } = startBounds;
  const startCenterLat = (startMinLat + startMaxLat) / 2;
  const startCenterLon = (startMinLon + startMaxLon) / 2;
  const startSpanLat = startMaxLat - startMinLat;
  const startSpanLng = startMaxLon - startMinLon;
  const clamped = clampLatLng(current);

  // Build the unconstrained new bounds where the dragged handle sits at
  // `current` and the opposite edge/corner stays at its starting
  // position. The "opposite" of each anchor is its own anchor on the
  // opposite side of the rectangle.
  let newMinLat = startMinLat;
  let newMaxLat = startMaxLat;
  let newMinLon = startMinLon;
  let newMaxLon = startMaxLon;

  if (anchor === "nw") {
    newMinLat = clamped.lat;
    newMinLon = clamped.lng;
  } else if (anchor === "n") {
    newMinLat = clamped.lat;
  } else if (anchor === "ne") {
    newMinLat = clamped.lat;
    newMaxLon = clamped.lng;
  } else if (anchor === "e") {
    newMaxLon = clamped.lng;
  } else if (anchor === "se") {
    newMaxLat = clamped.lat;
    newMaxLon = clamped.lng;
  } else if (anchor === "s") {
    newMaxLat = clamped.lat;
  } else if (anchor === "sw") {
    newMaxLat = clamped.lat;
    newMinLon = clamped.lng;
  } else if (anchor === "w") {
    newMinLon = clamped.lng;
  }

  // If the drag flipped the rectangle (the dragged handle is now on the
  // other side of its original anchor), swap the min/max so the bounds
  // stay sane. The "new" opposite side is now what used to be the
  // dragged side, so subsequent aspect-ratio math still anchors on the
  // fixed (originally-opposite) side.
  const flippedLat = newMinLat > newMaxLat;
  const flippedLng = newMinLon > newMaxLon;
  if (flippedLat) {
    [newMinLat, newMaxLat] = [newMaxLat, newMinLat];
  }
  if (flippedLng) {
    [newMinLon, newMaxLon] = [newMaxLon, newMinLon];
  }

  // Compute the new lat/lng spans for the aspect-ratio math.
  let outLat = newMaxLat - newMinLat;
  let outLng = newMaxLon - newMinLon;

  if (aspectRatio !== "free") {
    // Snap to the aspect ratio. The anchor (opposite side) stays put;
    // the dimension that already exceeds the target ratio is kept and
    // the other is derived. When the rectangle has flipped, the axis
    // that *was* being dragged is now the anchored side, so we keep
    // its original span and derive the other.
    const targetRatio = ASPECT_RATIO_VALUES[aspectRatio];
    const cosLat = Math.cos((((newMinLat + newMaxLat) / 2) * Math.PI) / 180);

    // Determine which dimension to keep: the one that "would have" been
    // dragged, i.e. the one that changed from the start. After a flip
    // the dragged axis is the one whose *opposite* side changed.
    if (anchor === "n" || anchor === "s") {
      // Vertical edge drag — the lat axis is the dragged one, so we
      // keep its raw span and derive the lng axis from the aspect ratio,
      // centred on the original centre longitude.
      outLat = newMaxLat - newMinLat;
      outLng = (outLat * targetRatio) / Math.max(cosLat, 0.0001);
      newMinLon = startCenterLon - outLng / 2;
      newMaxLon = startCenterLon + outLng / 2;
    } else if (anchor === "e" || anchor === "w") {
      // Horizontal edge drag — the lng axis is dragged, lng is kept,
      // lat is derived, centred on the original centre latitude.
      outLng = newMaxLon - newMinLon;
      outLat = (outLng * cosLat) / targetRatio;
      newMinLat = startCenterLat - outLat / 2;
      newMaxLat = startCenterLat + outLat / 2;
    } else {
      // Corner drag. After a flip the originally-opposite corner is now
      // the dragged one, so we anchor the *current* min corner
      // (opposite of the originally-opposite corner) and derive the
      // other dimension. We always anchor the corner that is *not* the
      // one whose absolute span exceeds the target ratio.
      if (outLng * cosLat > outLat * targetRatio) {
        // Too wide — keep lat, derive lng.
        outLng = (outLat * targetRatio) / Math.max(cosLat, 0.0001);
      } else {
        // Too tall — keep lng, derive lat.
        outLat = (outLng * cosLat) / targetRatio;
      }
      // Re-anchor the opposite corner. The opposite corner is the one
      // that the user is *not* currently dragging. Which one that is
      // depends on the anchor and whether the rectangle has flipped.
      if (anchor === "nw") {
        if (flippedLat) {
          newMinLat = newMaxLat - outLat;
        } else {
          newMaxLat = newMinLat + outLat;
        }
        if (flippedLng) {
          newMinLon = newMaxLon - outLng;
        } else {
          newMaxLon = newMinLon + outLng;
        }
      } else if (anchor === "ne") {
        if (flippedLat) {
          newMinLat = newMaxLat - outLat;
        } else {
          newMaxLat = newMinLat + outLat;
        }
        if (flippedLng) {
          newMaxLon = newMinLon + outLng;
        } else {
          newMinLon = newMaxLon - outLng;
        }
      } else if (anchor === "se") {
        if (flippedLat) {
          newMaxLat = newMinLat + outLat;
        } else {
          newMinLat = newMaxLat - outLat;
        }
        if (flippedLng) {
          newMaxLon = newMinLon + outLng;
        } else {
          newMinLon = newMaxLon - outLng;
        }
      } else if (anchor === "sw") {
        if (flippedLat) {
          newMaxLat = newMinLat + outLat;
        } else {
          newMinLat = newMaxLat - outLat;
        }
        if (flippedLng) {
          newMinLon = newMaxLon - outLng;
        } else {
          newMaxLon = newMinLon + outLng;
        }
      }
    }
  }

  // Enforce a minimum span so the rectangle can't shrink to nothing.
  if (newMaxLat - newMinLat < 0.5) {
    const mid = (newMaxLat + newMinLat) / 2;
    newMinLat = mid - 0.25;
    newMaxLat = mid + 0.25;
  }
  if (newMaxLon - newMinLon < 0.5) {
    const mid = (newMaxLon + newMinLon) / 2;
    newMinLon = mid - 0.25;
    newMaxLon = mid + 0.25;
  }

  // Clamp to sane world ranges. The original start span is preserved
  // when clamping so the rectangle doesn't suddenly change size when it
  // hits the world edge.
  if (newMaxLat > 85) {
    newMaxLat = 85;
    newMinLat = Math.max(-85, newMaxLat - Math.max(startSpanLat, 0.5));
  }
  if (newMinLat < -85) {
    newMinLat = -85;
    newMaxLat = Math.min(85, newMinLat + Math.max(startSpanLat, 0.5));
  }
  if (newMaxLon - newMinLon > 360) {
    newMinLon = -180;
    newMaxLon = -180 + Math.max(startSpanLng, 1);
  }

  // Re-order so min <= max.
  if (newMinLat > newMaxLat) {
    [newMinLat, newMaxLat] = [newMaxLat, newMinLat];
  }
  if (newMinLon > newMaxLon) {
    [newMinLon, newMaxLon] = [newMaxLon, newMinLon];
  }

  return {
    minLat: newMinLat,
    minLon: newMinLon,
    maxLat: newMaxLat,
    maxLon: newMaxLon,
  };
};

/**
 * Compute the new rectangle bounds when the rectangle itself is dragged
 * (the "move" gesture). The shape of the rectangle is preserved; only
 * its position changes. If the new position would push any edge past the
 * world bounds, the entire rectangle is clamped so it stays fully on
 * the map.
 */
const computeMoveBounds = (
  startBounds: BoundingBox,
  dragDelta: L.LatLng,
): BoundingBox => {
  const latSpan = startBounds.maxLat - startBounds.minLat;
  const lonSpan = startBounds.maxLon - startBounds.minLon;
  let newMinLat = startBounds.minLat + dragDelta.lat;
  let newMaxLat = startBounds.maxLat + dragDelta.lat;
  let newMinLon = startBounds.minLon + dragDelta.lng;
  let newMaxLon = startBounds.maxLon + dragDelta.lng;
  // Clamp to world bounds. The latitude range is wider than 360 degrees
  // at high zoom levels, so we use ±85 for lat (Mercator limits) and the
  // actual longitude span for lon.
  if (newMinLat < -85) {
    newMinLat = -85;
    newMaxLat = -85 + latSpan;
  }
  if (newMaxLat > 85) {
    newMaxLat = 85;
    newMinLat = 85 - latSpan;
  }
  if (newMaxLon - newMinLon > 360) {
    newMinLon = -180;
    newMaxLon = -180 + lonSpan;
  }
  return {
    minLat: newMinLat,
    minLon: newMinLon,
    maxLat: newMaxLat,
    maxLon: newMaxLon,
  };
};

/**
 * Build the icon for a resize handle. Corner handles are slightly larger
 * than edge handles so the user can tell them apart at a glance and the
 * natural grab-points are emphasized.
 */
const buildHandleIcon = (isCorner: boolean): L.DivIcon => {
  const size = isCorner ? 12 : 10;
  return L.divIcon({
    className: "gibs-resize-handle",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<span class="gibs-resize-handle__inner${
      isCorner ? " gibs-resize-handle__inner--corner" : ""
    }" style="width:${size}px;height:${size}px;"></span>`,
  });
};

/**
 * A compact interactive map for selecting a geographic region. The UI is
 * driven by a single row of buttons at the top:
 *
 * - **FREE / 1:1 / 16:10** — immediately enter rectangle-drawing mode
 *   with the matching aspect ratio.
 * - **FULL GLOBE** — clear the current region so the next export uses the
 *   entire globe.
 * - **SPECIFY** — reveal two text inputs where the user can type a start
 *   and end `"lat, lon"` pair by hand and apply them with a button.
 *
 * Once a rectangle exists it can be **moved** by dragging its interior
 * and **resized** by dragging any of the 8 handles anchored to the
 * corners and edge midpoints. Each handle anchors its **opposite**
 * side, so dragging the `n` edge keeps the `s` edge fixed, dragging
 * the `nw` corner keeps the `se` corner fixed, etc. For a preset
 * aspect ratio the rectangle is snapped to that visual aspect ratio
 * (compensated for Mercator distortion) while resizing.
 *
 * Uses **Leaflet** (not MapLibre GL) because Canva's Content Security
 * Policy blocks Web Workers (`worker-src 'none'`), which MapLibre
 * requires. Leaflet uses pure DOM (`<img>` tiles + SVG vectors) and
 * works within the CSP.
 *
 * The bounding box is returned in EPSG:4326 lat/lon degrees, ready for
 * the WMS `GetMap` request.
 *
 * Aspect-ratio presets (`1:1`, `16:10`) lock the *visual* shape of the
 * drawn rectangle (compensating for Mercator distortion at the
 * rectangle's centre latitude) so the user can quickly select a square
 * or 16:10 region without having to manually eyeball the proportions.
 * They are honoured both while drawing and while resizing via the
 * handles.
 */
export const RegionMap = forwardRef<RegionMapHandle, RegionMapProps>(
  function RegionMap({ onRegionChange }, ref) {
    const intl = useIntl();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<L.Map | null>(null);
    const rectLayerRef = useRef<L.LayerGroup | null>(null);
    const drawModeRef = useRef(false);
    const startLatLngRef = useRef<L.LatLng | null>(null);
    const drawingRectRef = useRef<L.Rectangle | null>(null);
    const aspectRatioRef = useRef<AspectRatio>("free");

    // Refs to the 8 resize handles so we can move them when the rectangle
    // is edited from any source (draw, resize, move, inputs).
    const handleRefs = useRef<Partial<Record<HandleAnchor, L.Marker>>>({});
    // Bounds snapshot taken when a resize/move gesture starts, so we can
    // compute new bounds during the gesture without compounding rounding
    // error.
    const gestureStartBoundsRef = useRef<BoundingBox | null>(null);
    // Starting mouse lat/lng for the in-progress move gesture (not used
    // for resize, where the handle's own position is the source of truth).
    const gestureStartLatLngRef = useRef<L.LatLng | null>(null);

    // Current region-selection mode. The button row's "pressed" state is
    // derived from this; the three aspect-ratio buttons also enter draw
    // mode when clicked. The "is drawing right now" state is kept in
    // `isDrawing` separately so it can flip back to `false` when the
    // mouseup completes the rectangle, even though `mode` stays put.
    const [mode, setMode] = useState<RegionMode>("full-globe");
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasRegion, setHasRegion] = useState(false);

    // String mirrors of the current region for the "specify" inputs. The
    // inputs are uncontrolled-feeling but actually controlled by these
    // strings; when the user clicks "Apply coordinates" we parse them and
    // either accept or show an error.
    const [coordStartStr, setCoordStartStr] = useState("");
    const [coordEndStr, setCoordEndStr] = useState("");
    const [coordError, setCoordError] = useState<string | null>(null);

    // Keep the ref in sync so the Leaflet event handlers (registered once) read
    // the latest value without needing to be re-registered.
    useEffect(() => {
      aspectRatioRef.current = modeToAspectRatio(mode);
    }, [mode]);

    // ── Map initialisation (runs once) ───────────────────────────────────
    useEffect(() => {
      if (!containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        attributionControl: false,
        zoomControl: true,
        center: [20, 0],
        zoom: 1,
        minZoom: 0,
        maxZoom: MAX_ZOOM,
        worldCopyJump: true,
      });

      L.tileLayer(TILE_URL, {
        attribution: TILE_ATTRIB,
        tileSize: 256,
        maxZoom: MAX_ZOOM,
        noWrap: false,
      }).addTo(map);

      rectLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;

      // Invalidate size after the container is laid out.
      const timer = setTimeout(() => map.invalidateSize(), 100);

      return () => {
        clearTimeout(timer);
        map.remove();
        mapRef.current = null;
        rectLayerRef.current = null;
      };
    }, []);

    // ── Imperative handle: external region request ───────────────────────
    // Expose a `requestRegion` method on the component's ref so the
    // parent (App) can ask the map to jump to a specific bbox without
    // firing `onRegionChange` (e.g. when the user clicks a row in the
    // sidebar list). We re-render the rectangle (and the 8 resize
    // handles) at the requested bounds and fit the map view around it.
    // The panel's own region state remains the authoritative source
    // so the user can keep tweaking it without the map overwriting
    // them.
    useImperativeHandle(
      ref,
      (): RegionMapHandle => ({
        requestRegion: (bbox) => {
          const map = mapRef.current;
          if (!map) return;
          // Cancel any in-progress draw or move.
          drawModeRef.current = false;
          setIsDrawing(false);
          gestureStartBoundsRef.current = null;
          gestureStartLatLngRef.current = null;
          map.dragging.enable();
          if (!bbox) {
            // Full globe request — clear the rectangle and reset the view.
            rectLayerRef.current?.clearLayers();
            drawingRectRef.current = null;
            setHasRegion(false);
            setCoordStartStr("");
            setCoordEndStr("");
            setCoordError(null);
            map.setView([20, 0], 1);
            return;
          }
          // Make sure the rectangle exists, then position it.
          if (!drawingRectRef.current) {
            drawingRectRef.current = L.rectangle(
              [
                [bbox.minLat, bbox.minLon],
                [bbox.maxLat, bbox.maxLon],
              ],
              {
                color: "#e5a700",
                weight: 2,
                fillColor: "#e5a700",
                fillOpacity: 0.15,
              },
            );
            rectLayerRef.current?.addLayer(drawingRectRef.current);
          }
          drawingRectRef.current.setBounds(
            L.latLngBounds(
              L.latLng(bbox.minLat, bbox.minLon),
              L.latLng(bbox.maxLat, bbox.maxLon),
            ),
          );
          setHasRegion(true);
          // Keep the "specify" inputs in sync (if they're visible).
          if (mode === "specify") {
            setCoordStartStr(formatLatLon(bbox.minLat, bbox.minLon));
            setCoordEndStr(formatLatLon(bbox.maxLat, bbox.maxLon));
          }
          positionHandles(bbox);
          map.fitBounds(
            [
              [bbox.minLat, bbox.minLon],
              [bbox.maxLat, bbox.maxLon],
            ],
            { padding: [20, 20] },
          );
        },
      }),
      [mode],
    );

    // ── Rectangle drawing via mouse events ──────────────────────────────
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      const onMouseDown = (e: L.LeafletMouseEvent) => {
        if (!drawModeRef.current) return;
        startLatLngRef.current = e.latlng;
        drawingRectRef.current = null;
        map.dragging.disable();
      };

      const onMouseMove = (e: L.LeafletMouseEvent) => {
        if (!drawModeRef.current || !startLatLngRef.current) return;

        const start = startLatLngRef.current;
        const bounds = computeDragBounds(
          start,
          e.latlng,
          aspectRatioRef.current,
        );

        if (drawingRectRef.current) {
          drawingRectRef.current.setBounds(bounds);
        } else {
          drawingRectRef.current = L.rectangle(bounds, {
            color: "#e5a700",
            weight: 2,
            fillColor: "#e5a700",
            fillOpacity: 0.15,
          });
          rectLayerRef.current?.addLayer(drawingRectRef.current);
        }
      };

      const onMouseUp = (e: L.LeafletMouseEvent) => {
        if (!drawModeRef.current || !startLatLngRef.current) return;

        const start = startLatLngRef.current;
        const bounds = computeDragBounds(
          start,
          e.latlng,
          aspectRatioRef.current,
        );
        const minLat = bounds.getSouth();
        const maxLat = bounds.getNorth();
        const minLng = bounds.getWest();
        const maxLng = bounds.getEast();

        // Reject tiny rectangles (accidental clicks).
        if (
          Math.abs(maxLng - minLng) < 0.5 ||
          Math.abs(maxLat - minLat) < 0.5
        ) {
          startLatLngRef.current = null;
          map.dragging.enable();
          return;
        }

        const newBbox: BoundingBox = {
          minLat,
          minLon: minLng,
          maxLat,
          maxLon: maxLng,
        };
        // Promote the in-flight preview rectangle into the persisted one.
        if (!drawingRectRef.current) {
          drawingRectRef.current = L.rectangle(bounds, {
            color: "#e5a700",
            weight: 2,
            fillColor: "#e5a700",
            fillOpacity: 0.15,
          });
          rectLayerRef.current?.addLayer(drawingRectRef.current);
        }
        applyBounds(newBbox);
        onRegionChange(newBbox);
        setHasRegion(true);

        // Exit drawing mode after a successful rectangle.
        drawModeRef.current = false;
        setIsDrawing(false);
        startLatLngRef.current = null;
        map.dragging.enable();
      };

      map.on("mousedown", onMouseDown);
      map.on("mousemove", onMouseMove);
      map.on("mouseup", onMouseUp);

      return () => {
        map.off("mousedown", onMouseDown);
        map.off("mousemove", onMouseMove);
        map.off("mouseup", onMouseUp);
      };
    }, [onRegionChange]);

    // ── Bounds application ───────────────────────────────────────────────
    // Repositions the rectangle and the bottom-right resize handle for a
    // new bbox. Called from the draw handler, the resize/move handlers, and
    // the input fields. Does NOT fire `onRegionChange` — callers do that
    // themselves.
    const applyBounds = (bbox: BoundingBox) => {
      const latLngBounds = L.latLngBounds(
        L.latLng(bbox.minLat, bbox.minLon),
        L.latLng(bbox.maxLat, bbox.maxLon),
      );
      if (drawingRectRef.current) {
        drawingRectRef.current.setBounds(latLngBounds);
      }
      // Keep the "specify" inputs in sync with whatever the rectangle is
      // now. We only overwrite the strings if the user isn't actively
      // editing them — checking `mode === "specify"` covers that case
      // because the inputs are only visible then.
      if (mode === "specify") {
        setCoordStartStr(formatLatLon(bbox.minLat, bbox.minLon));
        setCoordEndStr(formatLatLon(bbox.maxLat, bbox.maxLon));
      }
      positionHandles(bbox);
    };

    // Positions the 8 resize handles around the rectangle bounds.
    const positionHandles = (bbox: BoundingBox) => {
      const { minLat, maxLat, minLon, maxLon } = bbox;
      const midLat = (minLat + maxLat) / 2;
      const midLon = (minLon + maxLon) / 2;
      const positions: Record<HandleAnchor, L.LatLng> = {
        nw: L.latLng(maxLat, minLon),
        n: L.latLng(maxLat, midLon),
        ne: L.latLng(maxLat, maxLon),
        e: L.latLng(midLat, maxLon),
        se: L.latLng(minLat, maxLon),
        s: L.latLng(minLat, midLon),
        sw: L.latLng(minLat, minLon),
        w: L.latLng(midLat, minLon),
      };
      (Object.keys(positions) as HandleAnchor[]).forEach((anchor) => {
        const marker = handleRefs.current[anchor];
        if (marker) {
          marker.setLatLng(positions[anchor]);
        }
      });
    };

    // ── Resize handle + move-gesture installation ───────────────────────
    // Once the map is ready, install the 8 resize handles and wire up the
    // rectangle-drag (move) gesture. The resize handles are Leaflet
    // markers; the move gesture is implemented via custom mouse events on
    // the Leaflet map so we can give the rectangle itself a "move" cursor
    // without making the whole `Rectangle` layer draggable (which would
    // conflict with the draw handler).
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      const handleIconCorner = buildHandleIcon(true);
      const handleIconEdge = buildHandleIcon(false);

      HANDLES.forEach((anchor) => {
        const isCorner =
          anchor === "nw" ||
          anchor === "ne" ||
          anchor === "se" ||
          anchor === "sw";
        const marker = L.marker([0, 0], {
          icon: isCorner ? handleIconCorner : handleIconEdge,
          draggable: true,
          zIndexOffset: 1000,
          keyboard: false,
          opacity: 0,
        }).addTo(map);

        // Capture the starting bounds when the user starts dragging a
        // handle.
        marker.on("dragstart", () => {
          const rect = drawingRectRef.current;
          if (!rect) return;
          const b = rect.getBounds();
          gestureStartBoundsRef.current = {
            minLat: b.getSouth(),
            minLon: b.getWest(),
            maxLat: b.getNorth(),
            maxLon: b.getEast(),
          };
        });

        // Update the rectangle live while dragging the handle.
        marker.on("drag", (event) => {
          const start = gestureStartBoundsRef.current;
          if (!start) return;
          const latlng = (event as unknown as { latlng?: L.LatLng }).latlng;
          if (!latlng) return;
          const newBbox = computeResizeBounds(
            start,
            anchor,
            latlng,
            aspectRatioRef.current,
          );
          applyBounds(newBbox);
        });

        // Commit the final bbox when the handle is dropped.
        marker.on("dragend", () => {
          gestureStartBoundsRef.current = null;
          const rect = drawingRectRef.current;
          if (!rect) return;
          const b = rect.getBounds();
          const finalBbox: BoundingBox = {
            minLat: b.getSouth(),
            minLon: b.getWest(),
            maxLat: b.getNorth(),
            maxLon: b.getEast(),
          };
          onRegionChange(finalBbox);
          setHasRegion(true);
        });

        // Suppress click events bubbling up to the map so clicking on a
        // handle doesn't accidentally start a draw.
        marker.on("mousedown", (event: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(event.originalEvent);
        });
        marker.on("click", (event: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(event.originalEvent);
        });

        handleRefs.current[anchor] = marker;
      });

      // ── Move gesture ─────────────────────────────────────────────────
      // The rectangle itself is draggable so the user can move the region
      // around. We track mouse events on the map so the gesture only
      // fires when the user clicks inside the rectangle (and not when
      // they're drawing a new one).
      const onMapMouseDown = (event: L.LeafletMouseEvent) => {
        // Skip the move gesture if we're in any of the draw modes.
        if (drawModeRef.current) return;
        // Skip the move gesture if there is no existing rectangle.
        const rect = drawingRectRef.current;
        if (!rect) return;
        // Skip if the click is on a resize handle (it bubbles up).
        if (event.originalEvent && event.originalEvent.defaultPrevented) {
          return;
        }
        // Only start a move when the click is inside the rectangle.
        const clickPoint = event.latlng;
        if (!rect.getBounds().contains(clickPoint)) return;

        const b = rect.getBounds();
        gestureStartBoundsRef.current = {
          minLat: b.getSouth(),
          minLon: b.getWest(),
          maxLat: b.getNorth(),
          maxLon: b.getEast(),
        };
        gestureStartLatLngRef.current = clickPoint;
        // Disable map dragging so the pan doesn't fight the move gesture.
        map.dragging.disable();
      };

      const onMapMouseMove = (event: L.LeafletMouseEvent) => {
        if (!gestureStartBoundsRef.current || !gestureStartLatLngRef.current) {
          return;
        }
        const start = gestureStartBoundsRef.current;
        const startLatLng = gestureStartLatLngRef.current;
        const dragDelta = L.latLng(
          event.latlng.lat - startLatLng.lat,
          event.latlng.lng - startLatLng.lng,
        );
        const newBbox = computeMoveBounds(start, dragDelta);
        applyBounds(newBbox);
      };

      const onMapMouseUp = () => {
        if (!gestureStartBoundsRef.current) return;
        const start = gestureStartBoundsRef.current;
        gestureStartBoundsRef.current = null;
        gestureStartLatLngRef.current = null;
        map.dragging.enable();
        const rect = drawingRectRef.current;
        if (!rect) return;
        const b = rect.getBounds();
        // Discard tiny moves (accidental clicks).
        if (
          Math.abs(b.getSouth() - start.minLat) < 0.01 &&
          Math.abs(b.getWest() - start.minLon) < 0.01 &&
          Math.abs(b.getNorth() - start.maxLat) < 0.01 &&
          Math.abs(b.getEast() - start.maxLon) < 0.01
        ) {
          return;
        }
        const finalBbox: BoundingBox = {
          minLat: b.getSouth(),
          minLon: b.getWest(),
          maxLat: b.getNorth(),
          maxLon: b.getEast(),
        };
        onRegionChange(finalBbox);
        setHasRegion(true);
      };

      map.on("mousedown", onMapMouseDown);
      map.on("mousemove", onMapMouseMove);
      map.on("mouseup", onMapMouseUp);

      return () => {
        (Object.keys(handleRefs.current) as HandleAnchor[]).forEach(
          (anchor) => {
            const marker = handleRefs.current[anchor];
            if (marker) {
              marker.off();
              marker.remove();
            }
          },
        );
        // Replace the whole object instead of using `delete` on dynamic keys.
        handleRefs.current = {};
        map.off("mousedown", onMapMouseDown);
        map.off("mousemove", onMapMouseMove);
        map.off("mouseup", onMapMouseUp);
      };
    }, [onRegionChange]);

    // Show / hide the 8 resize handles based on whether a rectangle
    // exists, and apply the correct cursor to each handle's icon. The
    // rectangle interior gets a "move" cursor when a region is present.
    useEffect(() => {
      (Object.keys(handleRefs.current) as HandleAnchor[]).forEach((anchor) => {
        const marker = handleRefs.current[anchor];
        if (marker) {
          const el = (marker as unknown as { _icon?: HTMLElement })._icon;
          if (el) {
            el.style.display = hasRegion ? "" : "none";
            el.style.cursor = HANDLE_CURSORS[anchor];
          }
        }
      });
      const rect = drawingRectRef.current;
      if (rect) {
        const el = (rect as unknown as { _path?: HTMLElement })._path;
        if (el) {
          el.style.cursor = hasRegion ? MOVE_HANDLE_CURSOR : "";
        }
      }
    }, [hasRegion]);

    // ── Mode handlers ────────────────────────────────────────────────────
    // Each of the five top-row buttons sets `mode` and runs the matching
    // side-effect. The three draw buttons additionally clear any existing
    // region and put the user into drawing mode; `full-globe` clears without
    // entering draw mode; `specify` reveals the two lat/lon inputs.

    // Start a fresh rectangle-draw session with the given aspect ratio.
    // Used by all three aspect-ratio buttons. Any existing region is
    // removed so the user starts from a blank slate.
    const startDraw = (nextMode: AspectRatio) => {
      rectLayerRef.current?.clearLayers();
      drawingRectRef.current = null;
      setHasRegion(false);
      onRegionChange(undefined);
      setCoordStartStr("");
      setCoordEndStr("");
      setCoordError(null);
      setMode(nextMode);
      setIsDrawing(true);
      drawModeRef.current = true;
      const map = mapRef.current;
      if (map) {
        map.getContainer().style.cursor = "crosshair";
        // Reset the view so the user can see the whole globe when they
        // start a new draw.
        map.setView([20, 0], 1);
      }
    };

    // FULL GLOBE button — clear any region and switch to "full globe" mode.
    const handleFullGlobe = () => {
      rectLayerRef.current?.clearLayers();
      drawingRectRef.current = null;
      setHasRegion(false);
      setIsDrawing(false);
      drawModeRef.current = false;
      onRegionChange(undefined);
      setCoordStartStr("");
      setCoordEndStr("");
      setCoordError(null);
      setMode("full-globe");
      const map = mapRef.current;
      if (map) {
        map.getContainer().style.cursor = "";
        map.dragging.enable();
        map.setView([20, 0], 1);
      }
    };

    // SPECIFY button — switch to "specify" mode and pre-fill the inputs
    // from the current region (if any) so the user can tweak them.
    const handleSpecify = () => {
      setMode("specify");
      setIsDrawing(false);
      drawModeRef.current = false;
      setCoordError(null);
      const map = mapRef.current;
      if (map) {
        map.getContainer().style.cursor = "";
        map.dragging.enable();
      }
      if (drawingRectRef.current) {
        const b = drawingRectRef.current.getBounds();
        setCoordStartStr(formatLatLon(b.getNorth(), b.getWest()));
        setCoordEndStr(formatLatLon(b.getSouth(), b.getEast()));
      }
    };

    // APPLY COORDINATES button — parse the two inputs, validate, and
    // promote them into a region. Shows an inline error if either input
    // is malformed.
    const handleApplyCoords = () => {
      const start = parseLatLon(coordStartStr);
      const end = parseLatLon(coordEndStr);
      if (!start || !end) {
        setCoordError(
          intl.formatMessage(
            {
              defaultMessage:
                "Enter each box as 'lat, lon' with values in degrees (e.g. 37.77, -122.42).",
              description:
                "Error shown beneath the 'specify' inputs when either box is malformed.",
            },
            {},
          ),
        );
        return;
      }
      setCoordError(null);
      // The "start" box represents the top-left corner and the "end" box
      // the bottom-right, so we order them accordingly.
      const minLat = clamp(Math.min(start.lat, end.lat), -85, 85);
      const maxLat = clamp(Math.max(start.lat, end.lat), -85, 85);
      const minLon = Math.min(start.lon, end.lon);
      const maxLon = Math.max(start.lon, end.lon);
      const newBbox: BoundingBox = {
        minLat,
        minLon,
        maxLat,
        maxLon,
      };
      // Reject tiny rectangles (same minimum as drag-draw).
      if (Math.abs(maxLon - minLon) < 0.5 || Math.abs(maxLat - minLat) < 0.5) {
        setCoordError(
          intl.formatMessage(
            {
              defaultMessage:
                "The region is too small. Spread the start and end points further apart.",
              description:
                "Error shown when the entered start/end are too close together to form a meaningful region.",
            },
            {},
          ),
        );
        return;
      }
      // Create the rectangle on the map if needed.
      if (!drawingRectRef.current) {
        drawingRectRef.current = L.rectangle(
          [
            [newBbox.minLat, newBbox.minLon],
            [newBbox.maxLat, newBbox.maxLon],
          ],
          {
            color: "#e5a700",
            weight: 2,
            fillColor: "#e5a700",
            fillOpacity: 0.15,
          },
        );
        rectLayerRef.current?.addLayer(drawingRectRef.current);
      }
      applyBounds(newBbox);
      onRegionChange(newBbox);
      setHasRegion(true);
      // Re-fit the map so the new rectangle is visible.
      mapRef.current?.fitBounds(
        [
          [newBbox.minLat, newBbox.minLon],
          [newBbox.maxLat, newBbox.maxLon],
        ],
        { padding: [20, 20] },
      );
    };

    // ── i18n strings ─────────────────────────────────────────────────────
    const freeLabel = intl.formatMessage({
      defaultMessage: "Free",
      description:
        "Label for the 'free' aspect-ratio button. Clicking it starts a rectangle draw with no aspect ratio constraint.",
    });
    const squareLabel = intl.formatMessage({
      defaultMessage: "1:1",
      description:
        "Label for the '1:1' aspect-ratio button. Clicking it starts a rectangle draw locked to a square shape.",
    });
    const wideLabel = intl.formatMessage({
      defaultMessage: "16:10",
      description:
        "Label for the '16:10' aspect-ratio button. Clicking it starts a rectangle draw locked to a 16:10 widescreen shape.",
    });
    const fullGlobeLabel = intl.formatMessage({
      defaultMessage: "Full globe",
      description:
        "Label for the button that clears the current region so the next export uses the full globe.",
    });
    const specifyLabel = intl.formatMessage({
      defaultMessage: "Specify",
      description:
        "Label for the button that reveals the manual start/end lat/lon input boxes.",
    });
    const drawingHint = intl.formatMessage({
      defaultMessage: "Click and drag on the map to select a region.",
      description: "Hint shown when the user is in rectangle-drawing mode.",
    });
    const regionHint = intl.formatMessage({
      defaultMessage:
        "Region selected — drag the rectangle to move it, or drag a handle to resize from that side.",
      description: "Hint shown when a region has been selected.",
    });
    const startCoordLabel = intl.formatMessage({
      defaultMessage: "Start",
      description:
        "Label for the 'start' (top-left) lat/lon text input below the region map.",
    });
    const endCoordLabel = intl.formatMessage({
      defaultMessage: "End",
      description:
        "Label for the 'end' (bottom-right) lat/lon text input below the region map.",
    });
    const startCoordPlaceholder = intl.formatMessage({
      defaultMessage: "lat, lon",
      description:
        "Placeholder text for the start lat/lon input, e.g. '37.77, -122.42'.",
    });
    const endCoordPlaceholder = intl.formatMessage({
      defaultMessage: "lat, lon",
      description:
        "Placeholder text for the end lat/lon input, e.g. '37.77, -122.42'.",
    });
    const applyCoordsLabel = intl.formatMessage({
      defaultMessage: "Apply coordinates",
      description:
        "Label for the button that applies the manually-entered lat/long coordinates to the region selection.",
    });

    // The five top-row buttons, in display order. Each entry knows which
    // mode it represents and which click handler to invoke.
    const modeButtons: readonly {
      value: RegionMode;
      label: string;
      onClick: () => void;
    }[] = useMemo(
      () => [
        { value: "free", label: freeLabel, onClick: () => startDraw("free") },
        { value: "1:1", label: squareLabel, onClick: () => startDraw("1:1") },
        { value: "16:10", label: wideLabel, onClick: () => startDraw("16:10") },
        {
          value: "full-globe",
          label: fullGlobeLabel,
          onClick: handleFullGlobe,
        },
        { value: "specify", label: specifyLabel, onClick: handleSpecify },
      ],
      [
        freeLabel,
        squareLabel,
        wideLabel,
        fullGlobeLabel,
        specifyLabel,
        handleFullGlobe,
        handleSpecify,
      ],
    );

    return (
      <div className={styles.regionMapWrapper}>
        <div ref={containerRef} className={styles.regionMap} />
        <div className={styles.regionMapModes}>
          {modeButtons.map((opt) => {
            const isActive = mode === opt.value;
            // The Canva `Button` types are strict on the (size, variant) pair,
            // so we have to pick a single concrete variant per render. The
            // `pressed` prop gives the selected look without switching variants.
            return isActive ? (
              <Button
                key={opt.value}
                variant="tertiary"
                size="small"
                pressed
                onClick={opt.onClick}
              >
                {opt.label}
              </Button>
            ) : (
              <Button
                key={opt.value}
                variant="tertiary"
                size="small"
                onClick={opt.onClick}
              >
                {opt.label}
              </Button>
            );
          })}
        </div>
        {mode === "specify" && (
          <div className={styles.regionMapCoords}>
            <FormField
              label={startCoordLabel}
              error={Boolean(coordError)}
              description={coordError ?? undefined}
              control={(controlProps) => (
                <TextInput
                  {...controlProps}
                  value={coordStartStr}
                  onChange={(value) => {
                    setCoordStartStr(value);
                    // Clear the error as soon as the user starts editing —
                    // it will be re-shown if they apply and the value is
                    // still malformed.
                    if (coordError) {
                      setCoordError(null);
                    }
                  }}
                  placeholder={startCoordPlaceholder}
                />
              )}
            />
            <FormField
              label={endCoordLabel}
              control={(controlProps) => (
                <TextInput
                  {...controlProps}
                  value={coordEndStr}
                  onChange={(value) => {
                    setCoordEndStr(value);
                    if (coordError) {
                      setCoordError(null);
                    }
                  }}
                  placeholder={endCoordPlaceholder}
                />
              )}
            />
            <div>
              <Button
                variant="tertiary"
                size="small"
                onClick={handleApplyCoords}
              >
                {applyCoordsLabel}
              </Button>
            </div>
          </div>
        )}
        {isDrawing && (
          <Text size="xsmall" tone="tertiary">
            {drawingHint}
          </Text>
        )}
        {hasRegion && !isDrawing && (
          <Text size="xsmall" tone="tertiary">
            {regionHint}
          </Text>
        )}
      </div>
    );
  },
);
