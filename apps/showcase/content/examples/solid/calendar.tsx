// #region calendar
import {
  createCalendar,
  defineCalendarView,
  defineEventAdapter,
  getListRange,
  getListTitle,
  navigateList,
  projectList,
  type CalendarEventInterval,
  type CalendarViewRendererProps,
  type ListProjection,
  type ListViewOptions,
} from "@moltenship/calendar-solid";
import { For } from "solid-js";

export interface Meeting {
  readonly id: string;
  readonly title: string;
  readonly interval: CalendarEventInterval;
}

export const eventAdapter = defineEventAdapter<Meeting>()({
  getId: (meeting) => meeting.id,
  getTitle: (meeting) => meeting.title,
  getInterval: (meeting) => meeting.interval,
  getResourceIds: () => [],
});

type List = ListProjection<Meeting, string, string>;

// Props are getters in Solid: read `props.projection` in the JSX, and don't destructure it.
function Agenda(props: CalendarViewRendererProps<List, ListViewOptions>) {
  const day = (date: Temporal.PlainDate) =>
    date.toLocaleString(props.environment.locale, { dateStyle: "full" });

  return (
    <For each={props.projection.days} fallback={<p>Nothing in these weeks.</p>}>
      {(entry) => (
        <section>
          <h3>{day(entry.date)}</h3>
          <ul>
            <For each={entry.items}>
              {(item) => <li data-event-id={item.event.id}>{item.event.title}</li>}
            </For>
          </ul>
        </section>
      )}
    </For>
  );
}

export const listView = defineCalendarView({
  name: "list",
  defaultOptions: { weeks: 2 } as ListViewOptions,
  strategy: {
    getRange: (anchor, environment, options) => getListRange(anchor, environment, options),
    getTitle: (range, environment) => getListTitle(range, environment),
    navigate: (anchor, delta, options) => navigateList(anchor, delta, options),
    project: (input) => projectList(input) as List,
  },
  Renderer: Agenda,
});

export const Calendar = createCalendar<Meeting>()({ eventAdapter, views: [listView] });

export type View = (typeof Calendar.views)[number]["name"];
// #endregion calendar
