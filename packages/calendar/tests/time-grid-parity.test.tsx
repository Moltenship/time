// @vitest-environment jsdom

import {
  defineCalendarView,
  eventIdAttributes,
  timeGridStrategy,
  useCalendarAnnouncer,
  useCalendarKeyboard,
  useCalendarPointer,
  useRovingFocus,
  type CalendarViewRendererProps,
  type DayGridSegment,
  type EventId,
  type ResourceId,
  type TimeGridProjection,
} from "@moltenship/calendar";
import { useMemo } from "react";
import { afterEach, describe, expect, test } from "vite-plus/test";

import {
  allDay,
  createParity,
  drag,
  keys,
  shiftSpace,
  timed,
  timeZone,
  type Change,
} from "./harness/parity";

/**
 * Every keyboard create, move, and resize in a time grid must reach `onEventChange` as exactly
 * the change the same pointer gesture makes, including on the spring-forward day (March 8 2026,
 * when 02:00 becomes 03:00) and between the time columns and the all-day row.
 */

/** Columns are 100 pixels wide under a 40-pixel all-day row; each hour is 40 pixels tall. */
const ALL_DAY_HEIGHT = 40;
const HOUR_HEIGHT = 40;
const COLUMN_WIDTH = 100;

function firstDate() {
  return Temporal.PlainDate.from(document.querySelector("[data-date]")!.getAttribute("data-date")!);
}

/** Where a date's all-day cell is, or the line for a wall time in its column. */
function point(date: string, time?: string) {
  const x = firstDate().until(Temporal.PlainDate.from(date)).days * COLUMN_WIDTH + COLUMN_WIDTH / 2;
  if (time === undefined) return { x, y: ALL_DAY_HEIGHT / 2 };
  const { hour, minute } = Temporal.PlainTime.from(time);
  return { x, y: ALL_DAY_HEIGHT + (hour + minute / 60) * HOUR_HEIGHT };
}

// jsdom has no layout: hit-test and measure the cells by position.
document.elementsFromPoint = (x: number, y: number) => {
  const date = firstDate()
    .add({ days: Math.floor(x / COLUMN_WIDTH) })
    .toString();
  const cell = document.querySelector(
    y < ALL_DAY_HEIGHT
      ? `[data-date="${date}"][data-all-day]`
      : `[data-date="${date}"]:not([data-all-day])`,
  );
  return cell === null ? [] : [cell];
};
/** Gives a time column its rectangle, which the pointer layer reads to map heights to times. */
function measureColumn(column: HTMLElement | null) {
  if (column === null) return;
  column.getBoundingClientRect = () =>
    DOMRect.fromRect({
      height: 24 * HOUR_HEIGHT,
      width: COLUMN_WIDTH,
      x: firstDate().until(Temporal.PlainDate.from(column.dataset.date!)).days * COLUMN_WIDTH,
      y: ALL_DAY_HEIGHT,
    });
}

const slotTimes = Array.from({ length: 96 }, (_, index) =>
  Temporal.PlainTime.from("00:00").add({ minutes: index * 15 }),
);

function Slot({
  date,
  time,
}: {
  readonly date: Temporal.PlainDate;
  readonly time: Temporal.PlainTime;
}) {
  const key = `${date.toString()}T${time.toString({ smallestUnit: "minute" })}`;
  return <button data-slot={key} type="button" {...useRovingFocus({ date, kind: "slot", time })} />;
}

function AllDayCell({ date }: { readonly date: Temporal.PlainDate }) {
  return (
    <div data-all-day="" data-date={date.toString()} {...useRovingFocus({ date, kind: "day" })} />
  );
}

function TimedEvent({
  date,
  eventId,
}: {
  readonly date: Temporal.PlainDate;
  readonly eventId: EventId;
}) {
  return (
    <div {...eventIdAttributes(eventId)} {...useRovingFocus({ date, eventId, kind: "event" })}>
      <span data-resize="start" />
      <span data-resize="end" />
    </div>
  );
}

