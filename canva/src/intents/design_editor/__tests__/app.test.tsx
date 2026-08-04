import { upload } from "@canva/asset";
import type { ImageRef } from "@canva/asset";
import { initAppElement } from "@canva/design";
import { act, fireEvent, waitFor } from "@testing-library/react";
import { App } from "../app";
import { renderInTestProvider } from "../../../utils/test_render";
import * as styles from "styles/components.css";

// Access the mock helpers injected by jest.setup.ts via the mocked module.
const designMock = jest.requireMock("@canva/design") as {
  __triggerElementChange: (el: unknown) => void;
  __mockAddElement: jest.Mock;
  __mockAddOrUpdateElement: jest.Mock;
};
const triggerElementChange = designMock.__triggerElementChange;
const mockAddElement = designMock.__mockAddElement;
const mockAddOrUpdateElement = designMock.__mockAddOrUpdateElement;

const mockInitAppElement = jest.mocked(initAppElement);
const mockUpload = jest.mocked(upload);

// Minimal element data that satisfies GibsElementData for tests.
const makeElementData = (overrides: Record<string, unknown> = {}) => ({
  id: "gibs-test-1",
  layerId: "VIIRS_NOAA20_CorrectedReflectance_TrueColor",
  layerName: "VIIRS NOAA-20 True Color",
  time: "2024-01-01",
  resolution: "high",
  mimeType: "image/jpeg",
  ref: "mock-image-ref",
  imgWidth: 8192,
  imgHeight: 4096,
  altText: "test alt",
  fullGlobe: true,
  minLat: -90,
  minLon: -180,
  maxLat: 90,
  maxLon: 180,
  ...overrides,
});

