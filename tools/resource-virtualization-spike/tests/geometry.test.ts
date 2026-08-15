import { expect, test } from "vite-plus/test";

import {
  devicePixelError,
  logicalInlineOffset,
  nativeInlineOffset,
  snapPlacement,
  snapToDevicePixel,
  synchronizeAxes,
} from "../src/geometry";
import { createTimelineMetrics } from "../src/metrics";
import { RESOURCE_COUNT, TIME_SLOT_COUNT, createResources, createTimeSlots } from "../src/model";

test("resource and time keys are deterministic domain identifiers", () => {
  const resources = createResources(RESOURCE_COUNT);
  const timeSlots = createTimeSlots(TIME_SLOT_COUNT);

  expect(resources).toHaveLength(500);
  expect(resources[0]?.id).toBe("resource-001");
  expect(resources[239]?.id).toBe("resource-240");
  expect(resources[499]?.id).toBe("resource-500");
  expect(new Set(resources.map((resource) => resource.id)).size).toBe(500);
  expect(timeSlots).toHaveLength(336);
  expect(timeSlots[0]?.id).toBe("slot-000");
  expect(timeSlots[335]?.id).toBe("slot-335");
});

test.each([1, 1.25, 1.5, 2, 3])("placements align to a %sx device pixel grid", (scale) => {
  for (const value of [0, 38.5, 96.25, 1_234.375, 31_999.875]) {
    const snapped = snapToDevicePixel(value, scale);
    expect(devicePixelError(snapped, scale)).toBeLessThan(Number.EPSILON * 8);
  }

  const placement = snapPlacement(96.25, 96.25, scale);
  expect(devicePixelError(placement.start, scale)).toBeLessThan(Number.EPSILON * 8);
  expect(devicePixelError(placement.start + placement.size, scale)).toBeLessThan(
    Number.EPSILON * 8,
  );
});

test("axis synchronization performs exactly two constant-time writes", () => {
  const timeAxis = { scrollLeft: 0 };
  const resourceAxis = { scrollTop: 0 };
  const writes = synchronizeAxes({ timeAxis, resourceAxis }, { inline: -9_600, block: 14_000 });

  expect(writes).toBe(2);
  expect(timeAxis.scrollLeft).toBe(-9_600);
  expect(resourceAxis.scrollTop).toBe(14_000);
});

test("logical inline offsets map symmetrically across LTR and negative-scroll RTL", () => {
  expect(logicalInlineOffset(12_000, "ltr")).toBe(12_000);
  expect(logicalInlineOffset(-12_000, "rtl")).toBe(12_000);
  expect(nativeInlineOffset(12_000, "ltr")).toBe(12_000);
  expect(nativeInlineOffset(12_000, "rtl")).toBe(-12_000);
  expect(logicalInlineOffset(50, "rtl")).toBe(0);
  expect(nativeInlineOffset(-50, "ltr")).toBe(0);
});

test("instrumented frames stay bounded below the 500-resource population", () => {
  const metrics = createTimelineMetrics(500, 336);
  metrics.beginFrameProbe();

  for (let frame = 0; frame < 120; frame += 1) {
    for (let read = 0; read < 24; read += 1) {
      metrics.recordResourceKeyRead();
    }
    for (let read = 0; read < 48; read += 1) {
      metrics.recordResourceRead();
    }
    metrics.recordFrame({
      visibleResources: 24,
      visibleTimeSlots: 16,
      projectedCells: 384,
      axisWrites: 2,
      durationMs: 0.2,
    });
  }

  expect(metrics.snapshot()).toMatchObject({
    frameCount: 120,
    maxVisibleResources: 24,
    maxVisibleTimeSlots: 16,
    maxProjectedCells: 384,
    maxAxisWritesPerFrame: 2,
    maxResourceKeyReadsPerFrame: 24,
    maxResourceReadsPerFrame: 48,
    fullResourceFrameScans: 0,
  });
});

test("instrumentation flags a full resource key scan inside one frame", () => {
  const metrics = createTimelineMetrics(500, 336);
  metrics.beginFrameProbe();
  for (let resource = 0; resource < 500; resource += 1) {
    metrics.recordResourceKeyRead();
  }
  metrics.recordFrame({
    visibleResources: 24,
    visibleTimeSlots: 16,
    projectedCells: 384,
    axisWrites: 2,
    durationMs: 0.2,
  });

  expect(metrics.snapshot()).toMatchObject({
    maxResourceKeyReadsPerFrame: 500,
    fullResourceFrameScans: 1,
  });
});

test("instrumentation flags a full resource record scan inside one frame", () => {
  const metrics = createTimelineMetrics(500, 336);
  metrics.beginFrameProbe();
  for (let resource = 0; resource < 500; resource += 1) {
    metrics.recordResourceRead();
  }
  metrics.recordFrame({
    visibleResources: 24,
    visibleTimeSlots: 16,
    projectedCells: 384,
    axisWrites: 2,
    durationMs: 0.2,
  });

  expect(metrics.snapshot()).toMatchObject({
    maxResourceReadsPerFrame: 500,
    fullResourceFrameScans: 1,
  });
});
