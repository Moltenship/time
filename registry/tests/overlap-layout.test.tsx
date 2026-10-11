// @vitest-environment jsdom

import type { CalendarEventChange, CalendarFocus, OverlapLayout } from "@moltenship/calendar";
import { act } from "react";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { createWeekView } from "../time-grid-view/time-grid-view";
import { drag, layOut } from "./pointer";
import { render } from "./render";
import { people, ResourceCalendar, shift } from "./resource-fixtures";
import { anchorDate, clock, createTestCalendar, timed, type ColoredEvent } from "./view-fixtures";

type Change = CalendarEventChange<ColoredEvent, string | number, string>;

const Calendar = createTestCalendar(createWeekView<ColoredEvent>());

// Thursday 2026-10-08 in UTC, the fifth column of a Sunday-first week.
const events = [
  timed("a", "2026-10-08T09:00Z", "2026-10-08T12:00Z"),
  timed("b", "2026-10-08T09:30Z", "2026-10-08T11:00Z"),
  timed("c", "2026-10-08T10:00Z", "2026-10-08T10:30Z"),
];

/** Each event's inline start and width as shares of its column, in document order. */
const drawn: Record<OverlapLayout, readonly (readonly [string, number, number])[]> = {
  columns: [
    ["a", 0, 0.333],
    ["b", 0.333, 0.333],
    ["c", 0.667, 0.333],
  ],
  equal: [
    ["a", 0, 0.333],
    ["b", 0.333, 0.333],
    ["c", 0.667, 0.333],
  ],
  stack: [
    ["a", 0, 1],
    ["b", 0.15, 0.85],
    ["c", 0.3, 0.7],
  ],
};

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

async function renderWeek(
  overlapLayout: OverlapLayout,
  {
    defaultFocus = null,
    onEventChange = () => {},
  }: {
    readonly defaultFocus?: CalendarFocus | null;
    readonly onEventChange?: (change: Change) => void;
  } = {},
) {
  const view = await render(
    <Calendar.Root
      clock={clock}
      defaultAnchorDate={anchorDate}
      defaultFocus={defaultFocus}
      defaultTimeZone="UTC"
      defaultView="week"
      events={events}
      locale="en-US"
      onEventChange={onEventChange}
      viewOptions={{ week: { overlapLayout } }}
      weekRules={{ firstDay: 7, minimalDays: 1, weekend: [6, 7] }}
    >
      <Calendar.ActiveView />
    </Calendar.Root>,
  );
  cleanup = view.unmount;
  return view.container;
}

const share = (value: string) => Number((Number.parseFloat(value) / 100).toFixed(3));

function positions(container: HTMLElement) {
  return [
    ...container.querySelectorAll<HTMLElement>('[data-slot="time-grid-body"] [data-event-id]'),
  ].map((event) => [
    event.getAttribute("data-event-id"),
    share(event.style.insetInlineStart),
    share(event.style.width),
  ]);
}

async function press(key: string) {
  await act(async () => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }),
    );
    await Promise.resolve();
  });
}

describe.each(["columns", "equal", "stack"] as const)("the %s overlap layout", (overlapLayout) => {
  test("draws overlapping events in layout order, as the view's option chooses", async () => {
    expect(positions(await renderWeek(overlapLayout))).toEqual(drawn[overlapLayout]);
  });

  test("moving an overlapped event from the keyboard gives the pointer's change", async () => {
    const pointerChange = vi.fn<(change: Change) => void>();
    const container = await renderWeek(overlapLayout, { onEventChange: pointerChange });
    // 100px columns, 100px per hour; c sits at its drawn share of the fifth column.
    const [, left, width] = drawn[overlapLayout][2]!;
    const event = container.querySelector('[data-event-id="c"]')!;
    const columns = [
      ...container.querySelectorAll('[data-slot="time-grid-body"] [data-date]:not([data-all-day])'),
    ];
    layOut([
      [event, { height: 50, width: width * 100, x: 400 + left * 100, y: 1000 }],
      ...columns.map(
        (column, index) => [column, { height: 2400, width: 100, x: index * 100, y: 0 }] as const,
      ),
    ]);
    const x = 400 + (left + width / 2) * 100;
    drag(event, [
      [x, 1010],
      [x, 1060],
      [x, 1110],
    ]);
    await cleanup?.();

    const keyboardChange = vi.fn<(change: Change) => void>();
    await renderWeek(overlapLayout, {
      defaultFocus: { date: anchorDate, kind: "slot", time: Temporal.PlainTime.from("10:00") },
      onEventChange: keyboardChange,
    });
    await act(async () =>
      document.querySelector<HTMLElement>('[role="grid"] [tabindex="0"]')!.focus(),
    );
    const visited = [];
    for (const key of ["Enter", "ArrowRight", "ArrowRight"]) {
      await press(key);
      visited.push(document.activeElement?.getAttribute("data-event-id"));
    }
    for (const key of [" ", "ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown", "Enter"]) {
      await press(key);
    }

    expect(visited).toEqual(["a", "b", "c"]);
    const fromPointer = pointerChange.mock.calls[0]![0];
    const fromKeyboard = keyboardChange.mock.calls[0]![0];
    expect(fromKeyboard.cause).toBe("move");
    expect(fromKeyboard.proposed).toEqual(fromPointer.proposed);
    expect(fromKeyboard.proposed?.start.toString()).toBe("2026-10-08T11:00:00Z");
  });
});

test("the resource columns view lays out each resource's events by its overlap layout", async () => {
  const view = await render(
    <ResourceCalendar.Root
      defaultAnchorDate={anchorDate}
      defaultTimeZone="UTC"
      defaultView="resources"
      events={[
        shift("standup", ["p1"], "2026-10-08T09:00Z", "2026-10-08T10:00Z"),
        shift("review", ["p1", "p2"], "2026-10-08T09:30Z", "2026-10-08T10:30Z"),
      ]}
      locale="en-US"
      now={Temporal.Instant.from("2026-10-08T12:00Z")}
      resources={people(2)}
      viewOptions={{ resources: { overlapLayout: "stack" } }}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <ResourceCalendar.ActiveView />
    </ResourceCalendar.Root>,
  );
  cleanup = view.unmount;
  const placed = (resourceId: string) =>
    [
      ...view.container.querySelectorAll<HTMLElement>(
        `[data-slot="resource-columns-body"] [data-resource-id="${resourceId}"] [data-event-id]`,
      ),
    ].map((event) => [
      event.getAttribute("data-event-id"),
      share(event.style.insetInlineStart),
      share(event.style.width),
    ]);

  expect(placed("p1")).toEqual([
    ["standup", 0, 1],
    ["review", 0.15, 0.85],
  ]);
  expect(placed("p2")).toEqual([["review", 0, 1]]);
});
