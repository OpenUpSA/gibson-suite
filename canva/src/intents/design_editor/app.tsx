import { useFeatureSupport } from "@canva/app-hooks";
import { upload } from "@canva/asset";
import {
  Alert,
  Button,
  Rows,
  Text,
  Title,
} from "@canva/app-ui-kit";
import {
  addElementAtCursor,
  addElementAtPoint,
  selection,
  type SelectionEvent,
} from "@canva/design";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import * as styles from "styles/components.css";
import { DatePicker } from "./components/DatePicker";
import { LayerBrowser } from "./components/LayerBrowser";
import { ALL_LAYERS, LAYER_CATEGORIES, type GibsLayer } from "./config/layers";
import {
  getLayerEarliestDateObj,
  getLayerLatestDateObj,
  isStaticLayer,
} from "./utils/availability";
import {
  buildSnapshotUrl,
  dateObjToString,
  daysAgo,
  type DateObj,
} from "./utils/gibs";

// Fallback date range for static layers (no time dimension).
const MIN_DATE: DateObj = { year: 2010, month: 1, day: 1 };

// Size of the snapshot uploaded to Canva (full globe, 2:1 aspect ratio).
const UPLOAD_WIDTH = 2048;
const UPLOAD_HEIGHT = 1024;

// Size of the in-panel preview thumbnail.
const PREVIEW_WIDTH = 512;
const PREVIEW_HEIGHT = 256;

export const App = () => {
  const isSupported = useFeatureSupport();
  const intl = useIntl();

  const canAddAtPoint = isSupported(addElementAtPoint);
  const canAddAtCursor = isSupported(addElementAtCursor);
  const canAdd = canAddAtPoint || canAddAtCursor;

  // No layer is selected until the user picks one from the accordion browser.
  const [selectedLayer, setSelectedLayer] = useState<GibsLayer | undefined>(
    undefined,
  );

  // The selected imagery date. Reset to the layer's latest date whenever a
  // new layer is chosen (see `handleSelectLayer`).
  const [selectedDate, setSelectedDate] = useState<DateObj>(daysAgo(3));

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
    if (
      !isStaticLayer(layer.id) &&
      !isAdding &&
      imageSelectionRef.current &&
      imageSelectionRef.current.count > 0
    ) {
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

  const staticLayer = selectedLayer
    ? isStaticLayer(selectedLayer.id)
    : false;

  const [isAdding, setIsAdding] = useState(false);
  const [hasError, setHasError] = useState(false);

  // ── Selection tracking ────────────────────────────────────────────────
  // Track whether the user has an image element selected on the canvas. When an
  // image is selected, changing the layer or date replaces its content in-place
  // instead of inserting a new element.
  const imageSelectionRef = useRef<SelectionEvent<"image"> | null>(null);
  const [hasImageSelection, setHasImageSelection] = useState(false);

  useEffect(() => {
    const unregister = selection.registerOnChange({
      scope: "image",
      onChange: (event) => {
        imageSelectionRef.current = event;
        setHasImageSelection(event.count > 0);
      },
    });
    return unregister;
  }, []);

  const time = dateObjToString(selectedDate);

  const uploadSnapshot = useCallback(
    async (layer: GibsLayer, dateStr: string) => {
      const asset = await upload({
        type: "image",
        url: buildSnapshotUrl(layer, dateStr, UPLOAD_WIDTH, UPLOAD_HEIGHT),
        mimeType: layer.format,
        thumbnailUrl: buildSnapshotUrl(
          layer,
          dateStr,
          PREVIEW_WIDTH,
          PREVIEW_HEIGHT,
        ),
        // GIBS imagery is satellite photography, not AI-generated content.
        aiDisclosure: "none",
        name: `${layer.name} (${dateStr})`,
        width: UPLOAD_WIDTH,
        height: UPLOAD_HEIGHT,
      });
      await asset.whenUploaded();
      return asset.ref;
    },
    [],
  );

  /**
   * Replaces the image inside the currently selected element with a fresh
   * snapshot for the given date. Returns `true` on success, `false` if there
   * was no suitable selection to replace.
   */
  const replaceSelectedImage = useCallback(
    async (layer: GibsLayer, dateStr: string) => {
      const event = imageSelectionRef.current;
      if (!event || event.count === 0) {
        return false;
      }
      const ref = await uploadSnapshot(layer, dateStr);
      const draft = await event.read();
      for (const content of draft.contents) {
        content.ref = ref;
      }
      await draft.save();
      return true;
    },
    [uploadSnapshot],
  );

  // ── "Add to canvas" — inserts a new image element ─────────────────────
  const handleAddToCanvas = async () => {
    if (!selectedLayer || !canAdd) {
      return;
    }
    setIsAdding(true);
    setHasError(false);
    try {
      const ref = await uploadSnapshot(selectedLayer, time);

      const altText = {
        text: intl.formatMessage(
          {
            defaultMessage: "{name} — NASA GIBS satellite imagery, {date}",
            description:
              "Alt text for a GIBS satellite image added to the canvas.",
          },
          { name: selectedLayer.name, date: time },
        ),
        decorative: false,
      };

      if (canAddAtPoint) {
        await addElementAtPoint({
          type: "image",
          ref,
          altText,
          top: 100,
          left: 100,
          width: 600,
          height: 300,
        });
      } else {
        await addElementAtCursor({
          type: "image",
          ref,
          altText,
        });
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

    // Only replace if the user has an image selected on the canvas.
    if (!hasImageSelection) {
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

  const addDisabled = isAdding || !canAdd || !selectedLayer;

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
              {hasImageSelection && (
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
              onClick={handleAddToCanvas}
              disabled={addDisabled}
              tooltipLabel={
                !canAdd
                  ? intl.formatMessage({
                      defaultMessage:
                        "This feature is not supported in the current page",
                      description:
                        "Tooltip label for when a feature is not supported in the current design.",
                    })
                  : undefined
              }
              stretch
            >
              {isAdding
                ? intl.formatMessage({
                    defaultMessage: "Adding…",
                    description:
                      "Button label shown while a layer is being added to the canvas.",
                  })
                : intl.formatMessage({
                    defaultMessage: "Add to canvas",
                    description:
                      "Button label to add the selected layer as a new element on the canvas.",
                  })}
            </Button>

            {!canAdd && (
              <Text size="small" tone="tertiary">
                <FormattedMessage
                  defaultMessage="Adding elements isn't supported on this page. Open a design to use this app."
                  description="Explains that the app can't add elements on the current page."
                />
              </Text>
            )}
          </>
        )}
      </Rows>
    </div>
  );
};
