// #region calendar
"use client";

import {
  createCalendar,
  eventIdOf,
  weekRange,
  type CalendarEventChange,
  type CalendarFocus,
  type CalendarSelection,
  type CalendarVisibleRange,
  type EventId,
} from "@moltenship/calendar";
import {
  createCanonicalRecurrenceAdapter,
  createOccurrenceAdapter,
  createOccurrenceExpander,
  isRecurringChange,
  recurrenceEditScopes,
  resolveRecurrenceEdit,
  type RecurrenceAdapters,
  type RecurrenceEditScope,
  type RecurrenceOccurrence,
} from "@moltenship/calendar-recurrence";
import { useEffect, useMemo, useState, useSyncExternalStore, type MouseEvent } from "react";

import { calendarAnnouncements } from "@/components/calendar/announcements";
import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";
import type { CalendarEventColor } from "@/components/calendar/event-colors";
import { useRecurrenceScopePrompt } from "@/components/calendar/recurrence-scope-dialog/use-recurrence-scope-prompt";
import { createWeekView } from "@/components/calendar/time-grid-view/time-grid-view";
import { Button } from "@/components/ui/button";

import type { GoogleCalendarEvent, GoogleEvent } from "@/lib/google-calendar";
import { createGoogleCalendarApi, GoogleApiError } from "@/lib/google-calendar-api";
import {
  createGoogleCalendarSync,
  newGoogleId,
  type GoogleCalendarSync,
} from "@/lib/google-calendar-sync";

/** What the calendar shows: an occurrence of a series, or a one-off event. */
export type GoogleOccurrence = RecurrenceOccurrence<GoogleCalendarEvent, string>;

const canonical = createCanonicalRecurrenceAdapter<GoogleEvent>();

export const adapters: RecurrenceAdapters<GoogleCalendarEvent, string, string> = {
  ...canonical,
  event: {
    ...canonical.event,
    // Google's "Show as": a free event doesn't make you busy, for `busyAt`, `useBusyResources`
    // and `conflictPolicy` alike. Without `transparency`, Google counts an event as busy, all-day
    // ones too; its own app saves new all-day events as free.
    isBusy: (event) => event.data.transparency !== "transparent",
  },
};

/**
 * Google's event colors, "1" (Lavender) to "11" (Tomato), as the theme's nearest. `colors.get`
 * has their hex values, if you'd rather show Google's own.
 */
const googleColors: Readonly<Record<string, CalendarEventColor>> = {
  "1": "purple",
  "2": "green",
  "3": "purple",
  "4": "pink",
  "5": "yellow",
  "6": "orange",
  "7": "teal",
  "8": "gray",
  "9": "blue",
  "10": "green",
  "11": "red",
};

export const Calendar = createCalendar<GoogleOccurrence>()({
  eventAdapter: createOccurrenceAdapter(adapters.event),
  views: [
    createWeekView<GoogleOccurrence>({
      describeEvent: ({ event }) =>
        event.data.transparency === "transparent" ? "free" : undefined,
      // Without `colorId`, an event has its calendar's color, here blue.
      getEventColor: ({ event }) => googleColors[event.data.colorId ?? ""] ?? "blue",
    }),
  ],
});
// #endregion calendar

type OccurrenceChange = CalendarEventChange<GoogleOccurrence, string, string>;

const weekRules = { firstDay: 1, minimalDays: 4, weekend: [6, 7] } as const;

/** A selection or focus on an occurrence, moved to the occurrence's new ID after an edit. */
function renamed<T extends CalendarSelection | CalendarFocus>(
  current: T | null,
  ids: ReadonlyMap<EventId, string>,
): T | null {
  return current?.kind === "event"
    ? { ...current, eventId: ids.get(current.eventId) ?? current.eventId }
    : current;
}

// #region reason
/** Why Google refused a request, for the user. */
function reasonOf(error: unknown): string {
  if (!(error instanceof GoogleApiError)) return error instanceof Error ? error.message : "";
  if (error.status === 412) return "it changed in Google Calendar. This is the latest.";
  if (error.status === 410) return "it was deleted in Google Calendar.";
  const rateLimited = ["rateLimitExceeded", "userRateLimitExceeded"].includes(error.reason ?? "");
  if (error.status === 429 || rateLimited) return "Google is busy. Try again in a minute.";
  return error.message;
}
// #endregion reason

interface GoogleCalendarProps {
  readonly sync: GoogleCalendarSync;
  readonly timeZone: string;
}

