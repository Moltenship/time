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
import { MusicIcon } from "lucide-react";
import { afterEach, describe, expect, test } from "vite-plus/test";

import { annotationFormats, describeAnnotationsAt } from "../time-grid-view/annotation-label";
import {
  AnnotationMark,
  AnnotationRail,
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
});

async function renderDay({
  data = annotations,
  defaultFocus = null,
  sources = [sleep, music],
  view = createDayView<ColoredEvent>(),
}: {
  readonly data?: readonly CalendarAnnotation<unknown, string>[];
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
      events={events}
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

test("annotations never change event layout; sources reserve the same rail on every day", async () => {
  const strip = (container: ParentNode) =>
    container.querySelector<HTMLElement>('[data-slot="calendar-event"]')!.parentElement!.style
      .insetInlineStart;
  const withAnnotations = await renderDay();
  const [boxes, inset] = [eventBoxes(withAnnotations), strip(withAnnotations)];
  await cleanup?.();
  const empty = await renderDay({ data: [] });
  const [emptyBoxes, emptyInset] = [eventBoxes(empty), strip(empty)];
  await cleanup?.();
  const noSources = eventBoxes(await renderDay({ sources: [] }));

  // The data never moves or narrows an event: only the sources decide the rail's strip.
  expect(boxes).toEqual(emptyBoxes);
  expect(inset).toBe(emptyInset);
  expect(inset).toBe("30px");
  // Lanes and widths inside the strip match a calendar without annotations.
  expect(boxes).toEqual(noSources);
  expect(boxes).toHaveLength(2);
});

test("reserves no rail when the root has no annotation sources", async () => {
  const container = await renderDay({ sources: [] });

  expect(container.querySelector('[data-slot="annotation-rail"]')).toBeNull();
  const strip = container.querySelector<HTMLElement>(
    '[data-slot="calendar-event"]',
  )!.parentElement!;
  expect(strip.style.insetInlineStart).toBe("");
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
  const strip = container.querySelector<HTMLElement>(
    '[data-slot="calendar-event"]',
  )!.parentElement!;
  expect(strip.style.insetInlineStart).toBe("10px");
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
