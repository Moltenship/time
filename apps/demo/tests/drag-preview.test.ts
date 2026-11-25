import { describe, expect, test } from "vite-plus/test";

import { readDragPreview, writeDragPreview } from "../src/drag-preview";

describe("the drag preview in the URL", () => {
  test("reads ?drag=free, and anything else as snapped", () => {
    expect(readDragPreview("?drag=free&view=week")).toBe("free");
    expect(readDragPreview("?drag=snapped")).toBe("snapped");
    expect(readDragPreview("?drag=wobbly")).toBe("snapped");
    expect(readDragPreview("")).toBe("snapped");
  });

  test("writes free drags only, and keeps the rest of the URL", () => {
    expect(writeDragPreview("https://demo.test/?view=week#top", "free")).toBe(
      "https://demo.test/?view=week&drag=free#top",
    );
    expect(writeDragPreview("https://demo.test/?drag=free&view=week", "snapped")).toBe(
      "https://demo.test/?view=week",
    );
  });
});
