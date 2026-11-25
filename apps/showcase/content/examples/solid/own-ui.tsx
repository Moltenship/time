// #region ui
import {
  createCalendar,
  defineCalendarView,
  defineEventAdapter,
  plainDateInterval,
  type CalendarViewProjectionInput,
} from "@moltenship/calendar-solid";
import { For } from "solid-js";

export interface Booking {
  readonly id: string;
  readonly title: string;
  readonly start: Temporal.Instant;
  readonly end: Temporal.Instant;
}

const eventAdapter = defineEventAdapter<Booking>()({
  getId: (booking) => booking.id,
  getTitle: (booking) => booking.title,
  getInterval: (booking) => ({ kind: "timed", start: booking.start, end: booking.end }),
  getResourceIds: () => [],
});

// The strategy picks the dates and the bookings. The Renderer is your markup.
const weekView = defineCalendarView({
  name: "week",
  strategy: {
    getRange: (anchor) => plainDateInterval(anchor, anchor.add({ days: 7 })),
    navigate: (anchor, delta) => anchor.add({ weeks: delta }),
    getTitle: (range, { locale }) => range.start.toLocaleString(locale, { dateStyle: "medium" }),
    project: ({ snapshot, instantRange }: CalendarViewProjectionInput<undefined, Booking>) =>
      snapshot.queryTimed(instantRange),
  },
  Renderer: (props) => (
    <ul class="booking-list">
      <For each={props.projection}>
        {(item) => (
          <li>
            <time datetime={item.event.start.toString()}>
              {item.event.start.toLocaleString(props.environment.locale, {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: props.environment.timeZone,
              })}
            </time>{" "}
            {item.event.title}
          </li>
        )}
      </For>
    </ul>
  ),
});

export const Calendar = createCalendar<Booking>()({ eventAdapter, views: [weekView] });

function Toolbar() {
  const actions = Calendar.useCalendarActions();

  return (
    <Calendar.Toolbar class="toolbar">
      {/* A control of your own calls an action. */}
      <button class="button" type="button" onClick={(event) => actions.navigateToday({ event })}>
        Today
      </button>
      {/* The calendar's triggers are plain buttons that take your classes. */}
      <Calendar.PreviousTrigger class="button">Previous</Calendar.PreviousTrigger>
      <Calendar.NextTrigger class="button">Next</Calendar.NextTrigger>
      <Calendar.Title class="title" />
    </Calendar.Toolbar>
  );
}

export function BookingCalendar(props: { readonly bookings: readonly Booking[] }) {
  return (
    <Calendar.Root
      events={props.bookings}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-05")}
      defaultTimeZone="Europe/Berlin"
      label="Bookings"
      locale="en-US"
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <Calendar.Frame class="calendar">
        <Toolbar />
        <Calendar.Viewport>
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
    </Calendar.Root>
  );
}
// #endregion ui
