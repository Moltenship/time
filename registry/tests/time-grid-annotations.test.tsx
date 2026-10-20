// @vitest-environment jsdom

import {
  createAnnotationSnapshot,
  createCalendar,
  createCanonicalEventAdapter,
  plainDateInterval,
  projectTimeGridAnnotations,
  timeGridColumns,
  type AnyCalendarView,
  type CalendarAnnotation,
  type CalendarFocus,
} from "@moltenship/calendar";
import {
  cleanup as cleanupHarness,
  createTestEnvironment,
  renderCalendar,
} from "@moltenship/calendar-testing";
import { MusicIcon } from "lucide-react";
import { afterEach, describe, expect, test } from "vite-plus/test";

import { annotationFormats, describeAnnotationsAt } from "../time-grid-view/annotation-label";
import {
  AnnotationMark,
  AnnotationRail,
  DEFAULT_COLUMN_HEIGHT,
  eventsBesideMarks,
  type TimeGridAnnotationLayout,
  type TimeGridAnnotationSource,
  type TimeGridAnnotationsProps,
} from "../time-grid-view/time-grid-annotations";
import { createDayView, createWeekView } from "../time-grid-view/time-grid-view";
import { render } from "./render";
import { anchorDate, ariaLabel, clock, text, timed, type ColoredEvent } from "./view-fixtures";
import type { CalendarEventColor } from "../calendar-theme/event-colors";

/** A calendar with just `view`, so day and week each register under their own name. */
function calendarWith<TView extends AnyCalendarView<ColoredEvent>>(view: TView) {
  return createCalendar<ColoredEvent, never>()({
    eventAdapter: createCanonicalEventAdapter<
      { readonly color: CalendarEventColor },
      string | number
    >(),
    views: [view],
  });
}

function annotation(
  id: string,
  sourceId: string,
  start: string,
  end: string,
): CalendarAnnotation<unknown, string> {
  return {
    end: Temporal.Instant.from(end),
    id,
    sourceId,
    start: Temporal.Instant.from(start),
    title: id,
  };
}

const music: TimeGridAnnotationSource = {
  color: "green",
  Icon: MusicIcon,
  id: "music",
  label: "Music",
  mergeGap: Temporal.Duration.from({ minutes: 5 }),
};
const sleep: TimeGridAnnotationSource = { color: "purple", id: "sleep", label: "Sleep" };

// Thursday 2026-10-08 in UTC.
const events = [
  timed("standup", "2026-10-08T09:00Z", "2026-10-08T09:30Z"),
  timed("review", "2026-10-08T09:15Z", "2026-10-08T10:00Z"),
];
const annotations = [
  annotation("night", "sleep", "2026-10-07T23:00Z", "2026-10-08T07:00Z"),
  annotation("Nightcall", "music", "2026-10-08T09:00Z", "2026-10-08T09:04Z"),
  annotation("Genesis", "music", "2026-10-08T09:05Z", "2026-10-08T09:09Z"),
  annotation("Intro", "music", "2026-10-08T18:00Z", "2026-10-08T18:03Z"),
];

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
  cleanupHarness();
});

async function renderDay({
  data = annotations,
  dayEvents = events,
  defaultFocus = null,
  sources = [sleep, music],
  view = createDayView<ColoredEvent>(),
}: {
  readonly data?: readonly CalendarAnnotation<unknown, string>[];
  readonly dayEvents?: readonly ColoredEvent[];
  readonly defaultFocus?: CalendarFocus | null;
  readonly sources?: readonly TimeGridAnnotationSource[];
  readonly view?: ReturnType<typeof createDayView<ColoredEvent>>;
} = {}) {
  const Calendar = calendarWith(view);
  const rendered = await render(
    <Calendar.Root
      annotationSources={sources}
      annotations={data}
      clock={clock}
      defaultAnchorDate={anchorDate}
      defaultFocus={defaultFocus}
      defaultTimeZone="UTC"
      defaultView="day"
      events={dayEvents}
      locale="en-US"
      weekRules={{ firstDay: 7, minimalDays: 1, weekend: [6, 7] }}
    >
      <Calendar.ActiveView />
    </Calendar.Root>,
  );
  cleanup = rendered.unmount;
  return rendered.container;
}

