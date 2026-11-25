// #region view
import {
  createCalendar,
  defineCalendarView,
  iteratePlainDates,
  plainDateInterval,
  zonedDayRange,
  type CalendarViewProjectionInput,
  type CalendarViewRendererProps,
} from "@moltenship/calendar-solid";
import { For, Show } from "solid-js";

import { seed, weekRules } from "./app";
import { eventAdapter, type Meeting } from "./calendar";

export const daysView = defineCalendarView({
  name: "days",
  defaultOptions: { days: 3 },
  strategy: {
    getRange: (anchor, _environment, { days }) => plainDateInterval(anchor, anchor.add({ days })),
    navigate: (anchor, delta, { days }) => anchor.add({ days: delta * days }),
    getTitle: (range, { locale }) =>
      new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).formatRange(
        range.start,
        range.end.subtract({ days: 1 }),
      ),
    project: ({ snapshot, range, environment }) =>
      Array.from(iteratePlainDates(range), (date) => {
        const day = zonedDayRange(date, environment.timeZone);
        return { date, events: day.interval ? snapshot.queryTimed(day.interval) : [] };
      }),
  },
  // Props are getters: read `props.projection` in the JSX, and don't destructure it.
  Renderer: (props) => (
    <ol>
      <For each={props.projection} keyed={(day) => day.date.toString()}>
        {(day) => (
          <li>
            <button type="button" onClick={() => props.actions.setAnchorDate(day().date)}>
              {day().date.toString()}
            </button>{" "}
            {day().events.length} meetings
          </li>
        )}
      </For>
    </ol>
  ),
});
// #endregion view

// #region root
export const Calendar = createCalendar<Meeting>()({
  eventAdapter,
  views: [daysView],
});

export function WorkWeek() {
  return (
    <Calendar.Root
      events={seed}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-05")}
      defaultTimeZone="Europe/Berlin"
      locale="en-US"
      weekRules={weekRules}
      viewOptions={{ days: { days: 5 } }}
    >
      <Calendar.Title />
      <Calendar.ActiveView />
    </Calendar.Root>
  );
}
// #endregion root

// #region hooks
export function VisibleRange() {
  const range = Calendar.useVisibleRange();
  return (
    <Show when={range()}>
      {(dates) => (
        <p>
          {dates().start.toString()} to {dates().end.subtract({ days: 1 }).toString()}
        </p>
      )}
    </Show>
  );
}
// #endregion hooks

// #region typed
type DaysOptions = typeof daysView.defaultOptions;

export const titles = ({
  snapshot,
  instantRange,
}: CalendarViewProjectionInput<DaysOptions, Meeting>) =>
  snapshot.queryTimed(instantRange).map(({ event }) => event.title);
// #endregion typed

// #region renderer
type DaysProjection = readonly { readonly date: Temporal.PlainDate }[];

export function DaysRenderer(props: CalendarViewRendererProps<DaysProjection, DaysOptions>) {
  return <p>{props.projection.length} days</p>;
}
// #endregion renderer
