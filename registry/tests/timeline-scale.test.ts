import { plainDateInterval } from "@moltenship/calendar";
import { expect, test } from "vite-plus/test";

import { timelineSlotGroups, timelineSlots } from "../resource-timeline-view/timeline-scale";
import { timelineColumns } from "../resource-timeline-view/use-timeline-virtualizer";

const range = (start: string, end: string) =>
  plainDateInterval(Temporal.PlainDate.from(start), Temporal.PlainDate.from(end));

test("hour slots follow the nominal 24-hour wall clock, even on a clock-change day", () => {
  // Clocks go back in New York on November 1, 2026; the timeline still draws 24 hours.
  const slots = timelineSlots(range("2026-11-01", "2026-11-02"), "hour");

  expect(slots).toHaveLength(24);
  expect(slots[0]?.key).toBe("2026-11-01T00:00:00");
  expect(slots[9]?.start.toString()).toBe("2026-11-01T09:00:00");
  expect(slots.every(({ date }) => date.toString() === "2026-11-01")).toBe(true);
});

test("day slots start at midnight and key by date", () => {
  const slots = timelineSlots(range("2026-10-01", "2026-11-01"), "day");

  expect(slots).toHaveLength(31);
  expect(slots.map(({ key }) => key).slice(0, 2)).toEqual([
    "2026-10-01T00:00:00",
    "2026-10-02T00:00:00",
  ]);
  expect(new Set(slots.map(({ key }) => key)).size).toBe(31);
});

test("groups gather hours by date and days by month", () => {
  const days = timelineSlots(range("2026-09-28", "2026-10-05"), "day");
  const hours = timelineSlots(range("2026-10-08", "2026-10-10"), "hour");

  expect(
    timelineSlotGroups(days, "day").map(({ count, first, key }) => [key, first, count]),
  ).toEqual([
    ["2026-09", 0, 3],
    ["2026-10", 3, 4],
  ]);
  expect(
    timelineSlotGroups(hours, "hour").map(({ count, first, key }) => [key, first, count]),
  ).toEqual([
    ["2026-10-08", 0, 24],
    ["2026-10-09", 24, 24],
  ]);
});

test("slots share the width the resource column leaves, down to a minimum", () => {
  // A week fills a wide viewport: (1024 - 208) / 7 = 116.57 → 116.
  expect(timelineColumns(1024, 7, 48)).toEqual({ columnWidth: 208, slotWidth: 116 });
  // A month would get 26px each, so it keeps 48px slots and scrolls.
  expect(timelineColumns(1024, 31, 48)).toEqual({ columnWidth: 208, slotWidth: 48 });
  // A phone narrows the resource column.
  expect(timelineColumns(390, 7, 48)).toEqual({ columnWidth: 128, slotWidth: 48 });
});