describe("NASA GIBS App Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInitAppElement.mockReturnValue({
      addElement: mockAddElement,
      addOrUpdateElement: jest.fn().mockResolvedValue(undefined),
      registerOnElementChange: jest.fn((handler) => {
        triggerElementChange(handler);
      }),
    });
    mockAddElement.mockResolvedValue(undefined);
    mockUpload.mockResolvedValue({
      ref: "mock-image-ref" as ImageRef,
      whenUploaded: jest.fn().mockResolvedValue(undefined),
    });
  });

  it("renders the layer browser (accordion) with the first category's layers", () => {
    const result = renderInTestProvider(<App />);

    expect(result.getByText("VIIRS NOAA-20 True Color")).toBeTruthy();
    expect(result.queryByRole("button", { name: "Add to canvas" })).toBeNull();
  });

  it("reveals the date picker and add-to-canvas button after a layer is picked", () => {
    const result = renderInTestProvider(<App />);

    fireEvent.click(
      result.getByRole("button", { name: "Select VIIRS NOAA-20 True Color" }),
    );

    expect(result.getByRole("button", { name: "Add to canvas" })).toBeTruthy();
    expect(result.getByText("VIIRS NOAA-20 True Color")).toBeTruthy();
  });

  it("uploads a GIBS snapshot and adds an app element when 'Add to canvas' is clicked", async () => {
    const result = renderInTestProvider(<App />);

    fireEvent.click(
      result.getByRole("button", { name: "Select VIIRS NOAA-20 True Color" }),
    );
    fireEvent.click(result.getByRole("button", { name: "Add to canvas" }));

    await waitFor(() => expect(mockUpload).toHaveBeenCalled());
    expect(mockUpload.mock.calls[0]?.[0]?.type).toBe("image");

    await waitFor(() => expect(mockAddElement).toHaveBeenCalled());
    const opts = mockAddElement.mock.calls[0]?.[0];
    expect(opts?.data?.layerId).toBe(
      "VIIRS_NOAA20_CorrectedReflectance_TrueColor",
    );
    expect(opts?.data?.ref).toBe("mock-image-ref");
    expect(opts?.placement?.width).toBeGreaterThan(0);
  });

  it("shows 'Update layer' button when an element is selected", async () => {
    const result = renderInTestProvider(<App />);

    fireEvent.click(
      result.getByRole("button", { name: "Select VIIRS NOAA-20 True Color" }),
    );
    fireEvent.click(result.getByRole("button", { name: "Add to canvas" }));
    await waitFor(() => expect(mockAddElement).toHaveBeenCalled());

    const updateFn = jest.fn().mockResolvedValue(undefined);
    await act(async () => {
      triggerElementChange({
        data: makeElementData(),
        version: 1,
        update: updateFn,
      });
    });

    expect(result.getByRole("button", { name: "Update layer" })).toBeTruthy();
  });

  it("removes an image from the list when 'Remove' is clicked", async () => {
    const result = renderInTestProvider(<App />);

    fireEvent.click(
      result.getByRole("button", { name: "Select VIIRS NOAA-20 True Color" }),
    );
    fireEvent.click(result.getByRole("button", { name: "Add to canvas" }));
    await waitFor(() => expect(mockAddElement).toHaveBeenCalled());

    // The "Images on canvas" section appears after adding.
    expect(result.getByText("Images on canvas")).toBeTruthy();

    // Click the "Remove" button for that image.
    const removeButton = result.getByRole("button", {
      name: /Remove .* from list/,
    });
    fireEvent.click(removeButton);

    // The section should be gone since the list is now empty.
    expect(result.queryByText("Images on canvas")).toBeNull();
  });

  it("highlights the selected image in the sidebar list", async () => {
    const result = renderInTestProvider(<App />);

    fireEvent.click(
      result.getByRole("button", { name: "Select VIIRS NOAA-20 True Color" }),
    );
    fireEvent.click(result.getByRole("button", { name: "Add to canvas" }));
    await waitFor(() => expect(mockAddElement).toHaveBeenCalled());

    // Get the actual data that was added so we can simulate selecting it.
    const addedData = mockAddElement.mock.calls[0]?.[0]?.data;
    const updateFn = jest.fn().mockResolvedValue(undefined);
    await act(async () => {
      triggerElementChange({
        data: addedData,
        version: 1,
        update: updateFn,
      });
    });

    // The card for the selected element is highlighted in the
    // sidebar. The wrapper has the `data-gibs-selected` attribute
    // and a `elementListItemSelected` class.
    const wrapper = result.container.querySelector(
      "[data-gibs-selected]",
    ) as HTMLElement | null;
    expect(wrapper).not.toBeNull();
    expect(wrapper?.getAttribute("data-gibs-selected")).toBe("true");
    expect(wrapper?.className).toContain(styles.elementListItemSelected);
  });

  it("replaces a selected satellite image when a new layer is picked", async () => {
    const result = renderInTestProvider(<App />);

    fireEvent.click(
      result.getByRole("button", { name: "Select VIIRS NOAA-20 True Color" }),
    );
    fireEvent.click(result.getByRole("button", { name: "Add to canvas" }));
    await waitFor(() => expect(mockAddElement).toHaveBeenCalled());

    const updateFn = jest.fn().mockResolvedValue(undefined);
    mockUpload.mockClear();
    mockAddElement.mockClear();

    await act(async () => {
      triggerElementChange({
        data: makeElementData(),
        version: 1,
        update: updateFn,
      });
    });

    fireEvent.click(
      result.getByRole("button", { name: "Select VIIRS SNPP True Color" }),
    );

    await waitFor(() => expect(mockUpload).toHaveBeenCalled());
    await waitFor(() => expect(updateFn).toHaveBeenCalled());
    expect(mockAddElement).not.toHaveBeenCalled();
  });

  it("replaces a selected satellite image when the date is stepped", async () => {
    const result = renderInTestProvider(<App />);

    fireEvent.click(
      result.getByRole("button", { name: "Select VIIRS NOAA-20 True Color" }),
    );
    fireEvent.click(result.getByRole("button", { name: "Add to canvas" }));
    await waitFor(() => expect(mockAddElement).toHaveBeenCalled());

    const updateFn = jest.fn().mockResolvedValue(undefined);
    mockUpload.mockClear();
    mockAddElement.mockClear();

    await act(async () => {
      triggerElementChange({
        data: makeElementData(),
        version: 1,
        update: updateFn,
      });
    });

    fireEvent.click(result.getByRole("button", { name: "Previous day" }));

    await waitFor(() => expect(mockUpload).toHaveBeenCalled());
    await waitFor(() => expect(updateFn).toHaveBeenCalled());
    expect(mockAddElement).not.toHaveBeenCalled();
  });

  it("clicking a sidebar row re-anchors the element on the canvas via the update function", async () => {
    const result = renderInTestProvider(<App />);

    fireEvent.click(
      result.getByRole("button", { name: "Select VIIRS NOAA-20 True Color" }),
    );
    fireEvent.click(result.getByRole("button", { name: "Add to canvas" }));
    await waitFor(() => expect(mockAddElement).toHaveBeenCalled());

    // The App uses the default date (`daysAgo(3)`) so the row's
    // `time` is dynamic. Read the data the App just uploaded to
    // build the correct aria-label.
    const addedData = (
      mockAddElement.mock.calls[0]?.[0] as
        | { data: { layerName: string; time: string; id: string } }
        | undefined
    )?.data;
    if (!addedData) {
      throw new Error("expected the App to have uploaded a snapshot");
    }

    // Capture the per-element `update` function delivered by the
    // SDK so we can verify the App invokes it on sidebar click.
    const updateFn = jest.fn().mockResolvedValue(undefined);
    await act(async () => {
      triggerElementChange({
        data: addedData,
        version: 1,
        update: updateFn,
      });
    });
    // The previous "select then deselect" implementation would have
    // wiped the per-element update; verify we still have it now.
    expect(updateFn).not.toHaveBeenCalled();

    // Wait for the sidebar row to render, then click it. The
    // `HorizontalCard` is a `role="group"` wrapper around an inner
    // `role="button"` div. The `onClick` handler is attached to the
    // inner button, so we click that one.
    const sidebarCard = await waitFor(() => {
      const buttons = result.container.querySelectorAll(
        '[data-gibs-selected] [role="button"][aria-label]',
      );
      if (buttons.length === 0) throw new Error("no sidebar row");
      return buttons[0] as HTMLElement;
    });
    // Snapshot the previous mock-call counts so we can tell if the
    // click actually invoked `handleSelectFromList` (which would
    // eventually call `updateFn` or `addOrUpdateElement`).
    const updateCallsBefore = updateFn.mock.calls.length;
    const addOrUpdateCallsBefore = mockAddOrUpdateElement.mock.calls.length;
    fireEvent.click(sidebarCard);
    // Drain microtasks so the async handler resolves.
    await act(async () => {
      await Promise.resolve();
    });
    // The App should call the per-element `update` function (NOT
    // `addOrUpdateElement`, which would create a duplicate).
    if (
      updateFn.mock.calls.length === updateCallsBefore &&
      mockAddOrUpdateElement.mock.calls.length === addOrUpdateCallsBefore
    ) {
      throw new Error(
        `click did not invoke handleSelectFromList (updateFn=${updateFn.mock.calls.length}, addOrUpdate=${mockAddOrUpdateElement.mock.calls.length})`,
      );
    }
    expect(updateFn).toHaveBeenCalled();
    expect(mockAddOrUpdateElement).not.toHaveBeenCalled();
    const dataArg = updateFn.mock.calls[0]?.[0] as
      | { data: { id: string } }
      | undefined;
    expect(dataArg?.data.id).toBe(addedData.id);
  });

  it("adds pre-existing elements to the sidebar when the user selects them on the canvas", async () => {
    // Simulate a session where the user has 4 old images on the
    // canvas from a previous session. The list starts empty. When
    // the user clicks one of the old images, the App should add it
    // to the list.
    const result = renderInTestProvider(<App />);
    // No "Add to canvas" — we want to verify pre-existing elements
    // show up after the user clicks them.
    expect(result.queryByText("Images on canvas")).toBeNull();

    // The App's panel labels need a layer to be selected to show
    // the rest of the controls, but the sidebar list is independent
    // of that. We trigger the canvas-selection callback directly.
    const oldImageData = {
      ...makeElementData({ id: "old-1", layerName: "Old Layer 1" }),
    };
    const updateFn = jest.fn().mockResolvedValue(undefined);
    await act(async () => {
      triggerElementChange({
        data: oldImageData,
        version: 1,
        update: updateFn,
      });
    });

    // The old image should now be in the sidebar list.
    expect(result.getByText("Images on canvas")).toBeTruthy();
    // The sidebar row uses a `HorizontalCard` with an aria-label of
    // "Select Old Layer 1 (2024-01-01)".
    expect(
      result.getAllByLabelText("Select Old Layer 1 (2024-01-01)").length,
    ).toBeGreaterThan(0);
  });

  it("does not duplicate elements when the user deselects them on the canvas", async () => {
    // Regression test: the previous implementation called
    // `addOrUpdateElement` on every `onElementChange(undefined)`,
    // which created a brand-new canvas element every time the user
    // clicked in empty space. We verify the fix: the SDK is NOT
    // called when the user deselects.
    const result = renderInTestProvider(<App />);

    fireEvent.click(
      result.getByRole("button", { name: "Select VIIRS NOAA-20 True Color" }),
    );
    fireEvent.click(result.getByRole("button", { name: "Add to canvas" }));
    await waitFor(() => expect(mockAddElement).toHaveBeenCalled());
    mockAddOrUpdateElement.mockClear();

    // Simulate the user selecting the element on the canvas, then
    // clicking empty space. The previous implementation would call
    // `addOrUpdateElement` here and create a duplicate.
    const addedData = mockAddElement.mock.calls[0]?.[0]?.data;
    const updateFn = jest.fn().mockResolvedValue(undefined);
    await act(async () => {
      triggerElementChange({
        data: addedData,
        version: 1,
        update: updateFn,
      });
    });
    await act(async () => {
      triggerElementChange(undefined);
    });

    // No `addOrUpdateElement` calls were made — the user is free to
    // click around without spamming the canvas with duplicates.
    expect(mockAddOrUpdateElement).not.toHaveBeenCalled();
    // The list still has the one entry.
    expect(result.getByText("Images on canvas")).toBeTruthy();
  });

  it("shows the added element exactly once when the SDK echoes the element during addElement", async () => {
    // Regression test for a duplicate sidebar row. When the user
    // clicks "Add to canvas", the real SDK fires
    // `onElementChange(element)` while `addElement` is still in
    // flight, and the App appends to the list in BOTH the callback
    // and the add path. `upsertElement` dedupes by id so the row is
    // rendered once.
    const result = renderInTestProvider(<App />);

    fireEvent.click(
      result.getByRole("button", { name: "Select VIIRS NOAA-20 True Color" }),
    );

    // Make the mock fire `onElementChange` with the same data it
    // was given, just like the real SDK does when it creates the
    // element. This happens BEFORE the add path's own list append.
    mockAddElement.mockImplementationOnce((opts: { data: unknown }) => {
      triggerElementChange({
        data: opts.data,
        version: 1,
        update: jest.fn().mockResolvedValue(undefined),
      });
      return Promise.resolve();
    });

    fireEvent.click(result.getByRole("button", { name: "Add to canvas" }));
    await waitFor(() => expect(mockAddElement).toHaveBeenCalled());

    // Wait for the element list to render.
    await waitFor(() =>
      expect(result.getByText("Images on canvas")).toBeTruthy(),
    );

    // There should be exactly ONE sidebar row. (The HorizontalCard
    // renders both an outer wrapper and an inner element with the
    // same aria-label, so counting aria-labels would give 2 per row;
    // we count the `data-gibs-selected` wrappers instead.)
    const rows = result.container.querySelectorAll("[data-gibs-selected]");
    expect(rows.length).toBe(1);
  });
});
