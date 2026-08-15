import { describe, expect, test } from "vite-plus/test";

import { CalendarRafAutoScroller, type AnimationFrameScheduler } from "../src/auto-scroll";
import type { CalendarEventPlacement } from "../src/contracts";
import { CalendarViewRegionGeometry } from "../src/geometry";
import { CalendarSemanticDragSession } from "../src/semantic-session";

const definition = {
  startMinute: 0,
  endMinute: 1_440,
  snapMinutes: 30,
  resources: ["alpha", "beta", "gamma"],
} as const;

const rectangle = { left: 0, top: 0, width: 300, height: 1_440 };
const original: CalendarEventPlacement<"alpha" | "beta" | "gamma"> = {
  startMinute: 60,
  endMinute: 120,
  resourceId: "alpha",
};

describe("calendar-owned geometry", () => {
  test("pointer and keyboard movement produce equivalent semantic placement", () => {
    const geometry = new CalendarViewRegionGeometry(definition, rectangle);
    const pointer = geometry.placementFromPointer(original, { x: 50, y: 60 }, { x: 50, y: 90 });
    const keyboard = geometry.placementFromKeyboard(original, "ArrowDown");

    expect(pointer).toEqual(keyboard);
    expect(pointer).toEqual({ startMinute: 90, endMinute: 150, resourceId: "alpha" });
  });

  test("one region surface maps horizontal position to a pre-indexed resource", () => {
    const geometry = new CalendarViewRegionGeometry(definition, rectangle);

    expect(geometry.placementFromPointer(original, { x: 50, y: 60 }, { x: 150, y: 60 })).toEqual({
      startMinute: 60,
      endMinute: 120,
      resourceId: "beta",
    });
  });
});

test("requestAnimationFrame auto-scroll performs one geometry read for a pointer burst", () => {
  let scheduled: FrameRequestCallback | null = null;
  let requests = 0;
  let reads = 0;
  const scrolls: ScrollToOptions[] = [];
  const scheduler: AnimationFrameScheduler = {
    request(callback) {
      requests += 1;
      scheduled = callback;
      return requests;
    },
    cancel() {
      scheduled = null;
    },
  };
  const surface = document.createElement("div");
  surface.getBoundingClientRect = () => {
    reads += 1;
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 300,
      bottom: 600,
      width: 300,
      height: 600,
      toJSON: () => ({}),
    };
  };
  surface.scrollBy = (optionsOrX?: ScrollToOptions | number, y?: number) => {
    scrolls.push(
      typeof optionsOrX === "object" ? optionsOrX : { left: optionsOrX ?? 0, top: y ?? 0 },
    );
  };
  const scroller = new CalendarRafAutoScroller(
    () => surface,
    { edgeThreshold: 50, maximumPixelsPerFrame: 20 },
    scheduler,
  );

  for (let move = 0; move < 100; move += 1) {
    scroller.update({ x: 150, y: 590 + move / 100 });
  }

  expect(requests).toBe(1);
  expect(reads).toBe(0);
  const frame = scheduled as FrameRequestCallback | null;
  expect(frame).not.toBeNull();
  frame?.(16);
  expect(reads).toBe(1);
  expect(scrolls).toHaveLength(1);
  expect(scrolls[0]?.top).toBeGreaterThan(0);
  expect(requests).toBe(2);
  scroller.cancel();
  expect(scheduled).toBeNull();
});

test("session snapshots survive source reparenting and cancellation emits nothing", () => {
  const geometry = new CalendarViewRegionGeometry(definition, rectangle);
  const session = new CalendarSemanticDragSession<{ readonly revision: number }, string>(
    () => geometry,
  );
  const source = {
    eventId: "event-1",
    title: "Planning",
    event: { revision: 1 },
    placement: { startMinute: 60, endMinute: 120, resourceId: "alpha" },
    sourceView: "week",
  };

  session.start(source, "pointer", { x: 50, y: 60 });
  session.movePointer({ x: 50, y: 90 });
  expect(session.finish()?.proposed).toEqual({
    startMinute: 90,
    endMinute: 150,
    resourceId: "alpha",
  });

  session.start(source, "pointer", { x: 50, y: 60 });
  session.movePointer({ x: 50, y: 90 });
  session.cancel();
  expect(session.finish()).toBeNull();
});
