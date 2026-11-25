import {
  defineEventAdapter,
  getMonthRange,
  getMonthTitle,
  monthSpatialNavigation,
  navigateMonth,
  projectMonth,
  type CalendarEventInterval,
  type DayGridSegment,
  type MonthDay,
  type MonthProjection,
} from "@moltenship/calendar-core";
import {
  createCalendar,
  defineCalendarView,
  eventIdAttributes,
  useCalendarAnnouncer,
  useCalendarDraftReporter,
  useCalendarInteraction,
  useCalendarKeyboard,
  useCalendarPointer,
  useRovingFocus,
  type CalendarViewRendererProps,
} from "@moltenship/calendar-solid";
import { For, Show } from "solid-js";

import { createAgendaView } from "@registry/list-view/agenda-view";

export interface Meeting {
  readonly id: string;
  readonly interval: CalendarEventInterval;
  /** An event nobody may change: the page's policy refuses it, for the agent and for drags. */
  readonly locked?: boolean;
  readonly title: string;
}

const adapter = defineEventAdapter<Meeting>()({
  getId: (event) => event.id,
  getInterval: (event) => event.interval,
  getResourceIds: () => [],
  getTitle: (event) => (event.locked === true ? `${event.title} (locked)` : event.title),
});

type Month = MonthProjection<Meeting, string, string>;
type Segment = DayGridSegment<Meeting, string, string>;

/**
 * A day: the keyboard's focus target for the date, which shows a keyboard create's range. Its
 * `data-date` is where a pointer drag lands.
 */
function DayCell(props: {
  readonly column: number;
  readonly day: MonthDay;
  readonly label: (date: Temporal.PlainDate) => string;
}) {
  const roving = useRovingFocus(() => ({ date: props.day.date, kind: "day" }));
  // A keyboard create covers the day.
  const inDraft = useCalendarInteraction(
    (session) =>
      session?.eventId === null &&
      session.proposed.kind === "all-day" &&
      Temporal.PlainDate.compare(session.proposed.start, props.day.date) <= 0 &&
      Temporal.PlainDate.compare(props.day.date, session.proposed.end) < 0,
  );
  return (
    <button
      {...roving}
      type="button"
      class="day"
      aria-current={props.day.isToday ? "date" : undefined}
      aria-label={props.label(props.day.date)}
      data-date={props.day.date.toString()}
      data-draft={inDraft() ? "" : undefined}
      data-today={props.day.isToday ? "" : undefined}
      data-outside={props.day.inMonth ? undefined : ""}
      style={{ "grid-column": `${props.column + 1}` }}
    >
      <span class="day-number">{props.day.date.day}</span>
    </button>
  );
}

/** One week's piece of an event, which the keyboard reaches on its first day. */
function Chip(props: { readonly date: Temporal.PlainDate; readonly segment: Segment }) {
  const roving = useRovingFocus(
    () => ({ date: props.date, eventId: props.segment.event.id, kind: "event" }),
    () => ({ days: props.segment.span }),
  );
  return (
    <button
      {...roving}
      {...eventIdAttributes(props.segment.event.id)}
      type="button"
      class="chip"
      data-pending={props.segment.event.isPending === true ? "" : undefined}
      data-locked={props.segment.event.event.locked === true ? "" : undefined}
      style={{
        "grid-column": `${props.segment.column + 1} / span ${props.segment.span}`,
        "grid-row": `${props.segment.lane + 2}`,
      }}
    >
      {/* Handles at the event's own ends; a piece that continues from another week has none. */}
      <Show when={!props.segment.startsBefore}>
        <span class="resize" data-resize="start" aria-hidden="true" />
      </Show>
      {props.segment.event.title}
      <Show when={!props.segment.endsAfter}>
        <span class="resize" data-resize="end" aria-hidden="true" />
      </Show>
    </button>
  );
}

function MonthGrid(props: CalendarViewRendererProps<Month, undefined>) {
  const keyboard = useCalendarKeyboard();
  // Pointer drags speak through the announcer's messages and show in the draft hooks too.
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
  const weekday = (date: Temporal.PlainDate) =>
    date.toLocaleString(props.environment.locale, { weekday: "short" });
  const label = (date: Temporal.PlainDate) =>
    date.toLocaleString(props.environment.locale, { dateStyle: "full" });
  return (
    <div class="month" data-view="month" ref={[keyboard, pointer]}>
      <div class="weekdays" aria-hidden="true">
        <For each={props.projection.weeks[0]?.days ?? []}>
          {(day) => <span>{weekday(day.date)}</span>}
        </For>
      </div>
      <For each={props.projection.weeks} keyed={(week) => week.range.start.toString()}>
        {(week) => (
          <div
            class="week"
            style={{
              "grid-template-rows": `1.75rem repeat(${week().laneCount}, 1.5rem) minmax(0.5rem, 1fr)`,
            }}
          >
            {/* By date: a new projection has new day objects, and a day keeps its element. */}
            <For each={week().days} keyed={(day) => day.date.toString()}>
              {(day, index) => <DayCell column={index()} day={day()} label={label} />}
            </For>
            {/* By event: a drop moves the chip, which keeps its element and its focus. */}
            <For each={week().segments} keyed={(segment) => segment.event.id}>
              {(segment) => <Chip date={week().days[segment().column]!.date} segment={segment()} />}
            </For>
          </div>
        )}
      </For>
    </div>
  );
}

const month = defineCalendarView({
  name: "month",
  Renderer: MonthGrid,
  strategy: {
    getRange: (anchor, environment) => getMonthRange(anchor, environment),
    getSpatialNavigation: monthSpatialNavigation,
    getTitle: (range, environment) => getMonthTitle(range, environment),
    navigate: (anchor, delta) => navigateMonth(anchor, delta),
    project: (input) => projectMonth(input) as Month,
  },
});

/**
 * The registry's agenda (`registry/solid/list-view`), the files `shadcn add @moltenship/list-view`
 * installs into a Solid app, run here from their source.
 */
const agenda = createAgendaView<Meeting>({ weeks: 2 });

export const Calendar = createCalendar<Meeting>()({
  eventAdapter: adapter,
  views: [month, agenda],
});

export type View = (typeof Calendar.views)[number]["name"];