const marks = (container: ParentNode) =>
  [...container.querySelectorAll<HTMLElement>('[data-slot="annotation-mark"]')].map((mark) => ({
    id: mark.getAttribute("data-annotation-id"),
    kind: mark.getAttribute("data-kind"),
    source: mark.getAttribute("data-source"),
  }));

const eventBoxes = (container: ParentNode) =>
  [...container.querySelectorAll<HTMLElement>('[data-slot="calendar-event"]')].map(({ style }) => [
    style.top,
    style.height,
    style.insetInlineStart,
    style.width,
  ]);

test("draws the root's annotations in a rail, merged per source, with short ones as dots", async () => {
  const container = await renderDay();

  expect(marks(container)).toEqual([
    { id: "night", kind: "bar", source: "sleep" },
    { id: "Nightcall", kind: "dot", source: "music" },
    { id: "Intro", kind: "dot", source: "music" },
  ]);
  const rail = container.querySelector('[data-slot="annotation-rail"]');
  expect(rail?.getAttribute("aria-hidden")).toBe("true");
  expect(rail?.querySelectorAll("[tabindex='0']")).toHaveLength(0);
  // Pressing a mark never starts a drag.
  for (const mark of rail!.querySelectorAll('[data-slot="annotation-mark"]')) {
    expect(mark.getAttribute("data-calendar-pointer")).toBe("none");
  }
  // The icon draws inside the music marks; sleep has none.
  expect(container.querySelectorAll('[data-slot="annotation-mark-icon"]')).toHaveLength(2);
});

/** Each event's inline start and width, by ID. */
const lanes = (container: ParentNode) =>
  Object.fromEntries(
    [...container.querySelectorAll<HTMLElement>('[data-slot="calendar-event"]')].map((event) => [
      event.getAttribute("data-event-id"),
      [event.style.insetInlineStart, event.style.width],
    ]),
  );

const lunch = timed("lunch", "2026-10-08T12:00Z", "2026-10-08T13:00Z");

test("moves aside only the events beside a mark, and the events they share lanes with", async () => {
  const container = await renderDay({ dayEvents: [...events, lunch] });

  expect(lanes(container)).toEqual({
    // Lunch is clear of every mark, so it keeps the column's whole width.
    lunch: ["0%", "100%"],
    // Review misses the 9:00 listening session, but shares its lanes with standup, which doesn't.
    review: ["calc(30px + 0.5 * (100% - 30px))", "calc(0.5 * (100% - 30px))"],
    standup: ["calc(30px + 0 * (100% - 30px))", "calc(0.5 * (100% - 30px))"],
  });
  // The event area itself stays put: one container for every event, so none remounts as it moves.
  const area = container.querySelector('[data-slot="calendar-event"]')!.parentElement!;
  expect(area.getAttribute("style")).toBeNull();
  expect(area.querySelectorAll('[data-slot="calendar-event"]')).toHaveLength(3);
});

test("a rail at the column's end takes its strip from there, past the strip kept for creating", async () => {
  const container = await renderDay({
    view: createDayView<ColoredEvent>({ annotations: { rail: { side: "end" } } }),
  });

  // The rail's 30px and its 2px gap, less the 8px the event area already keeps free.
  expect(lanes(container)).toEqual({
    review: ["calc(0px + 0.5 * (100% - 24px))", "calc(0.5 * (100% - 24px))"],
    standup: ["calc(0px + 0 * (100% - 24px))", "calc(0.5 * (100% - 24px))"],
  });
});

