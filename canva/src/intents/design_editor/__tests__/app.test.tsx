import { useFeatureSupport } from "@canva/app-hooks";
import type { ImageRef } from "@canva/asset";
import { upload } from "@canva/asset";
import {
  addElementAtCursor,
  addElementAtPoint,
  selection,
} from "@canva/design";
import type { Feature } from "@canva/platform";
import { act, fireEvent, waitFor } from "@testing-library/react";
import { App } from "../app";
import { renderInTestProvider } from "../../../utils/test_render";

jest.mock("@canva/app-hooks");

// This test demonstrates how to test code that uses functions from the Canva Apps SDK
// For more information on testing with the Canva Apps SDK, see https://www.canva.dev/docs/apps/testing/
describe("NASA GIBS App Tests", () => {
  const mockIsSupported = jest.fn();
  const mockUseFeatureSupport = jest.mocked(useFeatureSupport);
  const mockUpload = jest.mocked(upload);
  const mockAddElementAtPoint = jest.mocked(addElementAtPoint);
  const mockAddElementAtCursor = jest.mocked(addElementAtCursor);
  const mockSelectionRegisterOnChange = jest.mocked(
    selection.registerOnChange,
  );

  // A mutable ref that the test can use to simulate selection events.
  let selectionCallback:
    | ((event: { count: number; read: () => Promise<unknown> }) => void)
    | null = null;

  beforeEach(() => {
    jest.resetAllMocks();
    mockIsSupported.mockImplementation((fn: Feature) => fn === addElementAtPoint);
    mockUseFeatureSupport.mockReturnValue(mockIsSupported);
    mockAddElementAtPoint.mockResolvedValue(undefined);
    mockAddElementAtCursor.mockResolvedValue(undefined);
    mockUpload.mockResolvedValue({
      ref: "mock-image-ref" as ImageRef,
      whenUploaded: jest.fn().mockResolvedValue(undefined),
    });

    selectionCallback = null;
    mockSelectionRegisterOnChange.mockImplementation((opts) => {
      selectionCallback = opts.onChange as typeof selectionCallback;
      return () => {
        selectionCallback = null;
      };
    });
  });

  it("renders the layer browser (accordion) with the first category's layers", () => {
    const result = renderInTestProvider(<App />);

    // The accordion renders every layer card (collapsed sections keep their
    // content in the DOM with display:none, so the text is still findable).
    expect(result.getByText("VIIRS NOAA-20 True Color")).toBeTruthy();

    // No layer is selected initially, so there is no "Add to canvas" button yet.
    expect(
      result.queryByRole("button", { name: "Add to canvas" }),
    ).toBeNull();
  });

  it("reveals the date picker and add-to-canvas button after a layer is picked", () => {
    const result = renderInTestProvider(<App />);

    // Click a layer card in the accordion to select it. The card's
    // clickable button is labelled "Select <name>" via its ariaLabel.
    fireEvent.click(
      result.getByRole("button", { name: "Select VIIRS NOAA-20 True Color" }),
    );

    // The date picker and the add-to-canvas action now appear.
    expect(
      result.getByRole("button", { name: "Add to canvas" }),
    ).toBeTruthy();
    // The selected layer name is still visible.
    expect(result.getByText("VIIRS NOAA-20 True Color")).toBeTruthy();
  });

  it("uploads a GIBS snapshot and adds an image element when 'Add to canvas' is clicked", async () => {
    const result = renderInTestProvider(<App />);

    // Select a layer first (the add button only appears after a selection).
    fireEvent.click(
      result.getByRole("button", { name: "Select VIIRS NOAA-20 True Color" }),
    );

    const addButton = result.getByRole("button", { name: "Add to canvas" });
    fireEvent.click(addButton);

    // the snapshot is uploaded to Canva's media library
    await waitFor(() => expect(mockUpload).toHaveBeenCalled());
    expect(mockUpload.mock.calls[0]?.[0]?.type).toBe("image");

    // the uploaded image is placed on the canvas as an image element
    await waitFor(() => expect(mockAddElementAtPoint).toHaveBeenCalled());
    const element = mockAddElementAtPoint.mock.calls[0]?.[0];
    expect(element?.type).toBe("image");

    // the cursor-based fallback is not used when point-based add is supported
    expect(mockAddElementAtCursor).not.toHaveBeenCalled();
  });

  it("replaces a selected satellite image when a new layer is picked", async () => {
    const result = renderInTestProvider(<App />);

    // Select a layer and add it to the canvas.
    fireEvent.click(
      result.getByRole("button", { name: "Select VIIRS NOAA-20 True Color" }),
    );
    fireEvent.click(result.getByRole("button", { name: "Add to canvas" }));
    await waitFor(() => expect(mockAddElementAtPoint).toHaveBeenCalled());

    // Wait for the add to finish so isAdding is false before continuing.
    await waitFor(() => {
      expect(
        result.getByRole("button", { name: "Add to canvas" }),
      ).toBeTruthy();
    });
    mockAddElementAtPoint.mockClear();
    mockUpload.mockClear();

    // Simulate the user selecting that satellite image on the canvas.
    const mockDraft = {
      contents: [{ ref: "mock-image-ref" as ImageRef }],
      save: jest.fn().mockResolvedValue(undefined),
    };
    expect(selectionCallback).not.toBeNull();
    await act(async () => {
      selectionCallback?.({
        count: 1,
        read: jest.fn().mockResolvedValue(mockDraft),
      } as unknown as Parameters<typeof selectionCallback>[0]);
    });

    // Pick a different layer from the accordion. Because an image is
    // selected on the canvas, the app swaps it in place instead of inserting
    // a new element.
    fireEvent.click(
      result.getByRole("button", { name: "Select VIIRS SNPP True Color" }),
    );

    await waitFor(() => expect(mockUpload).toHaveBeenCalled());
    await waitFor(() => expect(mockDraft.save).toHaveBeenCalled());
    // no new element should have been added to the canvas
    expect(mockAddElementAtPoint).not.toHaveBeenCalled();
  });

  it("replaces a selected satellite image when the date is stepped", async () => {
    const result = renderInTestProvider(<App />);

    // Select a layer and add it to the canvas.
    fireEvent.click(
      result.getByRole("button", { name: "Select VIIRS NOAA-20 True Color" }),
    );
    fireEvent.click(result.getByRole("button", { name: "Add to canvas" }));
    await waitFor(() => expect(mockAddElementAtPoint).toHaveBeenCalled());

    // Wait for the add to finish.
    await waitFor(() => {
      expect(
        result.getByRole("button", { name: "Add to canvas" }),
      ).toBeTruthy();
    });
    mockAddElementAtPoint.mockClear();
    mockUpload.mockClear();

    // Simulate the user selecting that satellite image on the canvas.
    const mockDraft = {
      contents: [{ ref: "mock-image-ref" as ImageRef }],
      save: jest.fn().mockResolvedValue(undefined),
    };
    expect(selectionCallback).not.toBeNull();
    await act(async () => {
      selectionCallback?.({
        count: 1,
        read: jest.fn().mockResolvedValue(mockDraft),
      } as unknown as Parameters<typeof selectionCallback>[0]);
    });

    // Step to the previous day. Because an image is selected on the canvas,
    // the app swaps it in place instead of inserting a new element.
    fireEvent.click(result.getByRole("button", { name: "Previous day" }));

    await waitFor(() => expect(mockUpload).toHaveBeenCalled());
    await waitFor(() => expect(mockDraft.save).toHaveBeenCalled());
    expect(mockAddElementAtPoint).not.toHaveBeenCalled();
  });
});