function AllDayEvent({
  date,
  segment,
}: {
  readonly date: Temporal.PlainDate;
  readonly segment: DayGridSegment<unknown, EventId, ResourceId>;
}) {
  const { id } = segment.event;
  const roving = useRovingFocus({ date, eventId: id, kind: "event" }, { days: segment.span });
  return <div {...eventIdAttributes(id)} {...roving} />;
}

function TimeGridView({
  actions,
  environment,
  events,
  projection,
}: CalendarViewRendererProps<TimeGridProjection<unknown>, undefined>) {
  const columns = useMemo(() => projection.days.map(({ column }) => column), [projection.days]);
  const pointerRef = useCalendarPointer({
    announcer: useCalendarAnnouncer(),
    columns,
    events,
    onPropose: actions.proposeEventChange,
    timeZone: environment.timeZone,
  });
  const start = projection.allDay.range.start;
  return (
    <div ref={pointerRef} {...useCalendarKeyboard()}>
      {projection.days.map(({ column, events: layouts }) => (
        <section key={column.key}>
          <AllDayCell date={column.date} />
          <div ref={measureColumn} data-date={column.date.toString()}>
            {slotTimes.map((time) => (
              <Slot key={time.toString()} date={column.date} time={time} />
            ))}
            {layouts.map(({ fragment }) => (
              <TimedEvent
                key={String(fragment.event.id)}
                date={fragment.date}
                eventId={fragment.event.id}
              />
            ))}
          </div>
        </section>
      ))}
      {projection.allDay.segments.map((segment) => (
        <AllDayEvent
          key={String(segment.event.id)}
          date={start.add({ days: segment.column })}
          segment={segment}
        />
      ))}
    </div>
  );
}

const parity = createParity(
  defineCalendarView({
    name: "three-days",
    strategy: timeGridStrategy({ count: 3, kind: "days" }),
    Renderer: TimeGridView,
  }),
);
afterEach(parity.unmount);

/** March 7 to 9 2026, with the spring-forward change on March 8. */
const anchor = "2026-03-07";

const eventElement = (container: Element, id: string, part = "") =>
  container.querySelector(`[data-event-id="${id}"] ${part}`.trim())!;
const slotElement = (container: Element, slot: string) =>
  container.querySelector(`[data-slot="${slot}"]`)!;

function wall(change: Change | undefined): string {
  const proposed = change?.proposed;
  if (proposed == null) return "none";
  if (proposed.kind !== "timed") {
    return `${proposed.kind} ${proposed.start.toString()}/${proposed.end.toString()}`;
  }
  const local = (instant: Temporal.Instant) =>
    instant
      .toZonedDateTimeISO(timeZone)
      .toString({ smallestUnit: "minute", timeZoneName: "never" });
  return `${local(proposed.start)}/${local(proposed.end)}`;
}

const repeat = (key: string, times: number) => Array.from({ length: times }, () => key);

