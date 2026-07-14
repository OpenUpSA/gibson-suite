import { type useFeatureSupport } from "@canva/app-hooks";
import { upload, type ImageRef } from "@canva/asset";
import {
  Alert,
  Button,
  Rows,
  Select,
  Text,
  Title,
} from "@canva/app-ui-kit";
import { initAppElement, type AppElementClient } from "@canva/design";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import * as styles from "styles/components.css";
import { DatePicker } from "./DatePicker";
import { ALL_LAYERS, LAYER_CATEGORIES, type GibsLayer } from "../config/layers";
import {
  getLayerEarliestDateObj,
  getLayerLatestDateObj,
  isStaticLayer,
} from "../utils/availability";
import {
  buildSnapshotUrl,
  dateObjToString,
  daysAgo,
  type DateObj,
} from "../utils/gibs";

const MIN_DATE: DateObj = { year: 2010, month: 1, day: 1 };

const PREVIEW_WIDTH = 512;
const PREVIEW_HEIGHT = 256;

const UPLOAD_WIDTH = 2048;
const UPLOAD_HEIGHT = 1024;

// Each image half is 300px wide; the group is 600x300.
const HALF_WIDTH = 300;
const GROUP_WIDTH = 600;
const GROUP_HEIGHT = 300;

type PaneState = {
  layer: GibsLayer;
  date: DateObj;
};

type ComparePanelProps = {
  /** Feature support check from the host. */
  isSupported: ReturnType<typeof useFeatureSupport>;
};

/**
 * The data persisted inside the app element on the canvas. It stores the two
 * uploaded image refs (so we can re-render the group) plus the layer/date
 * metadata for display. When the user changes a layer or date we upload a fresh
 * snapshot and call `element.update()` to swap the ref in-place — the same
 * select-and-swap pattern as the single-layer flow.
 */
type CompareElementData = {
  ref1: string;
  ref2: string;
  layerId1: string;
  layerId2: string;
  date1: string;
  date2: string;
};

// The AppElement client is created once at module scope. Its `render` function
// turns the stored data into a group of two side-by-side image elements on the
// canvas. The refs are opaque strings on the data side; we cast them to
// `ImageRef` (a branded string) when building the elements.
const compareElement = initAppElement<CompareElementData>({
  render: (data) => [
    {
      type: "image",
      ref: data.ref1 as ImageRef,
      altText: {
        text: `${data.layerId1} (${data.date1})`,
        decorative: false,
      },
      top: 0,
      left: 0,
      width: HALF_WIDTH,
      height: GROUP_HEIGHT,
    },
    {
      type: "image",
      ref: data.ref2 as ImageRef,
      altText: {
        text: `${data.layerId2} (${data.date2})`,
        decorative: false,
      },
      top: 0,
      left: HALF_WIDTH,
      width: HALF_WIDTH,
      height: GROUP_HEIGHT,
    },
  ],
});

/**
 * A "comparison" panel that lets the user pick two GIBS layer+date combinations
 * and add them to the canvas as a single interactive side-by-side element.
 *
 * The element is created via the AppElement API, which renders a group of two
 * images on the canvas. Selecting the element on the canvas and then changing
 * either layer or date uploads a fresh snapshot and updates the element's data
 * in-place — the same swap-in-place behavior as the single-layer panel.
 */