test("moves nothing without marks beside events, without sources or in an overlay", async () => {
  const unmoved = { review: ["50%", "50%"], standup: ["0%", "50%"] };
  expect(lanes(await renderDay({ data: [] }))).toEqual(unmoved);
  await cleanup?.();
  expect(lanes(await renderDay({ sources: [] }))).toEqual(unmoved);
  await cleanup?.();
  expect(
    lanes(
      await renderDay({
        view: createDayView<ColoredEvent>({ annotations: { placement: "overlay" } }),
      }),
    ),
  ).toEqual(unmoved);
});

test("reserves no rail when the root has no annotation sources", async () => {
  const container = await renderDay({ sources: [] });

  expect(container.querySelector('[data-slot="annotation-rail"]')).toBeNull();
  expect(eventBoxes(container)).toHaveLength(2);
});

test("a new event's draft moves aside beside a mark, as an event would", async () => {
  const Calendar = calendarWith(createDayView<ColoredEvent>());
  const calendar = await renderCalendar(Calendar, {
    children: <Calendar.ActiveView />,
    createEvent: (change, id) => ({
      ...change.proposed,
      data: { color: "blue" as const },
      id,
      title: "New event",
    }),
    environment: createTestEnvironment({
      weekRules: { firstDay: 7, minimalDays: 1, weekend: [6, 7] },
    }),
    events: [],
    rootProps: { annotationSources: [sleep, music], annotations },
    view: "day",
  });
  const draft = () =>
    calendar.container.querySelector<HTMLElement>('[data-slot="time-grid-draft"]')!.style;

  await calendar.keyboard.focusCell({ date: anchorDate, time: "12:00" });
  await calendar.keyboard.grab();
  expect([draft().insetInlineStart, draft().insetInlineEnd]).toEqual(["", ""]);
  await calendar.keyboard.cancel();

  // An hour from 17:30 reaches the music at 18:00.
  await calendar.keyboard.focusCell({ date: anchorDate, time: "17:30" });
  await calendar.keyboard.grab();
  expect([draft().insetInlineStart, draft().insetInlineEnd]).toEqual(["30px", "0px"]);
});

describe("events beside marks", () => {
  // The day view's rail at the default hour height: marks are 20px, 25 minutes, at their shortest.
  const minHeight = 20 / DEFAULT_COLUMN_HEIGHT;
  const rail: TimeGridAnnotationLayout = {
    columns: [],
    enabled: true,
    minHeight,
    options: {},
    placement: "rail",
    rail: { layout: "pack", markWidth: 20, side: "start", width: 30 },
  };
  const at = (time: string) => {
    if (time === "24:00") return 1;
    const { hour, minute } = Temporal.PlainTime.from(time);
    return (hour * 60 + minute) / (24 * 60);
  };
  const band = (start: string, end: string) => ({ height: at(end) - at(start), top: at(start) });
  function marksOf(...items: CalendarAnnotation<unknown, string>[]) {
    const columns = timeGridColumns(
      plainDateInterval(anchorDate, anchorDate.add({ days: 1 })),
      "UTC",
    );
    const [marks] = projectTimeGridAnnotations(columns, createAnnotationSnapshot(items), [music], {
      minHeight,
    });
    return marks!;
  }
  const session = marksOf(annotation("Session", "music", "2026-10-08T12:00Z", "2026-10-08T13:40Z"));

  test("an event away from every mark keeps the column's width", () => {
    expect(
      eventsBesideMarks(rail, session, [band("00:00", "01:00"), band("12:30", "13:00")]),
    ).toEqual([false, true]);
  });

  test("a group of overlapping events moves as one when any of them is beside a mark", () => {
    // 11:00–12:30 crosses the session, and 10:00–11:30 overlaps it; 09:00–10:00 only meets them.
    expect(
      eventsBesideMarks(rail, session, [
        band("10:00", "11:30"),
        band("11:00", "12:30"),
        band("09:00", "10:00"),
      ]),
    ).toEqual([true, true, false]);
  });

  test("an event that only meets a mark stays put", () => {
    expect(
      eventsBesideMarks(rail, session, [band("11:00", "12:00"), band("13:40", "14:00")]),
    ).toEqual([false, false]);
  });

  test("a short mark counts as tall as the rail draws it, up from midnight near the day's end", () => {
    const short = marksOf(
      annotation("Intro", "music", "2026-10-08T18:00Z", "2026-10-08T18:03Z"),
      annotation("Late", "music", "2026-10-08T23:58Z", "2026-10-09T00:00Z"),
    );

    // Intro draws 18:00–18:25, and Late 23:35–24:00.
    expect(
      eventsBesideMarks(rail, short, [
        band("18:15", "18:30"),
        band("18:30", "19:00"),
        band("23:30", "23:45"),
      ]),
    ).toEqual([true, false, true]);
    expect(eventsBesideMarks(rail, short, [band("23:00", "23:35")])).toEqual([false]);
  });
});

