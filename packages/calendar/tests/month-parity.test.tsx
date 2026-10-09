// @vitest-environment jsdom

import {
  createCalendar,
  createCanonicalEventAdapter,
  defineCalendarView,
  eventIdAttributes,
  getMonthRange,
  getMonthTitle,
  monthSpatialNavigation,
  navigateMonth,
  projectMonth,
  useCalendarAnnouncer,
  useCalendarKeyboard,
  useCalendarPointer,
  useRovingFocus,
  type CalendarAnnouncementMessages,
  type CalendarEvent,
  type CalendarEventChange,
  type CalendarViewRendererProps,
  type DayGridSegment,
  type EventId,
  type MonthProjection,
  type ResourceId,
} from "@moltenship/calendar";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test } from "vite-plus/test";

/**
 * Every keyboard create, move, and resize must reach `onEventChange` as exactly the change the
 * same pointer gesture makes. Each case runs both inputs on a fresh calendar and compares.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type FixtureEvent = CalendarEvent<null, string, string>;
type Change = CalendarEventChange<FixtureEvent, string, string>;

const timeZone = "America/New_York";

/** The rendered grid's first date; cells are 100×80 pixels from there. */
function gridStart() {
  return Temporal.PlainDate.from(document.querySelector("[data-date]")!.getAttribute("data-date")!);
}

function center(date: string) {
  const index = gridStart().until(Temporal.PlainDate.from(date)).days;
  return { x: (index % 7) * 100 + 50, y: Math.floor(index / 7) * 80 + 40 };
}

// jsdom has no layout: hit-test the cell grid by position.
document.elementsFromPoint = (x: number, y: number) => {
  const date = gridStart().add({ days: Math.floor(y / 80) * 7 + Math.floor(x / 100) });
  const cell = document.querySelector(`[data-date="${date.toString()}"]`);
  return cell === null ? [] : [cell];
};

function Segment({
  date,
  segment,
}: {
  readonly date: Temporal.PlainDate;
  readonly segment: DayGridSegment<unknown, EventId, ResourceId>;
}) {
  const { event } = segment;
  const roving = useRovingFocus({ date, eventId: event.id, kind: "event" }, { days: segment.span });
  return (
    <div {...eventIdAttributes(event.id)} {...roving}>
      {!segment.startsBefore && <span data-resize="start" />}
      {event.title}
      {!segment.endsAfter && <span data-resize="end" />}
    </div>
  );
}

function Day({ date }: { readonly date: Temporal.PlainDate }) {
  return (
    <div data-date={date.toString()} {...useRovingFocus({ date, kind: "day" })}>
      {date.day}
    </div>
  );
}

