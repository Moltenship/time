// @vitest-environment jsdom

import {
  createCanonicalEventAdapter,
  resourceTimelineStrategy,
  type CalendarAnnouncementMessages,
  type CalendarEvent,
  type CalendarEventChange,
  type CalendarFocus,
  type CalendarResource,
  type ResourceTimelineProjection,
} from "@moltenship/calendar-core";
import { createComponent, type JSX } from "@solidjs/web";
import { merge, untrack } from "solid-js";
import { afterEach, expect, test } from "vite-plus/test";

import {
  createCalendar,
  defineCalendarView,
  useCalendarKeyboard,
  useRovingFocus,
  type CalendarKeyboardOptions,
  type CalendarViewRendererProps,
} from "../src";
import { keyedList } from "../src/flow";
import { element } from "../src/props";
import { mount as mountRoot, settled } from "./harness/render";
import "./setup";

type Booking = CalendarEvent<null, string, string>;
type Room = CalendarResource<null>;
type Projection = ResourceTimelineProjection<Booking>;

const Div = element("div");
const Button = element("button");

const rooms: readonly Room[] = [
  { data: null, id: "a", title: "Room A" },
  { data: null, id: "b", title: "Room B" },
];
const snap = { increment: 1, smallestUnit: "hour" } as const;
const hours = Array.from({ length: 24 }, (_, hour) => new Temporal.PlainTime(hour));

function Slot(props: { readonly focus: CalendarFocus }): JSX.Element {
  const focus = untrack(() => props.focus);
  return createComponent(
    Button,
    merge(useRovingFocus(focus), {
      "data-cell": `${String(focus.resourceId)}@${focus.kind === "slot" ? focus.time.hour : "day"}`,
      type: "button",
    } as const),
  );
}

function Bar(props: { readonly focus: CalendarFocus }): JSX.Element {
  const focus = untrack(() => props.focus);
  return createComponent(
    Button,
    merge(useRovingFocus(focus), {
      "data-bar": focus.kind === "event" ? `${focus.eventId}@${String(focus.resourceId)}` : "",
      type: "button",
    } as const),
  );
}

let keyboardOptions: CalendarKeyboardOptions = {};

/** One date's hour slots and bars per resource row, as a timeline with hour slots renders them. */
function TimelineRenderer(props: CalendarViewRendererProps<Projection, object>): JSX.Element {
  const cells = () => {
    const date = props.projection.columns[0]!.date;
    return props.projection.rows.flatMap((row) => [
      ...hours.map((time): CalendarFocus => ({
        date,
        kind: "slot",
        resourceId: row.resource.id,
        time,
      })),
      ...("bars" in row ? row.bars : []).map(({ event }): CalendarFocus => ({
        date,
        eventId: event.id,
        kind: "event",
        resourceId: row.resource.id,
      })),
    ]);
  };
  return createComponent(Div, {
    ref: useCalendarKeyboard(keyboardOptions),
    get children() {
      return keyedList(cells, (focus: CalendarFocus) =>
        focus.kind === "event" ? createComponent(Bar, { focus }) : createComponent(Slot, { focus }),
      );
    },
  });
}

const RoomCalendar = createCalendar<Booking, Room>()({
  eventAdapter: createCanonicalEventAdapter<null, string, string>(),
  views: [
    defineCalendarView({
      defaultOptions: {},
      name: "timeline",
      strategy: resourceTimelineStrategy<object, Booking>({ count: 1, kind: "days" }),
      Renderer: TimelineRenderer,
    }),
  ],
});

/** Says each phase with the titles of the proposal's resources. */
const messages = Object.fromEntries(
  (["cancel", "commit", "reject", "start", "step"] as const).map((phase) => [
    phase,
    (
      update: { readonly proposed: { readonly resourceIds: readonly string[] } | null },
      { resourceTitle }: { readonly resourceTitle: (id: string) => string | undefined },
    ) => `${phase} in ${update.proposed?.resourceIds.map(resourceTitle).join(", ") ?? "nowhere"}`,
  ]),
) as unknown as CalendarAnnouncementMessages;

let container: HTMLElement;
const changes: CalendarEventChange<Booking, string, string>[] = [];

afterEach(() => {
  changes.length = 0;
  keyboardOptions = {};
});

async function mount(events: readonly Booking[] = []) {
  container = mountRoot(() =>
    createComponent(RoomCalendar.Root, {
      defaultAnchorDate: Temporal.PlainDate.from("2026-10-08"),
      defaultTimeZone: "UTC",
      events,
      locale: "en-US",
      onEventChange: (change) => {
        changes.push(change);
      },
      resources: rooms,
      weekRules: { firstDay: 1, minimalDays: 4, weekend: [6, 7] },
      get children() {
        return [
          createComponent(RoomCalendar.ActiveView, {}),
          createComponent(RoomCalendar.Announcer, { messages }),
        ];
      },
    }),
  ).container;
  await settled();
}

async function focus(selector: string) {
  container.querySelector<HTMLElement>(selector)!.focus();
  await settled();
}

async function press(key: string, options: KeyboardEventInit = {}) {
  document.activeElement!.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...options }),
  );
  await settled();
  await settled();
}

function created(): string | undefined {
  const change = changes.at(-1);
  if (change?.cause !== "create" || change.proposed.kind !== "timed") return undefined;
  const { end, resourceIds, start } = change.proposed;
  return `${start.toString()}/${end.toString()} [${resourceIds.join(",")}]`;
}

function spoken(): string {
  return container.querySelector('[data-calendar-part="announcer"]')!.textContent!.trim();
}

test("a create on an inline time axis grows along its row", async () => {
  keyboardOptions = { axis: "inline", createDuration: { hours: 2 }, snap };
  await mount();
  await focus('[data-cell="a@9"]');

  await press(" ");
  await press("Enter");

  expect(created()).toBe("2026-10-08T09:00:00Z/2026-10-08T11:00:00Z [a]");
});

test("without the inline axis a create steps down into the next row and stays one slot", async () => {
  keyboardOptions = { createDuration: { hours: 2 }, snap };
  await mount();
  await focus('[data-cell="a@9"]');

  await press(" ");
  await press("Enter");

  expect(created()).toBe("2026-10-08T09:00:00Z/2026-10-08T10:00:00Z [a]");
});

test("announcements name resources by their titles", async () => {
  keyboardOptions = { axis: "inline", snap };
  await mount();
  await focus('[data-cell="b@9"]');

  await press(" ");

  expect(spoken()).toBe("start in Room B");
});

test("an all-day bar resizes by days from the keyboard and commits the new end", async () => {
  keyboardOptions = { axis: "inline", snap };
  await mount([
    {
      data: null,
      end: Temporal.PlainDate.from("2026-10-09"),
      id: "offsite",
      kind: "all-day",
      resourceIds: ["a"],
      start: Temporal.PlainDate.from("2026-10-08"),
      title: "Offsite",
    },
  ]);
  await focus('[data-bar="offsite@a"]');

  await press(" ", { shiftKey: true });
  await press("ArrowRight");
  await press("Enter");

  const change = changes.at(-1);
  expect(change?.cause).toBe("resize-end");
  expect(change?.proposed).toMatchObject({
    end: Temporal.PlainDate.from("2026-10-10"),
    kind: "all-day",
    resourceIds: ["a"],
    start: Temporal.PlainDate.from("2026-10-08"),
  });
});