test("hides a source left out of annotationSources", async () => {
  const container = await renderDay({ sources: [music] });

  expect(marks(container).map(({ source }) => source)).toEqual(["music", "music"]);
});

test("describes each day's annotations through its column header", async () => {
  const container = await renderDay();
  const header = container.querySelector('[role="columnheader"][aria-describedby]');

  // The merged 9:00–9:09 session and the three-minute track at 18:00.
  expect(text(document.getElementById(header!.getAttribute("aria-describedby")!))).toBe(
    "Annotations: Sleep until 7:00 AM. Music, 2 times, 12 minutes.",
  );
});

test("names the annotations under a focused slot", async () => {
  const container = await renderDay({
    defaultFocus: { date: anchorDate, kind: "slot", time: Temporal.PlainTime.from("09:00") },
  });

  expect(ariaLabel(container.querySelector('[role="button"][tabindex="0"]'))).toBe(
    "Thursday, October 8 at 9:00 AM, Music: Nightcall, 9:00 AM to 9:04 AM; Genesis, 9:05 AM to 9:09 AM",
  );
});

describe("slot descriptions", () => {
  const formats = (timeZone: string) => annotationFormats("en-US", timeZone);
  const slot = (time: string) => {
    const minutes = Temporal.PlainTime.from(time).hour * 60 + Temporal.PlainTime.from(time).minute;
    return { height: 15 / (24 * 60), top: minutes / (24 * 60) };
  };
  function layout(timeZone: string, date: string, items: CalendarAnnotation<unknown, string>[]) {
    const columns = timeGridColumns(
      plainDateInterval(
        Temporal.PlainDate.from(date),
        Temporal.PlainDate.from(date).add({ days: 1 }),
      ),
      timeZone,
    );
    const [marks] = projectTimeGridAnnotations(columns, createAnnotationSnapshot(items), [
      { id: "music", label: "Music", mergeGap: Temporal.Duration.from({ hours: 1 }) },
      { id: "sleep", label: "Sleep" },
    ]);
    return { column: columns[0]!, marks: marks! };
  }

  test("name only the items drawn across the slot, not the gaps inside a merged mark", () => {
    const { column, marks } = layout("UTC", "2026-10-08", [
      annotation("Nightcall", "music", "2026-10-08T09:00Z", "2026-10-08T09:05Z"),
      annotation("Genesis", "music", "2026-10-08T09:40Z", "2026-10-08T09:45Z"),
    ]);

    expect(marks).toHaveLength(1);
    expect(describeAnnotationsAt(marks, column, slot("09:15"), formats("UTC"))).toBeUndefined();
    expect(describeAnnotationsAt(marks, column, slot("09:30"), formats("UTC"))).toBe(
      "Music: Genesis, 9:40 AM to 9:45 AM",
    );
  });

  test("name both occurrences of a repeated hour and nothing in a skipped one", () => {
    const zone = "America/New_York";
    const fold = layout(zone, "2026-11-01", [
      annotation("Sleep", "sleep", "2026-11-01T05:05Z", "2026-11-01T05:10Z"),
      annotation("Repeat", "music", "2026-11-01T06:05Z", "2026-11-01T06:10Z"),
    ]);
    expect(describeAnnotationsAt(fold.marks, fold.column, slot("01:00"), formats(zone))).toBe(
      "Music: Repeat, 1:05 AM to 1:10 AM. Sleep: 1:05 AM to 1:10 AM",
    );

    // 02:30 doesn't exist on March 8; the 03:30 item draws in its own slot only.
    const gap = layout(zone, "2026-03-08", [
      annotation("Later", "music", "2026-03-08T07:30Z", "2026-03-08T07:45Z"),
    ]);
    expect(describeAnnotationsAt(gap.marks, gap.column, slot("02:30"), formats(zone))).toBe(
      undefined,
    );
    expect(describeAnnotationsAt(gap.marks, gap.column, slot("03:30"), formats(zone))).toBe(
      "Music: Later, 3:30 AM to 3:45 AM",
    );
  });

  test("count the items past five, as the details popover does", () => {
    const { column, marks } = layout(
      "UTC",
      "2026-10-08",
      Array.from({ length: 7 }, (_, index) =>
        annotation(
          `T${index}`,
          "music",
          `2026-10-08T09:0${index}:00Z`,
          `2026-10-08T09:0${index}:30Z`,
        ),
      ),
    );

    expect(describeAnnotationsAt(marks, column, slot("09:00"), formats("UTC"))).toMatch(
      /T4, 9:04 AM to 9:04 AM; and 2 more$/,
    );
  });
});