describe("keyboard and pointer changes match in a time grid", () => {
  test("move an event a day later and an hour down, onto the spring-forward day", async () => {
    const events = [timed("standup", "2026-03-07T09:00", "2026-03-07T10:00")];
    const byPointer = await parity.mount(events, anchor);
    await drag(
      eventElement(byPointer.container, "standup"),
      point("2026-03-07", "09:00"),
      point("2026-03-08", "10:00"),
    );
    const pointerSaid = byPointer.spoken();

    const byKeyboard = await parity.mount(events, anchor);
    await keys(eventElement(byKeyboard.container, "standup"), [
      " ",
      ...repeat("ArrowDown", 4),
      "ArrowRight",
      "Enter",
    ]);

    expect(byKeyboard.changes).toEqual(byPointer.changes);
    expect(wall(byPointer.changes[0])).toBe("2026-03-08T10:00-04:00/2026-03-08T11:00-04:00");
    expect(byKeyboard.spoken()).toBe(pointerSaid);
  });

  test("resize an event's end down by two slots", async () => {
    const events = [timed("focus", "2026-03-09T09:00", "2026-03-09T10:00")];
    const byPointer = await parity.mount(events, anchor);
    await drag(
      eventElement(byPointer.container, "focus", '[data-resize="end"]'),
      point("2026-03-09", "10:00"),
      point("2026-03-09", "10:30"),
    );

    const byKeyboard = await parity.mount(events, anchor);
    await keys(eventElement(byKeyboard.container, "focus"), [
      shiftSpace,
      "ArrowDown",
      "ArrowDown",
      "Enter",
    ]);

    expect(byKeyboard.changes).toEqual(byPointer.changes);
    expect(byPointer.changes[0]).toMatchObject({ cause: "resize-end" });
    expect(wall(byPointer.changes[0])).toBe("2026-03-09T09:00-04:00/2026-03-09T10:30-04:00");
  });

  test("resize an event's start up by two slots", async () => {
    const events = [timed("focus", "2026-03-09T09:00", "2026-03-09T10:00")];
    const byPointer = await parity.mount(events, anchor);
    await drag(
      eventElement(byPointer.container, "focus", '[data-resize="start"]'),
      point("2026-03-09", "09:00"),
      point("2026-03-09", "08:30"),
    );

    const byKeyboard = await parity.mount(events, anchor);
    await keys(eventElement(byKeyboard.container, "focus"), [
      shiftSpace,
      shiftSpace,
      "ArrowUp",
      "ArrowUp",
      "Enter",
    ]);

    expect(byKeyboard.changes).toEqual(byPointer.changes);
    expect(byPointer.changes[0]).toMatchObject({ cause: "resize-start" });
  });

  test("create an hour-long event on a slot", async () => {
    const byPointer = await parity.mount([], anchor);
    await drag(
      byPointer.container.querySelector('[data-date="2026-03-09"]:not([data-all-day])')!,
      point("2026-03-09", "13:05"),
      point("2026-03-09", "13:50"),
    );

    const byKeyboard = await parity.mount([], anchor);
    await keys(slotElement(byKeyboard.container, "2026-03-09T13:00"), [" ", "Enter"]);

    expect(byKeyboard.changes).toEqual(byPointer.changes);
    expect(wall(byPointer.changes[0])).toBe("2026-03-09T13:00-04:00/2026-03-09T14:00-04:00");
  });

  test("create across the hour the spring-forward change removes", async () => {
    const byPointer = await parity.mount([], anchor);
    await drag(
      byPointer.container.querySelector('[data-date="2026-03-08"]:not([data-all-day])')!,
      point("2026-03-08", "01:35"),
      point("2026-03-08", "03:20"),
    );

    const byKeyboard = await parity.mount([], anchor);
    await keys(slotElement(byKeyboard.container, "2026-03-08T01:30"), [" ", "Enter"]);

    expect(byKeyboard.changes).toEqual(byPointer.changes);
    // An hour of elapsed time: 01:30 standard time to 03:30 daylight time.
    expect(wall(byPointer.changes[0])).toBe("2026-03-08T01:30-05:00/2026-03-08T03:30-04:00");
  });

  test("move a timed event up into the all-day row", async () => {
    const events = [timed("run", "2026-03-09T01:00", "2026-03-09T02:00")];
    const byPointer = await parity.mount(events, anchor);
    await drag(
      eventElement(byPointer.container, "run"),
      point("2026-03-09", "01:00"),
      point("2026-03-09"),
    );

    const byKeyboard = await parity.mount(events, anchor);
    await keys(eventElement(byKeyboard.container, "run"), [" ", ...repeat("ArrowUp", 5), "Enter"]);

    expect(byKeyboard.changes).toEqual(byPointer.changes);
    expect(wall(byPointer.changes[0])).toBe("all-day 2026-03-09/2026-03-10");
  });

  test("move an all-day event down into the first slot", async () => {
    const events = [allDay("offsite", "2026-03-07", "2026-03-08")];
    const byPointer = await parity.mount(events, anchor);
    await drag(
      eventElement(byPointer.container, "offsite"),
      point("2026-03-07"),
      point("2026-03-07", "00:00"),
    );

    const byKeyboard = await parity.mount(events, anchor);
    await keys(eventElement(byKeyboard.container, "offsite"), [" ", "ArrowDown", "Enter"]);

    expect(byKeyboard.changes).toEqual(byPointer.changes);
    expect(wall(byPointer.changes[0])).toBe("2026-03-07T00:00-05:00/2026-03-07T01:00-05:00");
  });
});
