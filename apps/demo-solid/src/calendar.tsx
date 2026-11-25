import {
  defineEventAdapter,
  getListRange,
  getListTitle,
  getMonthRange,
  getMonthTitle,
  navigateList,
  navigateMonth,
  projectList,
  projectMonth,
  type CalendarEventInterval,
  type ListProjection,
  type ListViewOptions,
  type MonthProjection,
} from "@moltenship/calendar-core";
import {
  createCalendar,
  defineCalendarView,
  type CalendarViewRendererProps,
} from "@moltenship/calendar-solid";
import { For, Show } from "solid-js";

export interface Meeting {
  readonly id: string;
  readonly interval: CalendarEventInterval;
  /** An event the agent may look at but not change: the demo's policy refuses it. */
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
type List = ListProjection<Meeting, string, string>;

function MonthGrid(props: CalendarViewRendererProps<Month, undefined>) {
  const weekday = (date: Temporal.PlainDate) =>
    date.toLocaleString(props.environment.locale, { weekday: "short" });
  return (
    <div class="month" data-view="month">
      <div class="weekdays" aria-hidden="true">
        <For each={props.projection.weeks[0]?.days ?? []}>
          {(day) => <span>{weekday(day.date)}</span>}
        </For>
      </div>
      <For each={props.projection.weeks}>
        {(week) => (
          <div
            class="week"
            style={{
              "grid-template-rows": `1.75rem repeat(${week.laneCount}, 1.5rem) minmax(0.5rem, 1fr)`,
            }}
          >
            {/* By date: a new projection has new day objects, and a day keeps its element. */}
            <For each={week.days} keyed={(day) => day.date.toString()}>
              {(day, index) => (
                <div
                  class="day"
                  data-date={day().date.toString()}
                  data-today={day().isToday ? "" : undefined}
                  data-outside={day().inMonth ? undefined : ""}
                  style={{ "grid-column": `${index() + 1}` }}
                >
                  <span class="day-number">{day().date.day}</span>
                </div>
              )}
            </For>
            <For each={week.segments}>
              {(segment) => (
                <div
                  class="chip"
                  data-event-id={segment.event.id}
                  data-pending={segment.event.isPending === true ? "" : undefined}
                  style={{
                    "grid-column": `${segment.column + 1} / span ${segment.span}`,
                    "grid-row": `${segment.lane + 2}`,
                  }}
                >
                  {segment.event.title}
                </div>
              )}
            </For>
          </div>
        )}
      </For>
    </div>
  );
}

function Agenda(props: CalendarViewRendererProps<List, ListViewOptions>) {
  const day = (date: Temporal.PlainDate) =>
    date.toLocaleString(props.environment.locale, {
      day: "numeric",
      month: "long",
      weekday: "long",
    });
  const time = (value: Temporal.PlainDateTime) =>
    value.toLocaleString(props.environment.locale, { hour: "2-digit", minute: "2-digit" });
  return (
    <div class="agenda" data-view="list">
      <For each={props.projection.days} fallback={<p class="empty">Nothing in these weeks.</p>}>
        {(entry) => (
          <section class="agenda-day" data-today={entry.isToday ? "" : undefined}>
            {/* Under the page's `h1`, as the agent panel's `h2` is. */}
            <h2>{day(entry.date)}</h2>
            <ul>
              <For each={entry.items}>
                {(item) => (
                  <li data-event-id={item.event.id}>
                    <span class="time">
                      <Show when={item.event.kind !== "all-day"} fallback="All day">
                        {time(item.start)}–{time(item.end)}
                      </Show>
                    </span>
                    <span>{item.event.title}</span>
                  </li>
                )}
              </For>
            </ul>
          </section>
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
    getTitle: (range, environment) => getMonthTitle(range, environment),
    navigate: (anchor, delta) => navigateMonth(anchor, delta),
    project: (input) => projectMonth(input) as Month,
  },
});

const list = defineCalendarView({
  defaultOptions: { weeks: 2 } as ListViewOptions,
  name: "list",
  Renderer: Agenda,
  strategy: {
    getRange: (anchor, environment, options) => getListRange(anchor, environment, options),
    getTitle: (range, environment) => getListTitle(range, environment),
    navigate: (anchor, delta, options) => navigateList(anchor, delta, options),
    project: (input) => projectList(input) as List,
  },
});

export const Calendar = createCalendar<Meeting>()({
  eventAdapter: adapter,
  views: [month, list],
});

export type View = (typeof Calendar.views)[number]["name"];