test("a view draws a custom composition of the parts", async () => {
  function Bars({ marks: columnMarks }: TimeGridAnnotationsProps) {
    return (
      <AnnotationRail className="custom-rail">
        {columnMarks.map((mark) => (
          <AnnotationMark key={mark.key} mark={mark} variant="bar" data-custom="" />
        ))}
      </AnnotationRail>
    );
  }
  const container = await renderDay({
    view: createDayView<ColoredEvent>({
      annotations: { Annotations: Bars, rail: { markWidth: 4, width: 10 } },
    }),
  });

  expect(container.querySelector(".custom-rail")).not.toBeNull();
  expect(container.querySelectorAll("[data-custom]")).toHaveLength(3);
  expect(container.querySelectorAll('[data-slot="annotation-mark-icon"]')).toHaveLength(0);
  expect(lanes(container).standup).toEqual([
    "calc(10px + 0 * (100% - 10px))",
    "calc(0.5 * (100% - 10px))",
  ]);
});

test("a week view draws each day's annotations in its own column", async () => {
  const Calendar = calendarWith(createWeekView<ColoredEvent>());
  const rendered = await render(
    <Calendar.Root
      annotationSources={[sleep, music]}
      annotations={annotations}
      clock={clock}
      defaultAnchorDate={anchorDate}
      defaultTimeZone="UTC"
      defaultView="week"
      events={events}
      locale="en-US"
      weekRules={{ firstDay: 7, minimalDays: 1, weekend: [6, 7] }}
    >
      <Calendar.ActiveView />
    </Calendar.Root>,
  );
  cleanup = rendered.unmount;
  const perDay = [...rendered.container.querySelectorAll('[role="gridcell"][data-date]')].map(
    (cell) => [
      cell.getAttribute("data-date"),
      cell.querySelectorAll('[data-slot="annotation-mark"]').length,
    ],
  );

  // Sleep crosses midnight into Thursday's column too.
  expect(perDay.filter(([, count]) => count !== 0)).toEqual([
    ["2026-10-07", 1],
    ["2026-10-08", 3],
  ]);
});
