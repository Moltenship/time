// @vitest-environment jsdom

import {
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
  type CalendarViewRendererProps,
  type DayGridSegment,
  type EventId,
  type MonthProjection,
  type ResourceId,
} from "@moltenship/calendar";
import { afterEach, describe, expect, test } from "vite-plus/test";

import { allDay, createParity, drag, keys, shiftSpace, timed, timeZone } from "./harness/parity";

/**
 * Every keyboard create, move, and resize in a month must reach `onEventChange` as exactly the
 * change the same pointer gesture makes. Each case runs both inputs and compares.
 */

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

const parity = createParity(
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
);
afterEach(parity.unmount);

const eventElement = (container: Element, id: string) =>
  container.querySelector(`[data-event-id="${id}"]`)!;
const dayElement = (container: Element, date: string) =>
  container.querySelector(`[data-date="${date}"]`)!;

describe("keyboard and pointer changes match in a month", () => {
  test("move an all-day event to another week", async () => {
    const events = [allDay("trip", "2026-10-07", "2026-10-09")];
    const byPointer = await parity.mount(events, "2026-10-08");
    await drag(
      eventElement(byPointer.container, "trip"),
      center("2026-10-07"),
      center("2026-10-15"),
    );
    const pointerSaid = byPointer.spoken();

    const byKeyboard = await parity.mount(events, "2026-10-08");
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
    expect(pointerSaid).toBe("move trip Oct 15 – 16");
  });

  test("move a timed event across the spring-forward change, keeping its wall time", async () => {
    const events = [timed("standup", "2026-03-06T09:00", "2026-03-06T09:30")];
    const byPointer = await parity.mount(events, "2026-03-05");
    await drag(
      eventElement(byPointer.container, "standup"),
      center("2026-03-06"),
      center("2026-03-09"),
    );

    const byKeyboard = await parity.mount(events, "2026-03-05");
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
    const byPointer = await parity.mount(events, "2026-10-08");
    const handle = eventElement(byPointer.container, "trip").querySelector('[data-resize="end"]')!;
    await drag(handle, center("2026-10-08"), center("2026-10-10"));

    const byKeyboard = await parity.mount(events, "2026-10-08");
    await keys(eventElement(byKeyboard.container, "trip"), [
      shiftSpace,
      "ArrowRight",
      "ArrowRight",
      "Enter",
    ]);

    expect(byKeyboard.changes).toEqual(byPointer.changes);
    expect(byPointer.changes[0]).toMatchObject({ cause: "resize-end" });
  });

  test("resize an event's start", async () => {
    const events = [allDay("trip", "2026-10-07", "2026-10-09")];
    const byPointer = await parity.mount(events, "2026-10-08");
    const handle = eventElement(byPointer.container, "trip").querySelector(
      '[data-resize="start"]',
    )!;
    await drag(handle, center("2026-10-07"), center("2026-10-05"));

    const byKeyboard = await parity.mount(events, "2026-10-08");
    await keys(eventElement(byKeyboard.container, "trip"), [
      shiftSpace,
      shiftSpace,
      "ArrowLeft",
      "ArrowLeft",
      "Enter",
    ]);

    expect(byKeyboard.changes).toEqual(byPointer.changes);
    expect(byPointer.changes[0]).toMatchObject({ cause: "resize-start" });
  });

  test("create an all-day event across days", async () => {
    const byPointer = await parity.mount([], "2026-10-08");
    await drag(
      dayElement(byPointer.container, "2026-10-20"),
      center("2026-10-20"),
      center("2026-10-22"),
    );

    const byKeyboard = await parity.mount([], "2026-10-08");
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