// #region root
export function GoogleCalendar({ sync, timeZone }: GoogleCalendarProps) {
  const [today] = useState(() => Temporal.Now.plainDateISO(timeZone));
  const events = useSyncExternalStore(sync.subscribe, sync.getEvents, sync.getEvents);
  // One expander while the calendar is mounted, so series that didn't change keep their work.
  const [expander] = useState(() => createOccurrenceExpander(adapters));
  const [range, setRange] = useState(() => weekRange(today, { weekStartsOn: weekRules.firstDay }));
  const { occurrences } = useMemo(
    () => expander.expand(events, { range, timeZone }),
    [expander, events, range, timeZone],
  );
  const [selection, setSelection] = useState<CalendarSelection | null>(null);
  const [focus, setFocus] = useState<CalendarFocus | null>(null);
  const [status, setStatus] = useState("");
  const { ask, dialog } = useRecurrenceScopePrompt();

  function onVisibleRangeChange({ loadInstantRange, loadRange }: CalendarVisibleRange) {
    setRange(loadRange);
    // `timeMin` and `timeMax` for the dates on screen, and the pages a scrolling view keeps ready.
    sync
      .load(loadInstantRange)
      .then(loaded, (error) => setStatus(`Couldn't load: ${reasonOf(error)}`));
  }

  // A later load or sync that works clears a load error.
  function loaded() {
    setStatus((current) => (current.startsWith("Couldn't load") ? "" : current));
  }
  // #endregion root

  // #region live
  useEffect(() => {
    // Catch up when the tab comes back, and every minute: push notifications can be late, or lost.
    const catchUp = () => {
      if (document.visibilityState === "visible") sync.sync().then(loaded, () => undefined);
    };
    document.addEventListener("visibilitychange", catchUp);
    const timer = setInterval(catchUp, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", catchUp);
      clearInterval(timer);
    };
  }, [sync]);
  // #endregion live

  // #region change
  async function onEventChange(change: OccurrenceChange) {
    let scope: RecurrenceEditScope = "this";
    if (isRecurringChange(change)) {
      const scopes = recurrenceEditScopes(change, adapters, { timeZone });
      if (scopes.length === 0) {
        setStatus("This repeating event can't change that way.");
        throw new Error("No scope applies");
      }
      const picked = await ask({
        action: change.cause === "delete" ? "delete" : "edit",
        eventTitle: change.event.event.title,
        scopes,
      });
      if (picked === null) throw new DOMException("Cancelled", "AbortError");
      scope = picked;
    }
    const edit = resolveRecurrenceEdit(change, scope, adapters, {
      // Google takes IDs you pick, so a "following" edit's new series is known before it's saved.
      newSeriesId: newGoogleId(),
      occurrences,
      timeZone,
    });
    if (edit.type === "rejected") {
      setStatus(edit.message);
      throw new Error(edit.message);
    }

    setStatus("Saving…");
    try {
      // The change shows, pending, until Google answers. Throwing rolls it back.
      await sync.save(edit, timeZone);
    } catch (error) {
      setStatus(`Not saved: ${reasonOf(error)}`);
      throw error;
    }
    setStatus("Saved.");
    if (edit.type === "series") {
      setSelection((current) => renamed(current, edit.occurrenceIds));
      setFocus((current) => renamed(current, edit.occurrenceIds));
    }
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
          <Footer occurrence={selected} status={status} />
          <Calendar.Announcer messages={calendarAnnouncements} />
        </Calendar.Frame>
      </Calendar.Root>
      {dialog}
    </>
  );
}

/** The selected event and a button that deletes it, and what happened to the last change. */
function Footer({
  occurrence,
  status,
}: {
  readonly occurrence: GoogleOccurrence | undefined;
  readonly status: string;
}) {
  const { proposeEventChange } = Calendar.useCalendarActions();

  return (
    <div className="flex min-h-12 shrink-0 items-center gap-3 border-t px-4 py-2 text-sm">
      {occurrence === undefined ? (
        <span className="text-muted-foreground">Click an event to select it.</span>
      ) : (
        <>
          <span className="min-w-0 truncate font-medium">{occurrence.event.title}</span>
          <Button
            onClick={() => void proposeEventChange({ cause: "delete", eventId: occurrence.id })}
            size="sm"
            variant="outline"
          >
            Delete
          </Button>
        </>
      )}
      <span className="ms-auto text-muted-foreground" role="status">
        {status}
      </span>
    </div>
  );
}

// #region page
/** The calendar a page renders, with one sync store for as long as it's mounted. */
export function SyncedCalendar({ timeZone }: { readonly timeZone: string }) {
  // The browser calls your route, which adds the user's access token.
  const [sync] = useState(() =>
    createGoogleCalendarSync(createGoogleCalendarApi({ baseUrl: "/api/google-calendar" })),
  );
  return <GoogleCalendar sync={sync} timeZone={timeZone} />;
}
// #endregion page
