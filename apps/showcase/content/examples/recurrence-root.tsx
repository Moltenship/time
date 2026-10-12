// #region root
"use client";

import {
  eventIdOf,
  weekRange,
  type CalendarEventChange,
  type CalendarFocus,
  type CalendarSelection,
  type EventId,
} from "@moltenship/calendar";
import {
  applyRecurrenceEdit,
  isRecurringChange,
  recurrenceEditScopes,
  resolveRecurrenceEdit,
  type RecurrenceEditScope,
} from "@moltenship/calendar-recurrence";
import { useState, type MouseEvent } from "react";

import { calendarAnnouncements } from "@/components/calendar/announcements";
import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";
import { useRecurrenceScopePrompt } from "@/components/calendar/recurrence-scope-dialog/use-recurrence-scope-prompt";
import { Button } from "@/components/ui/button";

import { adapters, Calendar, type TeamEvent, type TeamOccurrence } from "./recurrence-calendar";
import { useOccurrences } from "./use-occurrences";

type OccurrenceChange = CalendarEventChange<TeamOccurrence, string, string>;

/** A selection or focus on an occurrence, moved to the occurrence's new ID after an edit. */
function renamed<T extends CalendarSelection | CalendarFocus>(
  current: T | null,
  ids: ReadonlyMap<EventId, string>,
): T | null {
  return current?.kind === "event"
    ? { ...current, eventId: ids.get(current.eventId) ?? current.eventId }
    : current;
}

const weekRules = { firstDay: 1, minimalDays: 4, weekend: [6, 7] } as const;

interface TeamCalendarProps {
  readonly initialEvents: readonly TeamEvent[];
  readonly timeZone: string;
}

export function TeamCalendar({ initialEvents, timeZone }: TeamCalendarProps) {
  const [today] = useState(() => Temporal.Now.plainDateISO(timeZone));
  const [events, setEvents] = useState(initialEvents);
  const [selection, setSelection] = useState<CalendarSelection | null>(null);
  const [focus, setFocus] = useState<CalendarFocus | null>(null);
  const { occurrences, onVisibleRangeChange } = useOccurrences(
    events,
    timeZone,
    weekRange(today, { weekStartsOn: weekRules.firstDay }),
  );
  const { ask, dialog } = useRecurrenceScopePrompt();

  // #region change
  async function onEventChange(change: OccurrenceChange) {
    // A new event, or a change to a one-off event, needs no question.
    let scope: RecurrenceEditScope = "this";
    if (isRecurringChange(change)) {
      const scopes = recurrenceEditScopes(change, adapters, { timeZone });
      // None applies, so there's nothing to ask: tell the user why instead. Throwing rolls the
      // change back.
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
      occurrences,
      // The zone the calendar moves occurrences on, so a series dragged by days keeps its time.
      timeZone,
    });
    if (edit.type === "rejected") throw new Error(edit.message);

    // Save the edit on your server here. The change stays pending until this function returns.
    if (edit.type === "event") {
      setEvents((current) => applyEventChange(current, edit.change));
      return;
    }
    setEvents((current) =>
      applyRecurrenceEdit(current, edit, { createId: () => crypto.randomUUID() }),
    );
    // "following" and "all" give the occurrences new IDs. The selection and keyboard focus
    // follow them, and the calendar moves focus to the occurrence under its new ID.
    setSelection((current) => renamed(current, edit.occurrenceIds));
    setFocus((current) => renamed(current, edit.occurrenceIds));
  }
  // #endregion change

  // Apps open an event by delegating clicks on `[data-event-id]`.
  function selectClicked(event: MouseEvent) {
    const element = (event.target as Element).closest("[data-event-id]");
    const eventId = element === null ? null : eventIdOf(element);
    setSelection(eventId === null ? null : { eventId, kind: "event" });
  }

  const selected =
    selection?.kind === "event"
      ? occurrences.find((occurrence) => occurrence.id === selection.eventId)
      : undefined;

  return (
    <>
      <Calendar.Root
        events={occurrences}
        focus={focus}
        onFocusChange={setFocus}
        onEventChange={onEventChange}
        onVisibleRangeChange={onVisibleRangeChange}
        selection={selection}
        onSelectionChange={setSelection}
        defaultAnchorDate={today}
        defaultTimeZone={timeZone}
        locale="en-US"
        weekRules={weekRules}
      >
        <Calendar.Frame className="flex h-full flex-col">
          <CalendarToolbar calendar={Calendar} className="border-b" />
          <Calendar.Viewport className="min-h-0 flex-1" onClick={selectClicked}>
            <Calendar.ActiveView />
          </Calendar.Viewport>
          <SelectedEvent occurrence={selected} />
          <Calendar.Announcer messages={calendarAnnouncements} />
        </Calendar.Frame>
      </Calendar.Root>
      {dialog}
    </>
  );
}

/** A change to a one-off event, or a new event, as any calendar applies it. */
function applyEventChange(
  events: readonly TeamEvent[],
  change: CalendarEventChange<TeamEvent, string, string>,
): readonly TeamEvent[] {
  if (change.cause === "delete") return events.filter((event) => event.id !== change.eventId);
  const { resourceIds: _resourceIds, ...placement } = change.proposed;
  if (change.cause === "create") {
    const id = crypto.randomUUID();
    return [...events, { data: { color: "blue" }, id, title: "New event", ...placement }];
  }
  return events.map((event) =>
    event.id === change.eventId
      ? { data: event.data, id: event.id, title: event.title, ...placement }
      : event,
  );
}
// #endregion root

// #region delete
/** The selected occurrence's title, and a button that deletes it through `onEventChange`. */
function SelectedEvent({ occurrence }: { readonly occurrence: TeamOccurrence | undefined }) {
  const { proposeEventChange } = Calendar.useCalendarActions();

  return (
    <div className="flex min-h-12 shrink-0 items-center gap-3 border-t px-4 py-2 text-sm">
      {occurrence === undefined ? (
        <span className="text-muted-foreground">Click an event to select it.</span>
      ) : (
        <>
          <span className="min-w-0 truncate font-medium">{occurrence.event.title}</span>
          <Button
            className="ms-auto"
            onClick={() => void proposeEventChange({ cause: "delete", eventId: occurrence.id })}
            size="sm"
            variant="outline"
          >
            Delete
          </Button>
        </>
      )}
    </div>
  );
}
// #endregion delete
