// Undo and redo's undo toast, on the month: move an event, and the toast offers to take the move
// back. The registry's install test adds this file to a clean Solid app, whose typecheck and build
// cover it.

// #region undo-toast
import { createEventHistory, type CalendarEventChange } from "@moltenship/calendar-solid";
import { createSignal } from "solid-js";

import { calendarAnnouncements } from "@/components/calendar/announcements";
import { CalendarHistoryToast } from "@/components/calendar/calendar-history-toast/calendar-history-toast";

import { Calendar, type Event } from "./month-page";

// The event each create became, by change ID, so undo can find it.
const createdIds = new Map<string, string>();

// One history per calendar, outside the component, so it outlives a remount.
const history = createEventHistory<Event, string, string>({
  createdEventId: (change, events) => {
    const id = createdIds.get(change.id);
    return id !== undefined && events.get(id) !== undefined ? id : undefined;
  },
});

function applyChange(
  events: readonly Event[],
  change: CalendarEventChange<Event, string, string>,
): readonly Event[] {
  if (change.cause === "delete") return events.filter((event) => event.id !== change.eventId);
  if (change.cause === "create") {
    // Undoing a delete proposes a create with the deleted event, so it comes back as it was.
    const event: Event = {
      ...(change.event ?? { data: { color: "blue" }, id: crypto.randomUUID(), title: "New event" }),
      ...change.proposed,
    };
    createdIds.set(change.id, event.id);
    return [...events, event];
  }
  return events.map((event) =>
    event.id === change.eventId ? { ...event, ...change.proposed } : event,
  );
}

export default function UndoToastPage() {
  const [events, setEvents] = createSignal<readonly Event[]>(seed);
  return (
    <Calendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="UTC"
      defaultView="month"
      events={events()}
      locale="en-US"
      onEventChange={(change) => {
        setEvents((current) => applyChange(current, change));
      }}
      onEventChangeResult={(result, detail) => history.record(result, detail)}
      weekRules={{ firstDay: 7, minimalDays: 1, weekend: [6, 7] }}
    >
      <Calendar.Frame class="flex h-dvh flex-col">
        <Calendar.Viewport class="min-h-0 flex-1">
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
      <Calendar.Announcer messages={calendarAnnouncements} />
      <CalendarHistoryToast calendar={Calendar} history={history} />
    </Calendar.Root>
  );
}
// #endregion undo-toast

const seed: readonly Event[] = [
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
    end: Temporal.PlainDate.from("2026-10-15"),
    id: "offsite",
    kind: "all-day",
    start: Temporal.PlainDate.from("2026-10-13"),
    title: "Offsite",
  },
];
