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
import { act } from "react";
import { afterEach, expect, test } from "vite-plus/test";

import {
  createCalendar,
  defineCalendarView,
  useCalendarKeyboard,
  useRovingFocus,
  type CalendarKeyboardOptions,
  type CalendarViewRendererProps,
} from "@moltenship/calendar-react";

import { renderWithHarness, type ReactRootHarness } from "./harness/render-harness";
import "./setup";

type Booking = CalendarEvent<null, string, string>;
type Room = CalendarResource<null>;
type Projection = ResourceTimelineProjection<Booking>;

const rooms: readonly Room[] = [
  { data: null, id: "a", title: "Room A" },
  { data: null, id: "b", title: "Room B" },
];
const snap = { increment: 1, smallestUnit: "hour" } as const;
const hours = Array.from({ length: 24 }, (_, hour) => new Temporal.PlainTime(hour));

function Slot({ focus }: { readonly focus: CalendarFocus }) {
  return (
    <button
      data-cell={`${String(focus.resourceId)}@${focus.kind === "slot" ? focus.time.hour : "day"}`}
      type="button"
      {...useRovingFocus(focus)}
    />
  );
}

let keyboardOptions: CalendarKeyboardOptions = {};

function Bar({ focus }: { readonly focus: CalendarFocus }) {
  return (
    <button
      data-bar={focus.kind === "event" ? `${focus.eventId}@${String(focus.resourceId)}` : ""}
      type="button"
      {...useRovingFocus(focus)}
    />
  );
}

/** One date's hour slots and bars per resource row, as a timeline with hour slots renders them. */
function TimelineRenderer({ projection }: CalendarViewRendererProps<Projection, object>) {
  const date = projection.columns[0]!.date;
  return (
    <div {...useCalendarKeyboard(keyboardOptions)}>
      {projection.rows.map((row) => [
        ...hours.map((time) => (
          <Slot
            focus={{ date, kind: "slot", resourceId: row.resource.id, time }}
            key={`${row.resource.key}:${time.hour}`}
          />
        )),
        ...("bars" in row ? row.bars : []).map(({ event }) => (
          <Bar
            focus={{ date, eventId: event.id, kind: "event", resourceId: row.resource.id }}
            key={`${row.resource.key}:${event.id}`}
          />
        )),
      ])}
    </div>
  );
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

let harness: ReactRootHarness | undefined;
const changes: CalendarEventChange<Booking, string, string>[] = [];

afterEach(async () => {
  await harness?.dispose();
  harness = undefined;
  changes.length = 0;
  keyboardOptions = {};
});

async function mount(events: readonly Booking[] = []) {
  harness = await renderWithHarness(
    <RoomCalendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="UTC"
      events={events}
      locale="en-US"
      onEventChange={(change) => {
        changes.push(change);
      }}
      resources={rooms}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <RoomCalendar.ActiveView />
      <RoomCalendar.Announcer messages={messages} />
    </RoomCalendar.Root>,
  );
}

async function press(key: string, options: KeyboardEventInit = {}) {
  await act(async () => {
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...options }),
    );
    await Promise.resolve();
  });
}

function created(): string | undefined {
  const change = changes.at(-1);
  if (change?.cause !== "create" || change.proposed.kind !== "timed") return undefined;
  const { end, resourceIds, start } = change.proposed;
  return `${start.toString()}/${end.toString()} [${resourceIds.join(",")}]`;
}

function spoken(): string {
  return harness!.container.querySelector('[data-calendar-part="announcer"]')!.textContent!.trim();
}

test("a create on an inline time axis grows along its row", async () => {
  keyboardOptions = { axis: "inline", createDuration: { hours: 2 }, snap };
  await mount();
  await act(async () =>
    harness!.container.querySelector<HTMLElement>('[data-cell="a@9"]')!.focus(),
  );

  await press(" ");
  await press("Enter");

  expect(created()).toBe("2026-10-08T09:00:00Z/2026-10-08T11:00:00Z [a]");
});

test("without the inline axis a create steps down into the next row and stays one slot", async () => {
  keyboardOptions = { createDuration: { hours: 2 }, snap };
  await mount();
  await act(async () =>
    harness!.container.querySelector<HTMLElement>('[data-cell="a@9"]')!.focus(),
  );

  await press(" ");
  await press("Enter");

  expect(created()).toBe("2026-10-08T09:00:00Z/2026-10-08T10:00:00Z [a]");
});

test("announcements name resources by their titles", async () => {
  keyboardOptions = { axis: "inline", snap };
  await mount();
  await act(async () =>
    harness!.container.querySelector<HTMLElement>('[data-cell="b@9"]')!.focus(),
  );

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
  await act(async () =>
    harness!.container.querySelector<HTMLElement>('[data-bar="offsite@a"]')!.focus(),
  );

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
