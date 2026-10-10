import { plainDateInterval } from "@moltenship/calendar";
import type { VirtualItem } from "@tanstack/react-virtual";
import { expect, test } from "vite-plus/test";

import {
  anchorSlot,
  placeBars,
  slotsCovered,
  type TimelineBar,
} from "../resource-timeline-view/timeline-placement";
import { timelineSlots } from "../resource-timeline-view/timeline-scale";

const slots = timelineSlots(
  plainDateInterval(Temporal.PlainDate.from("2026-10-01"), Temporal.PlainDate.from("2026-11-01")),
  "day",
);

const rendered = (...indexes: number[]): VirtualItem[] =>
  indexes.map((index) => ({ end: 0, index, key: index, lane: 0, size: 48, start: 0 }));

function bar(
  start: number,
  end: number,
  extra: Partial<TimelineBar<null>> = {},
): TimelineBar<null> {
  return {
    end,
    endsAfter: false,
    event: { id: `${start}-${end}` } as TimelineBar<null>["event"],
    lane: 0,
    start,
    startsBefore: false,
    ...extra,
  };
}

test("a stretch covers the slots it reaches into", () => {
  expect(slotsCovered(3, 5)).toEqual([3, 4]);
  expect(slotsCovered(3.5, 4.25)).toEqual([3, 4]);
  // A zero-length stretch still sits in its slot.
  expect(slotsCovered(7, 7)).toEqual([7, 7]);
});

test("a bar sits in the first rendered slot it covers, past the gap a pinned slot leaves", () => {
  // Slot 0 is pinned by focus; 10 to 13 are in view.
  const visible = rendered(0, 10, 11, 12, 13);

  expect(anchorSlot(visible, 3, 11)).toBe(10);
  expect(anchorSlot(visible, 0, 2)).toBe(0);
  expect(anchorSlot(visible, 4, 6)).toBeUndefined();

  const placed = placeBars(
    [bar(3, 12), bar(4, 7), bar(12, 14, { endsAfter: true })],
    slots,
    visible,
    48,
  );
  // From slot 3 to 12, anchored at 10: it starts 7 slots before its cell, 2px past the line.
  expect(placed.get(10)).toEqual([
    expect.objectContaining({ days: 9, offset: -7 * 48 + 2, width: 9 * 48 - 4 }),
  ]);
  expect(placed.get(10)?.[0]?.date.toString()).toBe("2026-10-04");
  // Wholly in the gap, nothing renders it.
  expect([...placed.values()].flat().some(({ start }) => start === 4)).toBe(false);
  // A continuing end reaches the next cell's line.
  expect(placed.get(12)).toEqual([expect.objectContaining({ offset: 2, width: 2 * 48 - 2 })]);
});
