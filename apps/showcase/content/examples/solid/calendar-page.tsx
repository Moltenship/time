// The page Installation, the Agenda, Toolbar and Undo and redo pages show, after `shadcn add` of the
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

// #region undo-toast
import { createEventHistory } from "@moltenship/calendar-solid";
import { createSignal } from "solid-js";

import { calendarAnnouncements } from "@/components/calendar/announcements";
import { CalendarHistoryToast } from "@/components/calendar/calendar-history-toast/calendar-history-toast";

// One history per calendar, outside the component, so it outlives a remount.
const history = createEventHistory<Event, string, string>();

export function CalendarWithUndo() {
  const [list, setList] = createSignal(events);
  return (
    <Calendar.Root
      defaultAnchorDate={today}
      defaultTimeZone="UTC"
      defaultView="agenda"
      events={list()}
      locale="en-US"
      onEventChange={(change) => {
        // Undoing a delete proposes a create with the deleted record, so it comes back as it was.
        if (change.cause === "delete") {
          setList((current) => current.filter((event) => event.id !== change.eventId));
        } else if (change.cause === "create" && change.event) {
          const restored = change.event;
          setList((current) => [...current, restored]);
        }
      }}
      onEventChangeResult={(result, detail) => history.record(result, detail)}
      weekRules={{ firstDay: 7, minimalDays: 1, weekend: [6, 7] }}
    >
      <Calendar.Frame class="h-dvh">
        <Calendar.ActiveView />
      </Calendar.Frame>
      <Calendar.Announcer messages={calendarAnnouncements} />
      <CalendarHistoryToast calendar={Calendar} history={history} />
    </Calendar.Root>
  );
}
// #endregion undo-toast

// The recurrence dialog, as the install test adds it. Its page shows it with
// `@moltenship/calendar-recurrence` (`recurrence.tsx`), which this app doesn't install.
import { useRecurrenceScopePrompt } from "@/components/calendar/recurrence-scope-dialog/use-recurrence-scope-prompt";

export function CalendarAskingFirst() {
  const { ask, dialog } = useRecurrenceScopePrompt();
  return (
    <>
      <Calendar.Root
        defaultAnchorDate={today}
        defaultTimeZone="UTC"
        events={events}
        locale="en-US"
        onEventChange={async (change) => {
          const scope = await ask({ action: change.cause === "delete" ? "delete" : "edit" });
          if (scope === null) throw new DOMException("Cancelled", "AbortError");
        }}
        weekRules={{ firstDay: 7, minimalDays: 1, weekend: [6, 7] }}
      >
        <Calendar.ActiveView />
      </Calendar.Root>
      {dialog}
    </>
  );
}
