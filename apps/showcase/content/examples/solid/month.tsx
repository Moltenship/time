// #region month
import {
  defineCalendarView,
  eventIdAttributes,
  getMonthRange,
  getMonthTitle,
  monthSpatialNavigation,
  navigateMonth,
  projectMonth,
  useCalendarAnnouncer,
  useCalendarDraftReporter,
  useCalendarKeyboard,
  useCalendarPointer,
  useRovingFocus,
  type CalendarViewRendererProps,
  type DayGridSegment,
  type MonthDay,
  type MonthProjection,
} from "@moltenship/calendar-solid";
import { For } from "solid-js";

import type { Meeting } from "./calendar";

type Month = MonthProjection<Meeting, string, string>;

function Day(props: { readonly day: MonthDay; readonly column: number }) {
  // An accessor, so the cell registers again when a new projection hands it a new day.
  const roving = useRovingFocus(() => ({ date: props.day.date, kind: "day" }));
  return (
    <button
      {...roving}
      type="button"
      data-date={props.day.date.toString()}
      style={{ "grid-column": `${props.column + 1}` }}
    >
      {props.day.date.day}
    </button>
  );
}

function Chip(props: {
  readonly date: Temporal.PlainDate;
  readonly segment: DayGridSegment<Meeting, string, string>;
}) {
  const roving = useRovingFocus(
    () => ({ date: props.date, eventId: props.segment.event.id, kind: "event" }),
    () => ({ days: props.segment.span }),
  );
  return (
    <button
      {...roving}
      {...eventIdAttributes(props.segment.event.id)}
      type="button"
      style={{
        "grid-column": `${props.segment.column + 1} / span ${props.segment.span}`,
        "grid-row": `${props.segment.lane + 2}`,
      }}
    >
      {props.segment.event.title}
      <span data-resize="end" aria-hidden="true" />
    </button>
  );
}

function MonthGrid(props: CalendarViewRendererProps<Month, undefined>) {
  const keyboard = useCalendarKeyboard();
  // A drag speaks through the root's Announcer, and its draft shows in useCalendarDraft.
  const announcer = useCalendarAnnouncer();
  const onPreview = useCalendarDraftReporter();
  const pointer = useCalendarPointer(() => ({
    announcer,
    check: props.actions.checkEventChange,
    disabled: props.isReadOnly,
    events: props.events,
    onPreview,
    onPropose: props.actions.proposeEventChange,
    timeZone: props.environment.timeZone,
  }));
  return (
    <div ref={[keyboard, pointer]}>
      <For each={props.projection.weeks} keyed={(week) => week.range.start.toString()}>
        {(week) => (
          <div style={{ display: "grid", "grid-template-columns": "repeat(7, 1fr)" }}>
            <For each={week().days} keyed={(day) => day.date.toString()}>
              {(day, index) => <Day day={day()} column={index()} />}
            </For>
            {/* Keyed by event: a dropped chip keeps its element, and its focus. */}
            <For each={week().segments} keyed={(segment) => segment.event.id}>
              {(segment) => <Chip date={week().days[segment().column]!.date} segment={segment()} />}
            </For>
          </div>
        )}
      </For>
    </div>
  );
}

export const monthView = defineCalendarView({
  name: "month",
  strategy: {
    getRange: (anchor, environment) => getMonthRange(anchor, environment),
    getSpatialNavigation: monthSpatialNavigation,
    getTitle: (range, environment) => getMonthTitle(range, environment),
    navigate: (anchor, delta) => navigateMonth(anchor, delta),
    project: (input) => projectMonth(input) as Month,
  },
  Renderer: MonthGrid,
});
// #endregion month