export const ComparePanel = ({ isSupported }: ComparePanelProps) => {
  const intl = useIntl();

  const canAddAtPoint = isSupported(initAppElement);
  const canAdd = canAddAtPoint;

  const firstLayer = ALL_LAYERS[0] ?? ALL_LAYERS[1];
  const [pane1, setPane1] = useState<PaneState>(() => ({
    layer: firstLayer as GibsLayer,
    date: getLayerLatestDateObj(firstLayer?.id ?? "") ?? daysAgo(3),
  }));
  const [pane2, setPane2] = useState<PaneState>(() => {
    const second =
      ALL_LAYERS.find(
        (l) => l.id === "MODIS_Terra_CorrectedReflectance_TrueColor",
      ) ?? ALL_LAYERS[1] ?? firstLayer;
    return {
      layer: second as GibsLayer,
      date: getLayerLatestDateObj(second?.id ?? "") ?? daysAgo(3),
    };
  });

  const [isAdding, setIsAdding] = useState(false);
  const [hasError, setHasError] = useState(false);

  // ── App element selection tracking ────────────────────────────────────
  // When the user selects the comparison app element on the canvas, we capture
  // a handle to it so that changing a layer/date can call `element.update()`
  // to swap that half in-place instead of inserting a new element.
  const elementRef = useRef<AppElementClient<CompareElementData> | null>(
    compareElement,
  );
  const [selectedData, setSelectedData] = useState<CompareElementData | null>(
    null,
  );
  // The most recent change event, kept in a ref so async handlers can call
  // `element.update()` after a fresh upload completes.
  const selectionEventRef = useRef<
    | {
        data: CompareElementData;
        update: (opts: {
          data: CompareElementData;
        }) => Promise<void>;
      }
    | null
  >(null);

  useEffect(() => {
    const unregister = elementRef.current?.registerOnElementChange(
      (element) => {
        if (element) {
          selectionEventRef.current = {
            data: element.data,
            update: element.update,
          };
          setSelectedData(element.data);
        } else {
          selectionEventRef.current = null;
          setSelectedData(null);
        }
      },
    );
    return unregister;
  }, []);

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

  // ── Add a new comparison element to the canvas ────────────────────────
  const handleAddToCanvas = async () => {
    if (!canAdd) {
      return;
    }
    setIsAdding(true);
    setHasError(false);
    try {
      const date1 = dateObjToString(pane1.date);
      const date2 = dateObjToString(pane2.date);

      const [ref1, ref2] = await Promise.all([
        uploadSnapshot(pane1.layer, date1),
        uploadSnapshot(pane2.layer, date2),
      ]);

      await elementRef.current?.addElement({
        data: {
          ref1: ref1 as string,
          ref2: ref2 as string,
          layerId1: pane1.layer.id,
          layerId2: pane2.layer.id,
          date1,
          date2,
        },
        placement: {
          top: 100,
          left: 100,
          width: GROUP_WIDTH,
          height: GROUP_HEIGHT,
          rotation: 0,
        },
      });
    } catch {
      setHasError(true);
    } finally {
      setIsAdding(false);
    }
  };

  // ── Update one image half of the selected element in-place ────────────
  const updatePaneOnCanvas = useCallback(
    async (which: 1 | 2, layer: GibsLayer, dateStr: string) => {
      const event = selectionEventRef.current;
      if (!event) {
        return;
      }
      const ref = await uploadSnapshot(layer, dateStr);
      const next: CompareElementData = { ...event.data };
      if (which === 1) {
        next.ref1 = ref as string;
        next.layerId1 = layer.id;
        next.date1 = dateStr;
      } else {
        next.ref2 = ref as string;
        next.layerId2 = layer.id;
        next.date2 = dateStr;
      }
      await event.update({ data: next });
    },
    [uploadSnapshot],
  );

  const handlePaneLayerChange = (which: 1 | 2, layerId: string) => {
    const next = ALL_LAYERS.find((l) => l.id === layerId);
    if (!next) {
      return;
    }
    const latest = getLayerLatestDateObj(layerId);
    const newDate = latest ?? (which === 1 ? pane1.date : pane2.date);
    const newPane = { layer: next, date: newDate };
    if (which === 1) {
      setPane1(newPane);
    } else {
      setPane2(newPane);
    }
    if (selectedData && !isAdding) {
      setIsAdding(true);
      setHasError(false);
      updatePaneOnCanvas(which, next, dateObjToString(newDate)).catch(() => {
        setHasError(true);
      }).finally(() => {
        setIsAdding(false);
      });
    }
  };

  const handlePaneDateChange = (which: 1 | 2, newDate: DateObj) => {
    const layer = which === 1 ? pane1.layer : pane2.layer;
    if (which === 1) {
      setPane1((prev) => ({ ...prev, date: newDate }));
    } else {
      setPane2((prev) => ({ ...prev, date: newDate }));
    }
    if (selectedData && !isStaticLayer(layer.id) && !isAdding) {
      setIsAdding(true);
      setHasError(false);
      updatePaneOnCanvas(which, layer, dateObjToString(newDate)).catch(() => {
        setHasError(true);
      }).finally(() => {
        setIsAdding(false);
      });
    }
  };

  const addDisabled = isAdding || !canAdd;

  // When the element is selected, show which images are currently on it.
  const selectedPane1Layer = selectedData
    ? ALL_LAYERS.find((l) => l.id === selectedData.layerId1)
    : undefined;
  const selectedPane2Layer = selectedData
    ? ALL_LAYERS.find((l) => l.id === selectedData.layerId2)
    : undefined;

  return (
    <Rows spacing="2u">
      <Title size="small">
        <FormattedMessage
          defaultMessage="Compare layers"
          description="Title of the compare/comparison panel."
        />
      </Title>

      <Text size="small" tone="tertiary">
        <FormattedMessage
          defaultMessage="Pick two layers and dates, then add a side-by-side comparison element to your design. Select the element on the canvas and change a layer or date to swap that half in place."
          description="Helper text for the compare panel."
        />
      </Text>

      {selectedData && (
        <Alert tone="info">
          <FormattedMessage
            defaultMessage="Comparison element selected — changing a layer or date updates it on the canvas."
            description="Alert shown when the comparison app element is selected."
          />
        </Alert>
      )}

      <ComparePaneSelector
        paneNumber={1}
        state={pane1}
        selectedLayerName={selectedPane1Layer?.name}
        onChange={(layerId) => handlePaneLayerChange(1, layerId)}
        onDateChange={(d) => handlePaneDateChange(1, d)}
      />
      <ComparePaneSelector
        paneNumber={2}
        state={pane2}
        selectedLayerName={selectedPane2Layer?.name}
        onChange={(layerId) => handlePaneLayerChange(2, layerId)}
        onDateChange={(d) => handlePaneDateChange(2, d)}
      />

      {hasError && (
        <Alert tone="critical">
          <FormattedMessage
            defaultMessage="Couldn't update the comparison. The image may not be available for the selected date — try a different date."
            description="Error shown when a comparison image could not be added or updated."
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
                "Button label shown while the comparison element is being added to the canvas.",
            })
          : intl.formatMessage({
              defaultMessage: "Add comparison to canvas",
              description:
                "Button label to add the side-by-side comparison element to the canvas.",
            })}
      </Button>
    </Rows>
  );
};

