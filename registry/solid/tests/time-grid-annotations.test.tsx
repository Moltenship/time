// @vitest-environment jsdom

import {
  createCalendar,
  createCanonicalEventAdapter,
  type AnyCalendarView,
  type CalendarAnnotation,
  type CalendarFocus,
} from "@moltenship/calendar-solid";
import { For } from "solid-js";
import { expect, test } from "vite-plus/test";

import {
  AnnotationMark,
  AnnotationRail,
  type AnnotationMarkElementProps,
  type TimeGridAnnotationMarkData,
  type TimeGridAnnotationSource,
  type TimeGridAnnotationsProps,
} from "@registry/time-grid-view/time-grid-annotations";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import { createDayView, createWeekView } from "@registry/time-grid-view/time-grid-view";

import { focus, press, render, settled } from "./render";
import { anchorDate, ariaLabel, clock, text, timed, type ColoredEvent } from "./view-fixtures";

// The React time grid's annotation tests (registry/tests/time-grid-annotations.test.tsx), in
// Solid: the same rail, marks, moved events and descriptions. The layout and the descriptions are
// shared code, which React's tests cover on their own.

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

function MusicIcon(props: { readonly class?: string }) {
  return <svg class={props.class} data-icon="music" />;
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

let actions: { setFocus(focus: CalendarFocus): void } | undefined;

async function renderDay({
  data = annotations,
  dayEvents = events,
  defaultFocus = null,
  editable = false,
  sources = [sleep, music],
  view = createDayView<ColoredEvent>(),
}: {
  readonly data?: readonly CalendarAnnotation<unknown, string>[];
  readonly dayEvents?: readonly ColoredEvent[];
  readonly defaultFocus?: CalendarFocus | null;
  readonly editable?: boolean;
  readonly sources?: readonly TimeGridAnnotationSource[];
  readonly view?: ReturnType<typeof createDayView<ColoredEvent>>;
} = {}) {
  const Calendar = calendarWith(view);
  function Actions() {
    actions = Calendar.useCalendarActions();
    return null;
  }
  const { container } = await render(() => (
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
      {...(editable
        ? {
            createEvent: (change: { readonly proposed: object }, id: string) => ({
              ...change.proposed,
              data: { color: "blue" as const },
              id,
              title: "New event",
            }),
            onEventChange: () => {},
          }
        : {})}
      weekRules={{ firstDay: 7, minimalDays: 1, weekend: [6, 7] }}
    >
      <Actions />
      <Calendar.ActiveView />
    </Calendar.Root>
  ));
  return container;
}

/** Focuses the grid's tab stop once the calendar's focus is on the day's `time`. */
async function focusSlot(container: HTMLElement, time: string) {
  actions!.setFocus({ date: anchorDate, kind: "slot", time: Temporal.PlainTime.from(time) });
  await settled();
  await focus(container.querySelector('[role="grid"] [tabindex="0"]'));
}

const marks = (container: ParentNode) =>
  [...container.querySelectorAll<HTMLElement>('[data-slot="annotation-mark"]')].map((mark) => ({
    id: mark.getAttribute("data-annotation-id"),
    kind: mark.getAttribute("data-kind"),
    source: mark.getAttribute("data-source"),
  }));

/** Each event's inline start and width, by ID. */
const lanes = (container: ParentNode) =>
  Object.fromEntries(
    [...container.querySelectorAll<HTMLElement>('[data-slot="calendar-event"]')].map((event) => [
      event.getAttribute("data-event-id"),
      [event.style.insetInlineStart, event.style.width],
    ]),
  );

const lunch = timed("lunch", "2026-10-08T12:00Z", "2026-10-08T13:00Z");

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

test("moves aside only the events beside a mark, and the events they share lanes with", async () => {
  const container = await renderDay({
    dayEvents: [
      timed("standup", "2026-10-08T09:00Z", "2026-10-08T09:45Z"),
      timed("planning", "2026-10-08T09:30Z", "2026-10-08T10:15Z"),
      lunch,
    ],
  });

  expect(lanes(container)).toEqual({
    // Lunch is clear of every mark, so it keeps the column's whole width.
    lunch: ["0%", "100%"],
    // The 9:00 listening session draws as a 20px dot, to 9:25. Planning starts after it, but
    // shares its lanes with standup, which crosses it.
    planning: ["calc(30px + 0.5 * (100% - 30px))", "calc(0.5 * (100% - 30px))"],
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
  expect(lanes(await renderDay({ sources: [] }))).toEqual(unmoved);
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
  expect(container.querySelectorAll('[data-slot="calendar-event"]')).toHaveLength(2);
});

test("a new event's draft moves aside beside a mark, as an event would", async () => {
  const container = await renderDay({ dayEvents: [], editable: true });
  const draft = () => container.querySelector<HTMLElement>('[data-slot="time-grid-draft"]')!.style;

  await focusSlot(container, "12:00");
  await press(" ");
  expect([draft().insetInlineStart, draft().insetInlineEnd]).toEqual(["", ""]);
  await press("Escape");

  // An hour from 17:30 reaches the music at 18:00.
  await focusSlot(container, "17:30");
  await press(" ");
  expect([draft().insetInlineStart, draft().insetInlineEnd]).toEqual(["30px", "0px"]);
});

test("an event a keyboard move takes beside a mark moves aside and keeps focus", async () => {
  const container = await renderDay({ dayEvents: [lunch], editable: true });
  await focusSlot(container, "12:00");
  await press("Enter");
  const event = document.activeElement as HTMLElement;
  expect(event.getAttribute("data-event-id")).toBe("lunch");
  expect(event.style.insetInlineStart).toBe("0%");

  // Down from 12:00 to 17:30, an hour that reaches the music at 18:00.
  await press(" ");
  for (let step = 0; step < 22; step += 1) await press("ArrowDown");

  // The same element, so focus stays on it.
  expect(document.activeElement).toBe(event);
  expect(event.style.insetInlineStart).toBe("calc(30px + 0 * (100% - 30px))");
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

test("a view draws a custom composition of the parts", async () => {
  function Bars(props: TimeGridAnnotationsProps) {
    return (
      <AnnotationRail class="custom-rail">
        <For each={props.marks} keyed={(mark: TimeGridAnnotationMarkData) => mark.key}>
          {(mark) => (
            <AnnotationMark
              mark={mark()}
              render={(markProps) => <div {...markProps} data-custom="" />}
              variant="bar"
            />
          )}
        </For>
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

test("a mark's render element runs its own handler beside the mark's", async () => {
  const pressed: string[] = [];
  function Bars(props: TimeGridAnnotationsProps) {
    const element = (key: string, markProps: AnnotationMarkElementProps) => (
      <div
        {...markProps}
        data-custom=""
        onMouseDown={(event) => {
          pressed.push(key);
          (markProps.onMouseDown as (event: MouseEvent) => void)(event);
        }}
      />
    );
    return (
      <AnnotationRail>
        <For each={props.marks} keyed={(mark: TimeGridAnnotationMarkData) => mark.key}>
          {(mark) => (
            <AnnotationMark mark={mark()} render={(markProps) => element(mark().key, markProps)} />
          )}
        </For>
      </AnnotationRail>
    );
  }
  const container = await renderDay({
    view: createDayView<ColoredEvent>({ annotations: { Annotations: Bars } }),
  });
  const mark = container.querySelector<HTMLElement>("[data-custom]")!;
  const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
  mark.dispatchEvent(press);

  expect(pressed).toHaveLength(1);
  // The mark's own handler keeps a press from focusing it in the aria-hidden rail.
  expect(press.defaultPrevented).toBe(true);
  expect(mark.dataset.slot).toBe("annotation-mark");
});

test("a week view draws each day's annotations in its own column", async () => {
  const Calendar = calendarWith(createWeekView<ColoredEvent>());
  const { container } = await render(() => (
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
    </Calendar.Root>
  ));
  const perDay = [...container.querySelectorAll('[role="gridcell"][data-date]')].map((cell) => [
    cell.getAttribute("data-date"),
    cell.querySelectorAll('[data-slot="annotation-mark"]').length,
  ]);

  // Sleep crosses midnight into Thursday's column too.
  expect(perDay.filter(([, count]) => count !== 0)).toEqual([
    ["2026-10-07", 1],
    ["2026-10-08", 3],
  ]);
});
