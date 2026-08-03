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
};
const triggerElementChange = designMock.__triggerElementChange;
const mockAddElement = designMock.__mockAddElement;

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
  includeInfo: false,
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

    // The card for the selected element is highlighted in the sidebar.
    // HorizontalCard renders as a role=group div (not a <button>), so we
    // query by aria-label. When selected it gets the highlight CSS class
    // and a data-gibs-selected attribute.
    const card = result.getByLabelText(
      `Select ${addedData.layerName} (${addedData.time})`,
    );
    const wrapper = card.closest("[data-gibs-selected]");
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
});
