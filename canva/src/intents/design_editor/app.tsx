import type { ImageRef } from "@canva/asset";
import { upload } from "@canva/asset";
import {
  Alert,
  Button,
  Checkbox,
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

// Spacing between the image element and its optional text label.
const LABEL_GAP = 4;
// Font size for the text label added beneath satellite images.
const LABEL_FONT_SIZE = 11;

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
  includeInfo: boolean;
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
 * the `ref` stored in the data, and optionally a text label with the layer
 * name and date beneath the image.
 */
const appElement = initAppElement<GibsElementData>({
  render: (data) => {
    const imageEl = {
      type: "image" as const,
      ref: data.ref as ImageRef,
      altText: { text: data.altText, decorative: false },
      top: 0,
      left: 0,
      width: data.imgWidth,
      height: data.imgHeight,
    };

    if (data.includeInfo) {
      return [
        imageEl,
        {
          type: "text" as const,
          children: [`${data.layerName} — ${data.time}`],
          top: data.imgHeight + LABEL_GAP,
          left: 0,
          width: data.imgWidth,
          fontSize: LABEL_FONT_SIZE,
          textAlign: "center" as const,
          fontWeight: "normal" as const,
        },
      ];
    }

    return [imageEl];
  },
});

/** Generate a unique-ish id for each element added to the canvas. */
let elementCounter = 0;
const generateElementId = () => `gibs-${Date.now()}-${++elementCounter}`;

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

  // Whether to include a text label with the layer name and date beneath
  // the satellite image on the canvas.
  const [includeInfo, setIncludeInfo] = useState(false);

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
  const [hasError, setHasError] = useState(false);

  // ── App element tracking ──────────────────────────────────────────────
  // When the user selects a previously-added satellite image on the canvas,
  // `registerOnElementChange` fires with that element's data. We restore the
  // panel state (layer, date, region, resolution) from the stored metadata so
  // the user can tweak and update it in-place.
  const elementUpdateRef = useRef<
    | ((opts: {
        data: GibsElementData;
        placement?: {
          top: number;
          left: number;
          width: number;
          height: number;
        };
      }) => Promise<void>)
    | null
  >(null);
  const [selectedElementData, setSelectedElementData] = useState<
    GibsElementData | undefined
  >(undefined);
  // Whether we have the `update` function for the selected element (i.e. it
  // was selected on the canvas, not just from the sidebar list). Without it
  // we can only add a new element, not update in-place.
  const [canUpdateElement, setCanUpdateElement] = useState(false);

  // A lightweight list of all satellite images the app has added to the
  // canvas during this session. Each entry mirrors the data stored in the
  // app element, so the list stays in sync with what's on the canvas.
  const [elementList, setElementList] = useState<GibsElementData[]>([]);

  useEffect(() => {
    appElement.registerOnElementChange((element) => {
      if (element) {
        setSelectedElementData(element.data);
        elementUpdateRef.current = element.update;
        setCanUpdateElement(true);

        // Restore panel state from the element's stored metadata.
        const layer = ALL_LAYERS.find((l) => l.id === element.data.layerId);
        if (layer) {
          setSelectedLayer(layer);
        }
        setSelectedDate(stringToDateObj(element.data.time));
        setResolution(element.data.resolution as Resolution);
        setIncludeInfo(element.data.includeInfo);
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
        // The callback fires with `undefined` when the element is deselected
        // OR deleted. We can't distinguish the two, but we can check whether
        // the previously selected element's id still exists in our list. If
        // it does, it was just deselected (keep it). If the SDK has already
        // removed it from the canvas, it won't fire again with data for that
        // element — so we leave the list as-is and just clear the selection.
        setSelectedElementData(undefined);
        elementUpdateRef.current = null;
        setCanUpdateElement(false);
      }
    });
  }, []);

  /** Remove an element from the sidebar list (e.g. after canvas deletion). */
  const handleRemoveFromList = useCallback((id: string) => {
    setElementList((prev) => prev.filter((e) => e.id !== id));
    setSelectedElementData((prev) => {
      if (prev?.id === id) {
        setCanUpdateElement(false);
        elementUpdateRef.current = null;
        return undefined;
      }
      return prev;
    });
  }, []);

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
        includeInfo,
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
    [region, resolution, includeInfo],
  );

  /** Select an element from the list — restores its settings to the panel. */
  const handleSelectFromList = (data: GibsElementData) => {
    const layer = ALL_LAYERS.find((l) => l.id === data.layerId);
    if (layer) {
      setSelectedLayer(layer);
    }
    setSelectedDate(stringToDateObj(data.time));
    setResolution(data.resolution as Resolution);
    setIncludeInfo(data.includeInfo);
    setRegion(
      data.fullGlobe
        ? undefined
        : {
            minLat: data.minLat,
            minLon: data.minLon,
            maxLat: data.maxLat,
            maxLon: data.maxLon,
          },
    );
    setSelectedElementData(data);
    // Selecting from the sidebar restores settings but does NOT give us the
    // canvas `update` function — that only comes from a canvas selection. So
    // the user can adjust settings and add a new image, but not update in-place.
    setCanUpdateElement(false);
    elementUpdateRef.current = null;
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
      if (!elementUpdateRef.current || !selectedElementData) {
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
      await elementUpdateRef.current({ data: newData });
      // Keep the sidebar list in sync.
      setElementList((prev) =>
        prev.map((e) => (e.id === newData.id ? newData : e)),
      );
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

      if (canUpdateElement && elementUpdateRef.current) {
        // Update the currently selected element in-place.
        // Update the currently selected element in-place.
        const newData = buildElementData(
          selectedElementData?.id ?? "",
          selectedLayer,
          time,
          ref,
          width,
          height,
          altTextStr,
        );
        await elementUpdateRef.current({ data: newData });
        setElementList((prev) =>
          prev.map((e) => (e.id === newData.id ? newData : e)),
        );
        setSelectedElementData(newData);
      } else {
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
        setElementList((prev) => [...prev, data]);
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

        <RegionMap onRegionChange={setRegion} />

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

            <Checkbox
              checked={includeInfo}
              onChange={(_, checked) => setIncludeInfo(checked)}
              label={intl.formatMessage({
                defaultMessage: "Include satellite info & date",
                description:
                  "Checkbox to add a text label with the layer name and date beneath the image on the canvas.",
              })}
            />

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
                      disabled={isSelected}
                      onClick={() => handleSelectFromList(el)}
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
