import type { ImageRef } from "@canva/asset";
import { upload } from "@canva/asset";
import {
  Alert,
  Button,
  HorizontalCard,
  Rows,
  SegmentedControl,
  Text,
  Title,
} from "@canva/app-ui-kit";
import { initAppElement } from "@canva/design";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import * as styles from "styles/components.css";
import { DatePicker } from "./components/DatePicker";
import { LayerBrowser } from "./components/LayerBrowser";
import { RegionMap } from "./components/RegionMap";
import {
  ALL_LAYERS,
  LAYER_CATEGORIES,
  type BoundingBox,
  type GibsLayer,
} from "./config/layers";
import {
  getLayerEarliestDateObj,
  getLayerLatestDateObj,
  isStaticLayer,
} from "./utils/availability";
import {
  buildSnapshotUrl,
  computeDimensions,
  dateObjToString,
  daysAgo,
  stringToDateObj,
  type DateObj,
  type Resolution,
} from "./utils/gibs";

// Fallback date range for static layers (no time dimension).
const MIN_DATE: DateObj = { year: 2010, month: 1, day: 1 };

// Size of the in-panel preview thumbnail.
const PREVIEW_WIDTH = 512;
const PREVIEW_HEIGHT = 256;

// Maximum on-canvas element dimension (used to scale the element while
// preserving the aspect ratio of the selected region).
const MAX_CANVAS_DIM = 600;

/**
 * Metadata stored inside each app element on the canvas. This lets us
 * re-render the element (new date, new layer, new resolution, new crop) and
 * restore the panel state when the user re-selects a previously added image.
 */
type GibsElementData = {
  id: string;
  layerId: string;
  layerName: string;
  time: string;
  resolution: string;
  mimeType: string;
  ref: string;
  imgWidth: number;
  imgHeight: number;
  altText: string;
  fullGlobe: boolean;
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
};

/**
 * App element client — manages elements that carry our metadata and can be
 * updated in-place. The render function outputs a static image element using
 * the `ref` stored in the data.
 */
const appElement = initAppElement<GibsElementData>({
  render: (data) => {
    return [
      {
        type: "image" as const,
        ref: data.ref as ImageRef,
        altText: { text: data.altText, decorative: false },
        top: 0,
        left: 0,
        width: data.imgWidth,
        height: data.imgHeight,
      },
    ];
  },
});

/** Generate a unique-ish id for each element added to the canvas. */
let elementCounter = 0;
const generateElementId = () => `gibs-${Date.now()}-${++elementCounter}`;

/**
 * Insert `data` into `list`, replacing any existing entry with the same
 * `id`. Used everywhere we touch the sidebar list so that two code paths
 * racing on the same element (the SDK's `onElementChange` callback fires
 * while `addElement` is still in flight, and both append to the list) can
 * never produce a duplicate row.
 */
const upsertElement = (
  list: GibsElementData[],
  data: GibsElementData,
): GibsElementData[] => {
  const existing = list.find((e) => e.id === data.id);
  if (existing) {
    return list.map((e) => (e.id === data.id ? data : e));
  }
  return [...list, data];
};