function MonthView({
  actions,
  environment,
  events,
  projection,
}: CalendarViewRendererProps<MonthProjection<unknown, EventId, ResourceId>, undefined>) {
  const pointerRef = useCalendarPointer({
    announcer: useCalendarAnnouncer(),
    events,
    onPropose: actions.proposeEventChange,
    timeZone: environment.timeZone,
  });
  return (
    <div ref={pointerRef} {...useCalendarKeyboard()}>
      {projection.weeks.map((week) => (
        <div key={week.range.start.toString()}>
          {week.days.map((day) => (
            <Day key={day.date.toString()} date={day.date} />
          ))}
          {week.segments.map((segment) => (
            <Segment
              key={String(segment.event.id)}
              date={week.days[segment.column]!.date}
              segment={segment}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

const Calendar = createCalendar<FixtureEvent>()({
  eventAdapter: createCanonicalEventAdapter<null, string, string>(),
  views: [
    defineCalendarView({
      name: "month",
      strategy: {
        getRange: getMonthRange,
        getSpatialNavigation: monthSpatialNavigation,
        getTitle: getMonthTitle,
        navigate: navigateMonth,
        project: projectMonth,
      },
      Renderer: MonthView,
    }),
  ],
});

const messages: CalendarAnnouncementMessages = {
  cancel: () => "cancel",
  commit: ({ cause, event, proposed }, { formatRange }) =>
    `${cause} ${event?.title ?? "new"} ${formatRange(proposed)}`,
  reject: ({ reason }) => reason,
  start: () => null,
  step: () => null,
};

function Fixture({
  anchor,
  events: initial,
  onChange,
}: {
  readonly anchor: string;
  readonly events: readonly FixtureEvent[];
  readonly onChange: (change: Change) => void;
}) {
  const [events, setEvents] = useState(initial);
  return (
    <Calendar.Root
      defaultAnchorDate={Temporal.PlainDate.from(anchor)}
      defaultTimeZone={timeZone}
      events={events}
      locale="en-US"
      now={Temporal.Instant.from("2026-10-08T16:00:00Z")}
      onEventChange={(change) => {
        onChange(change);
        if (change.eventId === null || change.proposed === null) return;
        const { proposed } = change;
        setEvents((current) =>
          current.map((event) =>
            event.id === change.eventId ? ({ ...event, ...proposed } as FixtureEvent) : event,
          ),
        );
      }}
      weekRules={{ firstDay: 7, minimalDays: 1, weekend: [6, 7] }}
    >
      <Calendar.ActiveView />
      <Calendar.Announcer messages={messages} />
    </Calendar.Root>
  );
}

let root: Root | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  // The guard that swallows a drag's trailing click expires on the next task.
  await new Promise((resolve) => setTimeout(resolve));
});

async function mount(events: readonly FixtureEvent[], anchor = "2026-10-08") {
  const changes: Change[] = [];
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <Fixture anchor={anchor} events={events} onChange={(change) => changes.push(change)} />,
    ),
  );
  const spoken = () =>
    container.querySelector('[data-calendar-part="announcer"]')!.textContent!.trim();
  return { changes, container, spoken };
}

async function remount(events: readonly FixtureEvent[], anchor?: string) {
  await act(async () => root?.unmount());
  document.body.replaceChildren();
  await new Promise((resolve) => setTimeout(resolve));
  return mount(events, anchor);
}

function pointer(type: string, target: Element, date: string) {
  const { x, y } = center(date);
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperties(event, {
    isPrimary: { value: true },
    pointerId: { value: 1 },
    pointerType: { value: "mouse" },
  });
  target.dispatchEvent(event);
}

async function drag(press: Element, from: string, to: string) {
  await act(async () => {
    pointer("pointerdown", press, from);
    pointer("pointermove", press, to);
    pointer("pointerup", press, to);
    await Promise.resolve();
  });
}

async function keys(start: Element, sequence: readonly (string | [string, KeyboardEventInit])[]) {
  await act(async () => (start as HTMLElement).focus());
  for (const entry of sequence) {
    const [key, init] = typeof entry === "string" ? [entry, {}] : entry;
    await act(async () => {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...init }),
      );
      await Promise.resolve();
    });
  }
}

function allDay(id: string, start: string, end: string): FixtureEvent {
  const date = (value: string) => Temporal.PlainDate.from(value);
  return { data: null, end: date(end), id, kind: "all-day", start: date(start), title: id };
}

function timed(id: string, start: string, end: string): FixtureEvent {
  const instant = (value: string) =>
    Temporal.ZonedDateTime.from(`${value}[${timeZone}]`).toInstant();
  return { data: null, end: instant(end), id, kind: "timed", start: instant(start), title: id };
}

const shift: [string, KeyboardEventInit] = [" ", { shiftKey: true }];
const eventElement = (container: Element, id: string) =>
  container.querySelector(`[data-event-id="${id}"]`)!;
const dayElement = (container: Element, date: string) =>
  container.querySelector(`[data-date="${date}"]`)!;

describe("keyboard and pointer changes match", () => {
  test("move an all-day event to another week", async () => {
    const events = [allDay("trip", "2026-10-07", "2026-10-09")];
    const byPointer = await mount(events);
    await drag(eventElement(byPointer.container, "trip"), "2026-10-07", "2026-10-15");
    const pointerSaid = byPointer.spoken();

    const byKeyboard = await remount(events);
    await keys(eventElement(byKeyboard.container, "trip"), [
      " ",
      "ArrowRight",
      "ArrowDown",
      "Enter",
    ]);

    expect(byKeyboard.changes).toEqual(byPointer.changes);
    expect(byPointer.changes).toHaveLength(1);
    expect(byPointer.changes[0]).toMatchObject({ cause: "move", eventId: "trip" });
    expect(byKeyboard.spoken()).toBe(pointerSaid);
    expect(pointerSaid.replace(/\s/gu, " ")).toBe("move trip Oct 15 – 16");
  });

  test("move a timed event across the spring-forward change, keeping its wall time", async () => {
    const events = [timed("standup", "2026-03-06T09:00", "2026-03-06T09:30")];
    const byPointer = await mount(events, "2026-03-05");
    await drag(eventElement(byPointer.container, "standup"), "2026-03-06", "2026-03-09");

    const byKeyboard = await remount(events, "2026-03-05");
    await keys(eventElement(byKeyboard.container, "standup"), [
      " ",
      "ArrowRight",
      "ArrowRight",
      "ArrowRight",
      "Enter",
    ]);

    expect(byKeyboard.changes).toEqual(byPointer.changes);
    expect(byPointer.changes).toHaveLength(1);
    const { proposed } = byPointer.changes[0]!;
    expect(proposed?.kind === "timed" && proposed.start.toZonedDateTimeISO(timeZone).hour).toBe(9);
  });

  test("resize an event's end", async () => {
    const events = [allDay("trip", "2026-10-07", "2026-10-09")];
    const byPointer = await mount(events);
    const handle = eventElement(byPointer.container, "trip").querySelector('[data-resize="end"]')!;
    await drag(handle, "2026-10-08", "2026-10-10");

    const byKeyboard = await remount(events);
    await keys(eventElement(byKeyboard.container, "trip"), [
      shift,
      "ArrowRight",
      "ArrowRight",
      "Enter",
    ]);

    expect(byKeyboard.changes).toEqual(byPointer.changes);
    expect(byPointer.changes[0]).toMatchObject({ cause: "resize-end" });
  });

  test("resize an event's start", async () => {
    const events = [allDay("trip", "2026-10-07", "2026-10-09")];
    const byPointer = await mount(events);
    const handle = eventElement(byPointer.container, "trip").querySelector(
      '[data-resize="start"]',
    )!;
    await drag(handle, "2026-10-07", "2026-10-05");

    const byKeyboard = await remount(events);
    await keys(eventElement(byKeyboard.container, "trip"), [
      shift,
      shift,
      "ArrowLeft",
      "ArrowLeft",
      "Enter",
    ]);

    expect(byKeyboard.changes).toEqual(byPointer.changes);
    expect(byPointer.changes[0]).toMatchObject({ cause: "resize-start" });
  });

  test("create an all-day event across days", async () => {
    const byPointer = await mount([]);
    await drag(dayElement(byPointer.container, "2026-10-20"), "2026-10-20", "2026-10-22");

    const byKeyboard = await remount([]);
    await keys(dayElement(byKeyboard.container, "2026-10-20"), [
      " ",
      "ArrowRight",
      "ArrowRight",
      " ",
    ]);

    expect(byKeyboard.changes).toEqual(byPointer.changes);
    expect(byPointer.changes[0]).toMatchObject({ cause: "create", eventId: null });
  });
});
