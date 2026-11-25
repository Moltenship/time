// The page Installation, the Agenda page and the Toolbar page show, after `shadcn add` of the
// Solid items. The registry's install test adds this file to a clean Solid app, whose typecheck and
// build cover it.

// #region view
import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
} from "@moltenship/calendar-solid";

import type { CalendarEventColor } from "@/components/calendar/event-colors";
import { createAgendaView } from "@/components/calendar/list-view/agenda-view";

export type Event = CalendarEvent<{ readonly color: CalendarEventColor }>;

export const Calendar = createCalendar<Event>()({
  eventAdapter: createCanonicalEventAdapter<{ readonly color: CalendarEventColor }>(),
  views: [createAgendaView<Event>({ getEventColor: (event) => event.data.color })],
});
// #endregion view

// #region toolbar-imports
import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";
import { MiniMonth } from "@/components/calendar/mini-month";
import { ViewSwitcher } from "@/components/calendar/view-switcher";
// #endregion toolbar-imports

// #region own-controls
import { Button } from "@/components/calendar/ui/button";

/** The kit's button, in a control of the app's own. */
function Refresh(props: { readonly onRefresh: () => Promise<void> }) {
  // A click that returns a promise marks the button pending until it settles.
  return (
    <Button onClick={() => props.onRefresh()} size="sm" variant="outline">
      Refresh
    </Button>
  );
}
// #endregion own-controls

// #region page
const events: readonly Event[] = [
  {
    data: { color: "blue" },
    end: Temporal.Instant.from("2026-10-08T09:30:00Z"),
    id: "standup",
    kind: "timed",
    start: Temporal.Instant.from("2026-10-08T09:00:00Z"),
    title: "Standup",
  },
  {
    data: { color: "teal" },
    end: Temporal.PlainDate.from("2026-10-10"),
    id: "conference",
    kind: "all-day",
    start: Temporal.PlainDate.from("2026-10-08"),
    title: "Conference",
  },
];

export default function CalendarPage() {
  return (
    <div class="flex h-dvh flex-col">
      <Calendar.Root
        defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
        defaultTimeZone="UTC"
        defaultView="agenda"
        events={events}
        locale="en-US"
        weekRules={{ firstDay: 7, minimalDays: 1, weekend: [6, 7] }}
      >
        <h1 class="p-4 text-lg font-semibold">
          <Calendar.Title />
        </h1>
        {/* The view fills what the title leaves, and scrolls inside it. */}
        <div class="min-h-0 flex-1">
          <Calendar.ActiveView />
        </div>
      </Calendar.Root>
    </div>
  );
}
// #endregion page

// #region toolbar
const today = Temporal.PlainDate.from("2026-10-08");
const viewOptions = Calendar.views.map(({ name }) => ({ label: "Agenda", value: name }));

/** The view switcher, on the calendar's view. Inside `Calendar.Root`. */
function CalendarViewSwitcher() {
  const view = Calendar.useCalendarSelector((state) => state.view);
  const { setView } = Calendar.useCalendarActions();
  return <ViewSwitcher onValueChange={setView} options={viewOptions} value={view()} />;
}

/** The mini month beside the calendar: it shows the dates the view shows, and picks the date. */
function Sidebar() {
  const anchorDate = Calendar.useCalendarSelector((state) => state.anchorDate);
  const visibleRange = Calendar.useVisibleRange();
  const { setAnchorDate } = Calendar.useCalendarActions();
  return (
    <MiniMonth
      class="mx-auto max-w-60"
      locale="en-US"
      onSelectDate={(date) => setAnchorDate(date)}
      selectedDate={anchorDate()}
      today={today}
      visibleRange={visibleRange() ?? undefined}
      weekStartsOn={7}
    />
  );
}

export function CalendarWithToolbar() {
  return (
    <Calendar.Root
      defaultAnchorDate={today}
      defaultTimeZone="UTC"
      defaultView="agenda"
      events={events}
      locale="en-US"
      weekRules={{ firstDay: 7, minimalDays: 1, weekend: [6, 7] }}
    >
      {/* The mini month sits beside the calendar on a wide screen, and above it on a narrow one. */}
      <Calendar.Frame class="flex h-dvh flex-col md:flex-row">
        <aside class="shrink-0 border-b p-3 md:w-64 md:border-e md:border-b-0">
          <Sidebar />
        </aside>
        <main class="flex min-h-0 min-w-0 flex-1 flex-col">
          <CalendarToolbar calendar={Calendar} class="border-b">
            <Refresh onRefresh={() => new Promise((resolve) => setTimeout(resolve, 500))} />
            <CalendarViewSwitcher />
          </CalendarToolbar>
          <Calendar.Viewport class="min-h-0 flex-1">
            <Calendar.ActiveView />
          </Calendar.Viewport>
        </main>
      </Calendar.Frame>
    </Calendar.Root>
  );
}
// #endregion toolbar
