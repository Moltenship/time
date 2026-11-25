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
import { createComponent, type JSX } from "@solidjs/web";
import { createSignal, For, merge, type Accessor, type Component } from "solid-js";
import { afterEach, expect, test } from "vite-plus/test";

import {
  createCalendar,
  defineCalendarView,
  useCalendarKeyboard,
  useRovingFocus,
  type CalendarViewRendererProps,
} from "../src";
import { keyedList } from "../src/flow";
import { element } from "../src/props";
import { mount, settled } from "./harness/render";
import "./setup";

type Booking = CalendarEvent<null, string, string>;
type Room = CalendarResource<null>;

const Div = element("div");
const Button = element("button");

const room = (id: string): Room => ({ data: null, id, title: id });
const twoDays = (anchor: Temporal.PlainDate) => plainDateInterval(anchor, anchor.add({ days: 2 }));
const datesOf = ({ start }: PlainDateInterval) => [start, start.add({ days: 1 })];

/** A cell whose date and resource may change under it, as a cell keyed by position's do. */
function DayCell(props: {
  readonly date: Temporal.PlainDate;
  readonly resourceId?: ResourceId | null;
}): JSX.Element {
  const target = (): CalendarFocus =>
    props.resourceId === undefined
      ? { date: props.date, kind: "day" }
      : { date: props.date, kind: "day", resourceId: props.resourceId };
  return createComponent(
    Button,
    merge(useRovingFocus(target), {
      get "data-cell"() {
        return `${props.resourceId ?? "-"}@${props.date.toString()}`;
      },
      type: "button",
    } as const),
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
  Renderer(props: CalendarViewRendererProps<PlainDateInterval, undefined>) {
    return createComponent(Div, {
      ref: useCalendarKeyboard(),
      get children() {
        return keyedList(
          () => datesOf(props.projection),
          (date: Temporal.PlainDate) => createComponent(DayCell, { date }),
        );
      },
    });
  },
});

interface Cell {
  readonly date: Temporal.PlainDate;
  readonly resourceId: ResourceId | null;
}

/** `For` keyed by position: the item comes as an accessor, since one position sees many items. */
interface ByPositionProps {
  readonly each: readonly Cell[];
  readonly keyed: false;
  readonly children: (cell: Accessor<Cell>) => JSX.Element;
}

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
  Renderer(props: CalendarViewRendererProps<RoomsProjection, undefined>) {
    const cells = () =>
      props.projection.rows.flatMap((row) =>
        datesOf(props.projection.range).map((date) => ({ date, resourceId: row.id })),
      );
    return createComponent(Div, {
      ref: useCalendarKeyboard(),
      get children() {
        // Keyed by position: a cell whose resource changes stays the same element.
        return createComponent(For as Component<ByPositionProps>, {
          get each() {
            return cells();
          },
          keyed: false,
          children: (cell: Accessor<Cell>) =>
            createComponent(DayCell, {
              get date() {
                return cell().date;
              },
              get resourceId() {
                return cell().resourceId;
              },
            }),
        });
      },
    });
  },
});

const RoomCalendar = createCalendar<Booking, Room>()({
  eventAdapter: createCanonicalEventAdapter<null, string, string>(),
  views: [plainView, roomsView],
});

const changes: CalendarEventChange<Booking, string, string>[] = [];

afterEach(() => {
  changes.length = 0;
});

let container: HTMLElement;

async function render(
  view: "plain" | "rooms",
  resources: readonly Room[] = [room("a"), room("b")],
) {
  const [props, setProps] = createSignal({ resources, view });
  container = mount(() =>
    createComponent(RoomCalendar.Root, {
      defaultAnchorDate: Temporal.PlainDate.from("2026-10-08"),
      defaultTimeZone: "UTC",
      events: [],
      locale: "en-US",
      onEventChange: (change) => {
        changes.push(change);
      },
      get resources() {
        return props().resources;
      },
      get view() {
        return props().view;
      },
      weekRules: { firstDay: 1, minimalDays: 4, weekend: [6, 7] },
      get children() {
        return createComponent(RoomCalendar.ActiveView, {});
      },
    }),
  ).container;
  await settled();
  return async (next: { resources?: readonly Room[]; view: "plain" | "rooms" }) => {
    setProps({ resources: next.resources ?? resources, view: next.view });
    await settled();
    await settled();
  };
}

function tabStops(): string[] {
  return [...container.querySelectorAll<HTMLElement>('[tabindex="0"]')].map(
    (cell) => cell.dataset.cell!,
  );
}

function cell(name: string): HTMLElement {
  return container.querySelector<HTMLElement>(`[data-cell="${name}"]`)!;
}

async function focus(element: HTMLElement) {
  element.focus();
  await settled();
}

async function press(key: string) {
  document.activeElement!.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }),
  );
  await settled();
}

/** Creates a one-day event on the focused cell from the keyboard; returns its resources. */
async function createHere(): Promise<readonly string[] | undefined> {
  await press(" ");
  await press("Enter");
  const change = changes.at(-1);
  return change?.cause === "create" ? change.proposed.resourceIds : undefined;
}

test("focus from a view without resources lands on one resource copy and creates there", async () => {
  const update = await render("plain");
  await focus(cell("-@2026-10-09"));

  await update({ view: "rooms" });
  expect(tabStops()).toEqual(["a@2026-10-09"]);

  await focus(cell("a@2026-10-09"));
  expect(await createHere()).toEqual(["a"]);
});

test("focus from a resource view creates without that resource in a view without them", async () => {
  const update = await render("rooms");
  await focus(cell("b@2026-10-09"));

  await update({ view: "plain" });
  expect(tabStops()).toEqual(["-@2026-10-09"]);

  await focus(cell("-@2026-10-09"));
  expect(await createHere()).toEqual([]);
});

test("a cell whose resource changes in place re-registers and keeps the view reachable", async () => {
  const update = await render("rooms");
  await focus(cell("a@2026-10-08"));
  const first = cell("a@2026-10-08");

  await update({ resources: [room("c"), room("b")], view: "rooms" });

  expect(cell("c@2026-10-08")).toBe(first);
  expect(tabStops()).toEqual(["c@2026-10-08"]);
  await focus(first);
  expect(await createHere()).toEqual(["c"]);
});