export const App = () => {
  const intl = useIntl();

  // No layer is selected until the user picks one from the accordion browser.
  const [selectedLayer, setSelectedLayer] = useState<GibsLayer | undefined>(
    undefined,
  );

  // The selected imagery date. Reset to the layer's latest date whenever a
  // new layer is chosen (see `handleSelectLayer`).
  const [selectedDate, setSelectedDate] = useState<DateObj>(daysAgo(3));

  // The selected geographic region. `undefined` means full globe.
  const [region, setRegion] = useState<BoundingBox | undefined>(undefined);

  // The output resolution preset. Controls the size/quality of the image
  // uploaded to Canva (high = 8192×4096, medium = 4096×2048, low = 2048×1024).
  const [resolution, setResolution] = useState<Resolution>("high");

  const handleSelectLayer = async (layerId: string) => {
    const layer = ALL_LAYERS.find((l) => l.id === layerId);
    if (!layer) {
      return;
    }
    setSelectedLayer(layer);
    const latest = getLayerLatestDateObj(layerId);
    const nextDate = latest ?? selectedDate;
    if (latest) {
      setSelectedDate(latest);
    }

    // If the user has a satellite image selected on the canvas, swap it for
    // a snapshot of the newly chosen layer (and date) in place.
    if (!isStaticLayer(layer.id) && !isAdding && canUpdateElement) {
      try {
        setIsAdding(true);
        setHasError(false);
        await replaceSelectedImage(layer, dateObjToString(nextDate));
      } catch {
        setHasError(true);
      } finally {
        setIsAdding(false);
      }
    }
  };

  // Compute the date range and available days for the calendar.
  const minDate = useMemo(() => {
    if (!selectedLayer) return MIN_DATE;
    return getLayerEarliestDateObj(selectedLayer.id) ?? MIN_DATE;
  }, [selectedLayer]);

  const maxDate = useMemo(() => {
    if (!selectedLayer) return daysAgo(1);
    return getLayerLatestDateObj(selectedLayer.id) ?? daysAgo(1);
  }, [selectedLayer]);

  const staticLayer = selectedLayer ? isStaticLayer(selectedLayer.id) : false;

  const [isAdding, setIsAdding] = useState(false);
  // Mirror of `isAdding` in a ref so the once-registered
  // `registerOnElementChange` callback can read the *latest* value
  // when handling the `undefined` case (best-effort deletion
  // detection skips a refresh attempt while a fresh upload is in
  // flight).
  const isAddingRef = useRef(false);
  useEffect(() => {
    isAddingRef.current = isAdding;
  }, [isAdding]);
  const [hasError, setHasError] = useState(false);

  // ── App element tracking ──────────────────────────────────────────────
  // When the user selects a previously-added satellite image on the canvas,
  // `registerOnElementChange` fires with that element's data. We restore the
  // panel state (layer, date, region, resolution) from the stored metadata so
  // the user can tweak and update it in-place.
  // The currently selected element on the canvas. Source of truth
  // for "which row is highlighted in the sidebar". We keep both a
  // state value (for rendering) and a ref (for use inside the
  // `registerOnElementChange` callback, which is registered once
  // on mount and closes over the initial render).
  const [selectedElementData, setSelectedElementData] = useState<
    GibsElementData | undefined
  >(undefined);
  const selectedElementDataRef = useRef<GibsElementData | undefined>(undefined);
  useEffect(() => {
    selectedElementDataRef.current = selectedElementData;
  }, [selectedElementData]);

  // Per-element `update` function from the SDK. The SDK gives us one
  // of these every time the user selects an element on the canvas
  // (via the `element.update` handle). We keep one for every element
  // we’ve ever seen so that clicking a sidebar row can re-anchor the
  // selection on the canvas without creating a duplicate.
  const updateFnsRef = useRef<
    Map<
      string,
      (opts: {
        data: GibsElementData;
        placement?: {
          top: number;
          left: number;
          width: number;
          height: number;
        };
      }) => Promise<void>
    >
  >(new Map());

  // Whether we have an `update` function for the currently-selected
  // element. Drives the “Update layer” vs “Add to canvas” button
  // label.
  const [canUpdateElement, setCanUpdateElement] = useState(false);

  // A lightweight list of all satellite images we know about. Each
  // entry mirrors the data stored in the app element. The list grows
  // both when we add a new element AND when the user selects a
  // pre-existing element on the canvas (so old images from previous
  // sessions show up after the user clicks them once).
  const [elementList, setElementList] = useState<GibsElementData[]>([]);

  // Ref to the RegionMap's imperative handle. The App can call
  // `regionMapRef.current?.requestRegion(bbox)` to ask the map to
  // jump to a saved region without firing `onRegionChange` (which
  // would clobber the panel's in-flight state).
  const regionMapRef = useRef<{
    requestRegion: (bbox: BoundingBox | undefined) => void;
  } | null>(null);

  useEffect(() => {
    appElement.registerOnElementChange((element) => {
      if (element) {
        // Our element is selected on the canvas. We:
        //  - remember the per-element `update` handle (so a future
        //    sidebar-row click can re-anchor the selection without
        //    creating a duplicate);
        //  - ensure the element is in the sidebar list (adding it if
        //    this is a pre-existing element from a previous session
        //    that we have not seen before);
        //  - refresh the in-list data in case it was updated in
        //    place on the canvas;
        //  - update the panel state from the stored metadata.
        updateFnsRef.current.set(element.data.id, element.update);
        setSelectedElementData(element.data);
        setCanUpdateElement(true);
        setElementList((prev) => upsertElement(prev, element.data));

        // Restore panel state from the element's stored metadata.
        const layer = ALL_LAYERS.find((l) => l.id === element.data.layerId);
        if (layer) {
          setSelectedLayer(layer);
        }
        setSelectedDate(stringToDateObj(element.data.time));
        setResolution(element.data.resolution as Resolution);
        setRegion(
          element.data.fullGlobe
            ? undefined
            : {
                minLat: element.data.minLat,
                minLon: element.data.minLon,
                maxLat: element.data.maxLat,
                maxLon: element.data.maxLon,
              },
        );
      } else {
        // The element was deselected (or deleted). The SDK does not
        // distinguish the two cases. We do NOT try to re-anchor
        // anything here: the previous implementation called
        // `appElement.addOrUpdateElement(lastSelected)` which, per
        // the SDK docs, "creates a new app element" when no element
        // is selected. That meant every click in empty space
        // duplicated the previously-selected element. We now simply
        // clear the selection state and let the user re-select by
        // clicking the element on the canvas (or the sidebar row).
        setSelectedElementData(undefined);
        setCanUpdateElement(false);
      }
    });
    // We intentionally only register once on mount.
  }, []);

  /** Remove an element from the sidebar list. Best-effort: also clears
   * the canvas selection so the user can press Delete to actually
   * remove the element from the design (the SDK has no public
   * element-delete API in v2.10.1). */
  const handleRemoveFromList = useCallback(
    (id: string) => {
      setElementList((prev) => prev.filter((e) => e.id !== id));
      updateFnsRef.current.delete(id);
      if (selectedElementData?.id === id) {
        setSelectedElementData(undefined);
        setCanUpdateElement(false);
      }
    },
    [selectedElementData],
  );

  /** Build the full data object from current panel state. */
  const buildElementData = useCallback(
    (
      id: string,
      layer: GibsLayer,
      dateStr: string,
      ref: string,
      width: number,
      height: number,
      altTextStr: string,
    ): GibsElementData => {
      const bbox = region ?? {
        minLat: -90,
        minLon: -180,
        maxLat: 90,
        maxLon: 180,
      };
      return {
        id,
        layerId: layer.id,
        layerName: layer.name,
        time: dateStr,
        resolution,
        mimeType: layer.format,
        ref,
        imgWidth: width,
        imgHeight: height,
        altText: altTextStr,
        fullGlobe: !region,
        minLat: bbox.minLat,
        minLon: bbox.minLon,
        maxLat: bbox.maxLat,
        maxLon: bbox.maxLon,
      };
    },
    [region, resolution],
  );

  /**
   * Select an element from the sidebar list. Restores its settings
   * to the panel, jumps the map to its saved region, and re-anchors
   * the selection on the canvas by calling the per-element `update`
   * function we stored when the user previously selected that
   * element on the canvas.
   *
   * If we don't have an `update` function for the element yet (e.g.
   * the user has never clicked the element on the canvas), we fall
   * back to `addOrUpdateElement`. Per the SDK docs, this updates the
   * element if it's currently selected, otherwise it creates a new
   * one — which is what we want for elements we have never seen.
   */
  const handleSelectFromList = async (data: GibsElementData) => {
    const layer = ALL_LAYERS.find((l) => l.id === data.layerId);
    if (layer) {
      setSelectedLayer(layer);
    }
    setSelectedDate(stringToDateObj(data.time));
    setResolution(data.resolution as Resolution);
    const savedRegion: BoundingBox | undefined = data.fullGlobe
      ? undefined
      : {
          minLat: data.minLat,
          minLon: data.minLon,
          maxLat: data.maxLat,
          maxLon: data.maxLon,
        };
    setRegion(savedRegion);

    // Jump the map to the saved region (without firing
    // `onRegionChange`, so the panel's in-flight state isn't
    // overwritten).
    regionMapRef.current?.requestRegion(savedRegion);

    setSelectedElementData(data);
    const updateFn = updateFnsRef.current.get(data.id);
    if (updateFn) {
      // The element is known to exist on the canvas. Calling
      // `update` with the same data re-anchors it as the active
      // selection without creating a duplicate. The SDK will fire
      // `onElementChange(element)` again to confirm.
      try {
        await updateFn({ data });
      } catch {
        // The element is gone. Drop it from the list.
        handleRemoveFromList(data.id);
      }
    } else {
      // We've never selected this element on the canvas (e.g. it
      // was added by another panel instance in a previous session).
      // Use `addOrUpdateElement` as a best-effort: per the SDK docs
      // it updates the currently-selected element, otherwise it
      // creates a new one with this data. We accept the "create
      // new" case as the user explicitly asked for this layer.
      try {
        await appElement.addOrUpdateElement(data);
      } catch {
        // Nothing to do — the user can retry.
      }
    }
  };

  const time = dateObjToString(selectedDate);

  const uploadSnapshot = useCallback(
    async (layer: GibsLayer, dateStr: string, bbox?: BoundingBox) => {
      const { width, height } = computeDimensions(bbox, resolution);
      const asset = await upload({
        type: "image",
        url: buildSnapshotUrl(layer, dateStr, width, height, bbox),
        mimeType: layer.format,
        thumbnailUrl: buildSnapshotUrl(
          layer,
          dateStr,
          PREVIEW_WIDTH,
          PREVIEW_HEIGHT,
          bbox,
        ),
        // GIBS imagery is satellite photography, not AI-generated content.
        aiDisclosure: "none",
        name: `${layer.name} (${dateStr})`,
        width,
        height,
      });
      await asset.whenUploaded();
      return asset.ref;
    },
    [resolution],
  );

  /**
   * Replaces the image inside the currently selected element with a fresh
   * snapshot for the given date. Returns `true` on success, `false` if there
   * was no suitable selection to replace.
   */
  const replaceSelectedImage = useCallback(
    async (layer: GibsLayer, dateStr: string) => {
      if (!selectedElementData) {
        return false;
      }
      const updateFn = updateFnsRef.current.get(selectedElementData.id);
      if (!updateFn) {
        return false;
      }
      const ref = await uploadSnapshot(layer, dateStr, region);
      const { width, height } = computeDimensions(region, resolution);
      const altTextStr = intl.formatMessage(
        {
          defaultMessage: "{name} — NASA GIBS satellite imagery, {date}",
          description:
            "Alt text for a GIBS satellite image added to the canvas.",
        },
        { name: layer.name, date: dateStr },
      );
      const newData = buildElementData(
        selectedElementData.id,
        layer,
        dateStr,
        ref,
        width,
        height,
        altTextStr,
      );
      await updateFn({ data: newData });
      // Keep the sidebar list in sync.
      setElementList((prev) => upsertElement(prev, newData));
      setSelectedElementData(newData);
      return true;
    },
    [
      uploadSnapshot,
      region,
      resolution,
      selectedElementData,
      intl,
      buildElementData,
    ],
  );

  // ── Add or Update — inserts a new element, or updates the selected one ─
  const handleAddOrUpdate = async () => {
    if (!selectedLayer) {
      return;
    }
    setIsAdding(true);
    setHasError(false);
    try {
      const ref = await uploadSnapshot(selectedLayer, time, region);
      const { width, height } = computeDimensions(region, resolution);
      const altTextStr = intl.formatMessage(
        {
          defaultMessage: "{name} — NASA GIBS satellite imagery, {date}",
          description:
            "Alt text for a GIBS satellite image added to the canvas.",
        },
        { name: selectedLayer.name, date: time },
      );

      if (canUpdateElement && selectedElementData) {
        // Update the currently selected element in-place.
        const updateFn = updateFnsRef.current.get(selectedElementData.id);
        if (updateFn) {
          const newData = buildElementData(
            selectedElementData.id,
            selectedLayer,
            time,
            ref,
            width,
            height,
            altTextStr,
          );
          await updateFn({ data: newData });
          setElementList((prev) => upsertElement(prev, newData));
          setSelectedElementData(newData);
          return;
        }
        // Fall through to "add a new element" if we don't have an
        // update handle for the selected element.
      }
      {
        // Add a new element to the canvas.
        // Add a new element to the canvas.
        const id = generateElementId();
        const data = buildElementData(
          id,
          selectedLayer,
          time,
          ref,
          width,
          height,
          altTextStr,
        );

        // Scale the on-canvas element to a reasonable size while preserving
        // the aspect ratio of the selected region.
        const scale = MAX_CANVAS_DIM / Math.max(width, height);
        const elW = Math.round(width * scale);
        const elH = Math.round(height * scale);

        await appElement.addElement({
          data,
          placement: {
            top: 100,
            left: 100,
            width: elW,
            height: elH,
          },
        });
        // The SDK fires `onElementChange(element)` when the element is
        // created (while `addElement` is still in flight), and both that
        // callback and this path append to the list. `upsertElement`
        // dedupes by id so we never show the row twice.
        setElementList((prev) => upsertElement(prev, data));
      }
    } catch {
      setHasError(true);
    } finally {
      setIsAdding(false);
    }
  };

  // ── Date change — replace a selected satellite box, else just update ──
  const handleDateChange = async (newDate: DateObj) => {
    setSelectedDate(newDate);

    // For static layers the date has no effect, so skip the replacement.
    if (!selectedLayer || isStaticLayer(selectedLayer.id)) {
      return;
    }
    // Don't interfere while an upload is already in flight.
    if (isAdding) {
      return;
    }

    // Only replace if the user has an app element selected on the canvas
    // (not just from the sidebar list — we need the `update` function).
    if (!canUpdateElement) {
      return;
    }
    try {
      const dateStr = dateObjToString(newDate);
      setIsAdding(true);
      setHasError(false);
      await replaceSelectedImage(selectedLayer, dateStr);
    } catch {
      setHasError(true);
    } finally {
      setIsAdding(false);
    }
  };

  const addDisabled = isAdding || !selectedLayer;

  return (
    <div className={styles.scrollContainer}>
      <Rows spacing="2u">
        <Title size="medium">
          <FormattedMessage
            defaultMessage="NASA GIBS Layers"
            description="Title of the NASA GIBS layers panel."
          />
        </Title>

        <Text size="small" tone="tertiary">
          <FormattedMessage
            defaultMessage="Browse satellite imagery by theme, pick a layer, choose a date, then add it to your design."
            description="Helper text explaining how to use the panel."
          />
        </Text>

        <RegionMap ref={regionMapRef} onRegionChange={setRegion} />

        <LayerBrowser
          categories={LAYER_CATEGORIES}
          selectedLayerId={selectedLayer?.id}
          onSelect={handleSelectLayer}
        />

        {selectedLayer && (
          <>
            <div className={styles.datePickerRow}>
              <Text size="small" variant="bold">
                <FormattedMessage
                  defaultMessage="Date"
                  description="Label for the imagery date picker."
                />
              </Text>
              {staticLayer && (
                <Text size="small" tone="tertiary">
                  <FormattedMessage
                    defaultMessage="This is a static layer — date has no effect."
                    description="Note shown for layers without a time dimension."
                  />
                </Text>
              )}
              {canUpdateElement && (
                <Text size="small" tone="tertiary">
                  <FormattedMessage
                    defaultMessage="Changing the date replaces the selected image."
                    description="Hint shown when an image is selected on the canvas."
                  />
                </Text>
              )}
              <DatePicker
                value={selectedDate}
                min={minDate}
                max={maxDate}
                onChange={handleDateChange}
              />
            </div>

            <div className={styles.resolutionRow}>
              <Text size="small" variant="bold">
                <FormattedMessage
                  defaultMessage="Resolution"
                  description="Label for the image resolution selector."
                />
              </Text>
              <SegmentedControl
                value={resolution}
                onChange={(v) => setResolution(v as Resolution)}
                options={[
                  {
                    value: "low",
                    label: intl.formatMessage({
                      defaultMessage: "Low",
                      description:
                        "Low resolution option (2048×1024, ~500 KB).",
                    }),
                  },
                  {
                    value: "medium",
                    label: intl.formatMessage({
                      defaultMessage: "Medium",
                      description:
                        "Medium resolution option (4096×2048, ~2 MB).",
                    }),
                  },
                  {
                    value: "high",
                    label: intl.formatMessage({
                      defaultMessage: "High",
                      description:
                        "High resolution option (8192×4096, ~5–8 MB).",
                    }),
                  },
                ]}
              />
            </div>

            {hasError && (
              <Alert tone="critical">
                <FormattedMessage
                  defaultMessage="Couldn't add this layer. The image may not be available for the selected date — try a different date."
                  description="Error shown when a GIBS layer could not be added to the canvas."
                />
              </Alert>
            )}

            <Button
              variant="primary"
              onClick={handleAddOrUpdate}
              disabled={addDisabled}
              stretch
            >
              {isAdding
                ? canUpdateElement
                  ? intl.formatMessage({
                      defaultMessage: "Updating…",
                      description:
                        "Button label shown while a layer is being updated on the canvas.",
                    })
                  : intl.formatMessage({
                      defaultMessage: "Adding…",
                      description:
                        "Button label shown while a layer is being added to the canvas.",
                    })
                : canUpdateElement
                  ? intl.formatMessage({
                      defaultMessage: "Update layer",
                      description:
                        "Button label to update the selected layer in-place on the canvas.",
                    })
                  : intl.formatMessage({
                      defaultMessage: "Add to canvas",
                      description:
                        "Button label to add the selected layer as a new element on the canvas.",
                    })}
            </Button>
          </>
        )}

        {elementList.length > 0 && (
          <>
            <Text size="small" variant="bold">
              <FormattedMessage
                defaultMessage="Images on canvas"
                description="Section header for the list of satellite images added to the canvas."
              />
            </Text>
            <div className={styles.elementList}>
              {elementList.map((el) => {
                const isSelected = selectedElementData?.id === el.id;
                return (
                  <div
                    key={el.id}
                    className={
                      isSelected ? styles.elementListItemSelected : undefined
                    }
                    data-gibs-selected={isSelected ? "true" : undefined}
                  >
                    <HorizontalCard
                      title={el.layerName}
                      description={el.time}
                      ariaLabel={intl.formatMessage(
                        {
                          defaultMessage: "Select {name} ({date})",
                          description:
                            "Accessible label for selecting a satellite image from the sidebar list.",
                        },
                        { name: el.layerName, date: el.time },
                      )}
                      onClick={() => {
                        void handleSelectFromList(el);
                      }}
                    />
                    <Button
                      variant="tertiary"
                      size="small"
                      ariaLabel={intl.formatMessage(
                        {
                          defaultMessage: "Remove {name} ({date}) from list",
                          description:
                            "Accessible label for removing a satellite image from the sidebar list.",
                        },
                        { name: el.layerName, date: el.time },
                      )}
                      onClick={() => handleRemoveFromList(el.id)}
                    >
                      {intl.formatMessage({
                        defaultMessage: "Remove",
                        description:
                          "Button label to remove an image from the sidebar list.",
                      })}
                    </Button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Rows>
    </div>
  );
};
