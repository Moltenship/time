// @vitest-environment jsdom

import {
  createCanonicalEventAdapter,
  visibleResources,
  type CalendarEvent,
  type CalendarEventChange,
  type CalendarFocus,
  type CalendarResource,
  type CalendarSpatialNavigationInput,
  type ResourceId,
  type VisibleResource,
} from "@moltenship/calendar-core";
import { plainDateInterval, type PlainDateInterval } from "@moltenship/calendar-temporal";
import { act } from "react";
import { afterEach, expect, test } from "vite-plus/test";

import {
  createCalendar,
  defineCalendarView,
  useCalendarKeyboard,
  useRovingFocus,
  type CalendarViewRendererProps,
} from "@moltenship/calendar-react";

import { renderWithHarness, type ReactRootHarness } from "./harness/render-harness";
import "./setup";

type Booking = CalendarEvent<null, string, string>;
type Room = CalendarResource<null>;

const room = (id: string): Room => ({ data: null, id, title: id });
const twoDays = (anchor: Temporal.PlainDate) => plainDateInterval(anchor, anchor.add({ days: 2 }));
const datesOf = ({ start }: PlainDateInterval) => [start, start.add({ days: 1 })];

function DayCell({
  date,
  resourceId,
}: {
  readonly date: Temporal.PlainDate;
  readonly resourceId?: ResourceId | null;
}) {
  const target: CalendarFocus =
    resourceId === undefined ? { date, kind: "day" } : { date, kind: "day", resourceId };
  return (
    <button
      data-cell={`${resourceId ?? "-"}@${date.toString()}`}
      type="button"
      {...useRovingFocus(target)}
    />
  );
}

/** A day view without resources. */
const plainView = defineCalendarView({
  name: "plain",
  strategy: {
    getRange: twoDays,
    getSpatialNavigation: ({ focus, range }: CalendarSpatialNavigationInput<unknown, undefined>) =>
      focus === null ? { focus: { date: range.start, kind: "day" as const } } : null,
    getTitle: (range) => range.start.toString(),
    navigate: (anchor, delta) => anchor.add({ days: 2 * delta }),
    project: ({ range }) => range,
  },
  Renderer({ projection }: CalendarViewRendererProps<PlainDateInterval, undefined>) {
    return (
      <div {...useCalendarKeyboard()}>
        {datesOf(projection).map((date) => (
          <DayCell date={date} key={date.toString()} />
        ))}
      </div>
    );
  },
});

interface RoomsProjection {
  readonly range: PlainDateInterval;
  readonly rows: readonly VisibleResource[];
}

/** The same days, once per resource; cells are keyed by position so a resource can change under one. */
const roomsView = defineCalendarView({
  name: "rooms",
  strategy: {
    getRange: twoDays,
    getSpatialNavigation: ({
      focus,
      projection,
      range,
    }: CalendarSpatialNavigationInput<RoomsProjection, undefined>) =>
      focus === null
        ? { focus: { date: range.start, kind: "day" as const, resourceId: projection.rows[0]!.id } }
        : null,
    getTitle: (range) => range.start.toString(),
    navigate: (anchor, delta) => anchor.add({ days: 2 * delta }),
    project: ({ expandedResourceIds, range, resources }) => ({
      range,
      rows: visibleResources(resources, expandedResourceIds),
    }),
  },
  Renderer({ projection }: CalendarViewRendererProps<RoomsProjection, undefined>) {
    return (
      <div {...useCalendarKeyboard()}>
        {projection.rows.map((row, index) =>
          datesOf(projection.range).map((date) => (
            <DayCell date={date} key={`${index}:${date.toString()}`} resourceId={row.id} />
          )),
        )}
      </div>
    );
  },
});

const RoomCalendar = createCalendar<Booking, Room>()({
  eventAdapter: createCanonicalEventAdapter<null, string, string>(),
  views: [plainView, roomsView],
});

let harness: ReactRootHarness | undefined;
const changes: CalendarEventChange<Booking, string, string>[] = [];

afterEach(async () => {
  await harness?.dispose();
  harness = undefined;
  changes.length = 0;
});

function element(view: "plain" | "rooms", resources: readonly Room[] = [room("a"), room("b")]) {
  return (
    <RoomCalendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="UTC"
      events={[]}
      locale="en-US"
      onEventChange={(change) => {
        changes.push(change);
      }}
      resources={resources}
      view={view}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <RoomCalendar.ActiveView />
    </RoomCalendar.Root>
  );
}

function tabStops(): string[] {
  return [...harness!.container.querySelectorAll<HTMLElement>('[tabindex="0"]')].map(
    (cell) => cell.dataset.cell!,
  );
}

function cell(name: string): HTMLElement {
  return harness!.container.querySelector<HTMLElement>(`[data-cell="${name}"]`)!;
}

async function press(key: string) {
  await act(async () => {
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }),
    );
    await Promise.resolve();
  });
}

/** Creates a one-day event on the focused cell from the keyboard; returns its resources. */
async function createHere(): Promise<readonly string[] | undefined> {
  await press(" ");
  await press("Enter");
  const change = changes.at(-1);
  return change?.cause === "create" ? change.proposed.resourceIds : undefined;
}

test("focus from a view without resources lands on one resource copy and creates there", async () => {
  harness = await renderWithHarness(element("plain"));
  await act(async () => cell("-@2026-10-09").focus());

  await harness.render(element("rooms"));
  expect(tabStops()).toEqual(["a@2026-10-09"]);

  await act(async () => cell("a@2026-10-09").focus());
  expect(await createHere()).toEqual(["a"]);
});

test("focus from a resource view creates without that resource in a view without them", async () => {
  harness = await renderWithHarness(element("rooms"));
  await act(async () => cell("b@2026-10-09").focus());

  await harness.render(element("plain"));
  expect(tabStops()).toEqual(["-@2026-10-09"]);

  await act(async () => cell("-@2026-10-09").focus());
  expect(await createHere()).toEqual([]);
});

test("a cell whose resource changes in place re-registers and keeps the view reachable", async () => {
  harness = await renderWithHarness(element("rooms"));
  await act(async () => cell("a@2026-10-08").focus());
  const first = cell("a@2026-10-08");

  await harness.render(element("rooms", [room("c"), room("b")]));

  expect(cell("c@2026-10-08")).toBe(first);
  expect(tabStops()).toEqual(["c@2026-10-08"]);
  await act(async () => first.focus());
  expect(await createHere()).toEqual(["c"]);
});
