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
  type CalendarWeekRules,
  type ListProjection,
  type ListViewOptions,
  type MonthProjection,
} from "@moltenship/calendar-core";
import { plainDateInterval } from "@moltenship/calendar-temporal";
import { createComponent, type JSX } from "@solidjs/web";
import { For, merge, type Accessor, type Component } from "solid-js";

import { createCalendar, defineCalendarView, type CalendarViewRendererProps } from "../../src";
import { keyedList } from "../../src/flow";
import { element } from "../../src/props";

// Both the browser tests and the server ones render these, so they build the same tree.

export interface Meeting {
  readonly id: string;
  readonly interval: CalendarEventInterval;
  readonly title: string;
}

export const adapter = defineEventAdapter<Meeting>()({
  getId: (event) => event.id,
  getInterval: (event) => event.interval,
  getResourceIds: () => [],
  getTitle: (event) => event.title,
});

export const review: Meeting = {
  id: "meeting-1",
  interval: {
    end: Temporal.Instant.from("2026-08-15T10:00:00Z"),
    kind: "timed",
    start: Temporal.Instant.from("2026-08-15T09:00:00Z"),
  },
  title: "Architecture review",
};

export const weekRules: CalendarWeekRules = { firstDay: 1, minimalDays: 4, weekend: [6, 7] };

const Output = element("output");
const Ol = element("ol");
const Li = element("li");
const Div = element("div");
const Ul = element("ul");

/** Views whose titles and ranges are easy to read in a test, as React's agent test has. */
function dayRangeView<const TName extends string>(name: TName, days: number, label: string) {
  return defineCalendarView({
    defaultOptions: { days, label },
    name,
    Renderer: (props: CalendarViewRendererProps<null, { days: number; label: string }>) =>
      createComponent(Output, {
        "data-active-view": "",
        get children() {
          return `${name} ${props.range.start.toString()}`;
        },
      }),
    strategy: {
      getRange: (anchor, _environment, options) =>
        plainDateInterval(anchor, anchor.add({ days: options.days })),
      getTitle: (range, _environment, options) => `${options.label} ${range.start.toString()}`,
      navigate: (anchor, delta, options) => anchor.add({ days: delta * options.days }),
      project: () => null,
    },
  });
}

export const Calendar = createCalendar<Meeting>()({
  eventAdapter: adapter,
  views: [dayRangeView("week", 7, "Week"), dayRangeView("agenda", 1, "Agenda")],
});

export type RootProps = Partial<Parameters<typeof Calendar.Root>[0]>;

export const rootDefaults = {
  defaultAnchorDate: Temporal.PlainDate.from("2026-08-15"),
  defaultTimeZone: "UTC",
  defaultView: "week",
  label: "Team calendar",
  locale: "en-GB",
  now: Temporal.Instant.from("2026-08-14T08:00:00Z"),
  weekRules,
} as const;

/** The structural parts, as an application composes them. */
export function Chrome(): JSX.Element {
  return createComponent(Calendar.Frame, {
    get children() {
      return [
        createComponent(Calendar.Toolbar, {
          get children() {
            return [
              createComponent(Calendar.PreviousTrigger, { children: "Previous" }),
              createComponent(Calendar.Title, {}),
              createComponent(Calendar.NextTrigger, { children: "Next" }),
              createComponent(Calendar.TodayTrigger, { children: "Today" }),
              createComponent(Calendar.ViewSwitcher, {
                "aria-label": "View",
                getViewLabel: (view: string) => view.toUpperCase(),
              }),
            ];
          },
        }),
        createComponent(Calendar.Viewport, {
          get children() {
            return createComponent(Calendar.ActiveView, {});
          },
        }),
      ];
    },
  });
}

/** `Root` with the defaults under `props`, which stay live: a getter in `props` is read late. */
export function CalendarRoot(props: RootProps & { readonly children?: JSX.Element }): JSX.Element {
  const all = merge({ events: [review] }, rootDefaults, props) as Parameters<
    typeof Calendar.Root
  >[0];
  return createComponent(Calendar.Root, all);
}

/** `For` keyed by `key`: the item comes as an accessor, since one key sees many items. */
function listBy<T>(
  each: () => readonly T[],
  key: (item: T) => string,
  render: (item: Accessor<T>) => JSX.Element,
): JSX.Element {
  return createComponent(For as Component<ForByProps<T>>, {
    get each() {
      return each();
    },
    keyed: key,
    children: (item: Accessor<T>) => render(item),
  });
}

interface ForByProps<T> {
  readonly each: readonly T[];
  readonly keyed: (item: T) => string;
  readonly children: (item: Accessor<T>) => JSX.Element;
}

// A month grid and an agenda from the engine's projections, for the server and hydration tests.

function MonthGrid(
  props: CalendarViewRendererProps<MonthProjection<Meeting, string, string>, undefined>,
) {
  return createComponent(Div, {
    "data-view": "month",
    get children() {
      return [
        createComponent(Ol, {
          get children() {
            // By date: a new projection has new day objects, and a day keeps its element.
            return listBy(
              () => props.projection.weeks.flatMap((week) => week.days),
              (day) => day.date.toString(),
              (day) =>
                createComponent(Li, {
                  get "data-date"() {
                    return day().date.toString();
                  },
                  get "data-today"() {
                    return day().isToday ? "" : undefined;
                  },
                  get children() {
                    return String(day().date.day);
                  },
                }),
            );
          },
        }),
        createComponent(Ul, {
          get children() {
            return listBy(
              () => props.projection.weeks.flatMap((week) => week.segments),
              (segment) => segment.event.id,
              (segment) =>
                createComponent(Li, {
                  get "data-event"() {
                    return segment().event.id;
                  },
                  get children() {
                    return segment().event.title;
                  },
                }),
            );
          },
        }),
      ];
    },
  });
}

function Agenda(
  props: CalendarViewRendererProps<ListProjection<Meeting, string, string>, ListViewOptions>,
) {
  return createComponent(Ol, {
    "data-view": "agenda",
    get children() {
      return keyedList(
        () => props.projection.days.flatMap((day) => day.items),
        (item) =>
          createComponent(Li, {
            get children() {
              return `${item.date.toString()} ${item.event.title}`;
            },
          }),
      );
    },
  });
}

export const monthView = defineCalendarView({
  name: "month",
  Renderer: MonthGrid,
  strategy: {
    getRange: (anchor, environment) => getMonthRange(anchor, environment),
    getTitle: (range, environment) => getMonthTitle(range, environment),
    navigate: (anchor, delta) => navigateMonth(anchor, delta),
    project: (input) => projectMonth(input) as MonthProjection<Meeting, string, string>,
  },
});

export const agendaView = defineCalendarView({
  defaultOptions: { weeks: 1 } as ListViewOptions,
  name: "agenda",
  Renderer: Agenda,
  strategy: {
    getRange: (anchor, environment, options) => getListRange(anchor, environment, options),
    getTitle: (range, environment) => getListTitle(range, environment),
    navigate: (anchor, delta, options) => navigateList(anchor, delta, options),
    project: (input) => projectList(input) as ListProjection<Meeting, string, string>,
  },
});

export const EngineCalendar = createCalendar<Meeting>()({
  eventAdapter: adapter,
  views: [monthView, agendaView],
});
