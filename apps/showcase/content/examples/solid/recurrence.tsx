// The Recurring events page's calendar: a series expanded for the dates on screen, and the
// registry's dialog asking which of its events a change applies to.

// #region calendar
import {
  applyRecurrenceEdit,
  createCanonicalRecurrenceAdapter,
  createOccurrenceAdapter,
  createOccurrenceExpander,
  isRecurringChange,
  recurrenceEditScopes,
  resolveRecurrenceEdit,
  type RecurrenceEditScope,
  type RecurrenceOccurrence,
  type RecurringCalendarEvent,
} from "@moltenship/calendar-recurrence";
import {
  createCalendar,
  type CalendarEventChange,
  type CalendarVisibleRange,
  useCalendarFocus,
} from "@moltenship/calendar-solid";
import { createMemo, createSignal } from "solid-js";

import { createAgendaView } from "@/components/calendar/list-view/agenda-view";
import { useRecurrenceScopePrompt } from "@/components/calendar/recurrence-scope-dialog/use-recurrence-scope-prompt";
import { Button } from "@/components/calendar/ui/button";

/** A series' master has a `recurrence`; any other event happens once. */
export type TeamEvent = RecurringCalendarEvent<null>;

/** What the calendar shows: one occurrence of a series, or a one-off event. */
export type TeamOccurrence = RecurrenceOccurrence<TeamEvent, string>;

export const adapters = createCanonicalRecurrenceAdapter<null>();

export const Calendar = createCalendar<TeamOccurrence>()({
  // Occurrences are the calendar's events. It reads their titles through your adapter.
  eventAdapter: createOccurrenceAdapter(adapters.event),
  views: [createAgendaView<TeamOccurrence>()],
});
// #endregion calendar

const timeZone = "Europe/Berlin";
const today = Temporal.PlainDate.from("2026-10-05");

/** A standup every morning, for ten days. */
const standup: TeamEvent = {
  data: null,
  end: Temporal.Instant.from("2026-10-05T07:30:00Z"),
  id: "standup",
  kind: "timed",
  recurrence: { rule: { count: 10, frequency: "DAILY" } },
  start: Temporal.Instant.from("2026-10-05T07:00:00Z"),
  title: "Standup",
};

export function TeamCalendar() {
  const [events, setEvents] = createSignal<readonly TeamEvent[]>([standup]);

  // #region expand
  // One expander for as long as the calendar is mounted: it keeps its work for series that
  // didn't change, and returns the same occurrence objects for them.
  const expander = createOccurrenceExpander(adapters);
  const [range, setRange] = createSignal({ end: today.add({ days: 7 }), start: today });
  const occurrences = createMemo(
    () => expander.expand(events(), { range: range(), timeZone }).occurrences,
  );
  const onVisibleRangeChange = ({ loadRange }: CalendarVisibleRange) => setRange(loadRange);
  // #endregion expand

  // #region change
  const { ask, dialog } = useRecurrenceScopePrompt();

  async function onEventChange(change: CalendarEventChange<TeamOccurrence, string, string>) {
    // A new event, or a change to a one-off event, needs no question.
    let scope: RecurrenceEditScope = "this";
    if (isRecurringChange(change)) {
      const scopes = recurrenceEditScopes(change, adapters, { timeZone });
      // None applies, so there's nothing to ask: throwing rolls the change back.
      if (scopes.length === 0) throw new Error("This repeating event can't change that way.");
      const picked = await ask({
        action: change.cause === "delete" ? "delete" : "edit",
        eventTitle: change.event.event.title,
        scopes,
      });
      // An `AbortError` is announced as a cancel, not as a change that couldn't be saved.
      if (picked === null) throw new DOMException("Cancelled", "AbortError");
      scope = picked;
    }

    const edit = resolveRecurrenceEdit(change, scope, adapters, {
      // Picked now, so the IDs of a "following" edit's new series are known.
      newSeriesId: crypto.randomUUID(),
      occurrences: occurrences(),
      timeZone,
    });
    if (edit.type === "rejected") throw new Error(edit.message);
    // Save the edit on your server here. The change stays pending until this function returns.
    // A one-off event's edit is `type: "event"`: apply its `change` as any calendar does.
    if (edit.type === "series") {
      setEvents((current) =>
        applyRecurrenceEdit(current, edit, { createId: () => crypto.randomUUID() }),
      );
    }
  }
  // #endregion change

  // #region page
  return (
    <>
      <Calendar.Root
        defaultAnchorDate={today}
        defaultTimeZone={timeZone}
        defaultView="agenda"
        events={occurrences()}
        locale="en-US"
        onEventChange={onEventChange}
        onVisibleRangeChange={onVisibleRangeChange}
        weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
      >
        <Calendar.Frame class="flex h-dvh flex-col">
          <DeleteFocused />
          <Calendar.Viewport class="min-h-0 flex-1">
            <Calendar.ActiveView />
          </Calendar.Viewport>
        </Calendar.Frame>
      </Calendar.Root>
      {dialog}
    </>
  );
  // #endregion page
}

// #region delete
/** Deletes the event last focused in the agenda, through `onEventChange`. */
function DeleteFocused() {
  const focused = useCalendarFocus((focus) =>
    focus?.kind === "event" ? String(focus.eventId) : null,
  );
  const { proposeEventChange } = Calendar.useCalendarActions();
  return (
    <Button
      disabled={focused() === null}
      onClick={() => {
        const eventId = focused();
        if (eventId !== null) void proposeEventChange({ cause: "delete", eventId });
      }}
      size="sm"
      variant="outline"
    >
      Delete
    </Button>
  );
}
// #endregion delete