// ── Per-pane selector ──────────────────────────────────────────────────────

type ComparePaneSelectorProps = {
  paneNumber: 1 | 2;
  state: PaneState;
  /** Layer name currently on the selected canvas element (if any). */
  selectedLayerName?: string;
  /** Called with a new layer ID. */
  onChange: (layerId: string) => void;
  /** Called with a new date. */
  onDateChange: (date: DateObj) => void;
};

const ComparePaneSelector = ({
  paneNumber,
  state,
  selectedLayerName,
  onChange,
  onDateChange,
}: ComparePaneSelectorProps) => {
  const { layer, date } = state;

  const minDate = useMemo(
    () => getLayerEarliestDateObj(layer.id) ?? MIN_DATE,
    [layer.id],
  );
  const maxDate = useMemo(
    () => getLayerLatestDateObj(layer.id) ?? daysAgo(1),
    [layer.id],
  );
  const staticLayer = isStaticLayer(layer.id);

  return (
    <div className={styles.datePickerRow}>
      <Text size="small" variant="bold">
        {paneNumber === 1 ? (
          <FormattedMessage
            defaultMessage="Image 1"
            description="Label for the first image in the comparison panel."
          />
        ) : (
          <FormattedMessage
            defaultMessage="Image 2"
            description="Label for the second image in the comparison panel."
          />
        )}
      </Text>
      <Select
        type="single"
        searchable
        options={LAYER_CATEGORIES.map((cat) => ({
          label: cat.name,
          options: cat.layers.map((l) => ({
            value: l.id,
            label: l.name,
          })),
        }))}
        value={layer.id}
        onChange={onChange}
      />
      {staticLayer && (
        <Text size="small" tone="tertiary">
          <FormattedMessage
            defaultMessage="Static layer — date has no effect."
            description="Note for a static layer in the compare panel."
          />
        </Text>
      )}
      {selectedLayerName && selectedLayerName !== layer.name && (
        <Text size="small" tone="tertiary">
          <FormattedMessage
            defaultMessage="On canvas: {name}"
            description="Shows which layer is currently on the selected canvas element."
            values={{ name: selectedLayerName }}
          />
        </Text>
      )}
      <DatePicker
        value={date}
        min={minDate}
        max={maxDate}
        onChange={onDateChange}
      />
    </div>
  );
};
