import {
  createCalendar,
  createCanonicalEventAdapter,
  plainDateInterval,
  type CalendarAnnotation,
  type CalendarResource,
} from "@moltenship/calendar";

import { CalendarToolbar } from "@registry/calendar/calendar-toolbar";
import { MiniMonth } from "@registry/calendar/mini-month";
import { ViewSwitcher } from "@registry/calendar/view-switcher";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import { createAgendaView } from "@registry/list-view/agenda-view";
import { createMonthView } from "@registry/month-view/month-view";
import { createResourceColumnsView } from "@registry/resource-columns-view/resource-columns-view";
import { createDayView, createWeekView } from "@registry/time-grid-view/time-grid-view";
import { createYearView } from "@registry/year-view/year-view";

import {
  annotationSources,
  annotations,
  availability,
  events,
  resources,
  today,
  type Fixture,
} from "./registry-fixtures";

const getEventColor = (event: Fixture) => event.data.color;
const Calendar = createCalendar<Fixture, CalendarResource<null>>()({
  eventAdapter: createCanonicalEventAdapter<{ readonly color: CalendarEventColor }, string>(),
  views: [
    createWeekView<Fixture>({ dayView: "day", getEventColor }),
    createDayView<Fixture>({ getEventColor }),
    createMonthView<Fixture>({ getEventColor }),
    createYearView<Fixture>({ getEventColor }),
    createAgendaView<Fixture>({ getEventColor }),
    createResourceColumnsView<Fixture>({ getEventColor }),
  ],
});

export type RegistryView = (typeof Calendar.views)[number]["name"];
export const registryViews: readonly RegistryView[] = [
  "month",
  "year",
  "week",
  "day",
  "agenda",
  "resources",
];
const viewOptions = registryViews.map((value) => ({ label: value, value }));

/** A view under the toolbar, beside a mini month whose selected date is not today. */
export function RegistryScreen({
  annotations: annotationData = annotations,
  dir,
  view,
}: {
  readonly annotations?: readonly CalendarAnnotation[];
  readonly dir?: "ltr" | "rtl";
  readonly view: RegistryView;
}) {
  return (
    <Calendar.Root
      annotationSources={annotationSources}
      annotations={annotationData}
      availability={availability}
      defaultAnchorDate={today}
      defaultExpandedResourceIds={["team"]}
      defaultTimeZone="UTC"
      defaultView={view}
      events={events}
      locale="en-US"
      now={Temporal.Instant.from("2026-10-08T10:20:00Z")}
      resources={resources}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <Calendar.Frame className="flex h-dvh" dir={dir}>
        <aside className="w-64 shrink-0 border-e p-3">
          <MiniMonth
            locale="en-US"
            onSelectDate={() => {}}
            selectedDate={today.add({ days: 1 })}
            today={today}
            visibleRange={plainDateInterval(today.subtract({ days: 3 }), today.add({ days: 4 }))}
            weekStartsOn={1}
          />
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
          <CalendarToolbar calendar={Calendar} className="border-b">
            <ViewSwitcher onValueChange={() => {}} options={viewOptions} value={view} />
          </CalendarToolbar>
          <Calendar.Viewport className="min-h-0 flex-1">
            <Calendar.ActiveView />
          </Calendar.Viewport>
        </main>
      </Calendar.Frame>
    </Calendar.Root>
  );
}
