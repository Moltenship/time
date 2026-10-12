import { useEffect, useState, useSyncExternalStore } from "react";

import { GoogleCalendar } from "@/content/examples/google-calendar-root";
import type { GoogleEvent } from "@/lib/google-calendar";
import { createGoogleCalendarApi } from "@/lib/google-calendar-api";
import { createGoogleCalendarSync, type GoogleCalendarSync } from "@/lib/google-calendar-sync";

import { Button } from "@registry/ui/button";
import { TooltipProvider } from "@registry/ui/tooltip";

import {
  createFakeGoogleCalendar,
  fakeGoogleBaseUrl,
  type FakeGoogleCalendar,
  type FakeGoogleLogEntry,
} from "./fake-google-calendar";
import { createSeedEvents, googleTime, instanceId } from "./seed";

/** A change someone makes in Google Calendar: what the button says, and the event it writes. */
interface ElsewhereChange {
  readonly label: string;
  readonly change: (events: ReadonlyMap<string, GoogleEvent>) => GoogleEvent | null;
}

/** Four changes, each undone the next time round. */
function elsewhereChanges(
  now: Temporal.ZonedDateTime,
  seed: readonly GoogleEvent[],
): readonly ElsewhereChange[] {
  const today = now.toPlainDate();
  const friday = today.add({ days: 5 - today.dayOfWeek }).toZonedDateTime({
    plainTime: new Temporal.PlainTime(Math.min(Math.max(now.hour, 2), 19) - 1),
    timeZone: now.timeZoneId,
  });
  const fridayStandup = instanceId("standup", friday);
  const lunch = today
    .add({ days: 1 })
    .toZonedDateTime({ plainTime: new Temporal.PlainTime(12, 30), timeZone: now.timeZoneId });
  let reviewMoves = 0;
  const shift = (time: GoogleEvent["start"], hours: number) =>
    googleTime(
      Temporal.ZonedDateTime.from(`${time!.dateTime!}[${time!.timeZone!}]`).add({ hours }),
    );

  return [
    {
      change(events) {
        // An hour later, then an hour earlier the next time round.
        const hours = reviewMoves++ % 2 === 0 ? 1 : -1;
        const review = events.get("review");
        // Deleted or made all-day here: back as it was.
        if (review?.start?.dateTime === undefined || review.status === "cancelled") {
          return seed.find((event) => event.id === "review")!;
        }
        return { ...review, end: shift(review.end, hours), start: shift(review.start, hours) };
      },
      label: "Move “Design review”",
    },
    {
      change(events) {
        const existing = events.get("lunchwithana");
        if (existing !== undefined && existing.status !== "cancelled") {
          return { ...existing, status: "cancelled" };
        }
        return {
          end: googleTime(lunch.add({ hours: 1 })),
          id: "lunchwithana",
          start: googleTime(lunch),
          status: "confirmed",
          summary: "Lunch with Ana",
        };
      },
      label: "Add or delete a lunch",
    },
    {
      change(events) {
        const existing = events.get(fridayStandup);
        if (existing?.status === "cancelled") {
          // Back as it was: the occurrence the series puts there.
          return {
            ...existing,
            colorId: "7",
            end: googleTime(friday.add({ minutes: 30 })),
            start: googleTime(friday),
            status: "confirmed",
            summary: "Stand-up",
          };
        }
        return {
          id: fridayStandup,
          originalStartTime: googleTime(friday),
          recurringEventId: "standup",
          status: "cancelled",
        };
      },
      label: "Cancel or restore Friday’s stand-up",
    },
    {
      change(events) {
        const release = events.get("release")!;
        return { ...release, colorId: release.colorId === "11" ? "2" : "11" };
      },
      label: "Recolor “Release day”",
    },
  ];
}

/**
 * The guide's calendar, syncing with an in-memory Google Calendar, and controls to poke it. Each
 * answer takes `latencyMs`, so pending changes show.
 */
export default function GoogleCalendarPreview({
  latencyMs = 250,
}: {
  readonly latencyMs?: number;
}) {
  const [setup] = useState(() => {
    const now = Temporal.Now.zonedDateTimeISO();
    const seed = createSeedEvents(now);
    const google = createFakeGoogleCalendar({
      events: seed,
      latencyMs,
      pageSize: 4,
      timeZone: now.timeZoneId,
    });
    const api = createGoogleCalendarApi({
      baseUrl: fakeGoogleBaseUrl,
      fetch: google.fetch,
      // Shorter than Google's 1, 2, 4… seconds, so a retry shows without a wait.
      retryDelay: (attempt) => 300 * 2 ** attempt,
    });
    return {
      changes: elsewhereChanges(now, seed),
      google,
      now,
      sync: createGoogleCalendarSync(api),
    };
  });
  const [push, setPush] = useState(true);
  const { changes, google, now, sync } = setup;

  // What a watch channel does: Google says something changed, and the calendar asks what.
  useEffect(
    () => (push ? google.watch(() => void sync.sync().catch(() => undefined)) : undefined),
    [google, push, sync],
  );

  return (
    <TooltipProvider delay={400}>
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1">
          <GoogleCalendar sync={sync} timeZone={now.timeZoneId} />
        </div>
        <ControlPanel
          changes={changes}
          google={google}
          onPushChange={setPush}
          push={push}
          sync={sync}
        />
      </div>
    </TooltipProvider>
  );
}

function ControlPanel({
  changes,
  google,
  onPushChange,
  push,
  sync,
}: {
  readonly changes: readonly ElsewhereChange[];
  readonly google: FakeGoogleCalendar;
  readonly onPushChange: (push: boolean) => void;
  readonly push: boolean;
  readonly sync: GoogleCalendarSync;
}) {
  const [next, setNext] = useState(0);
  const [made, setMade] = useState("");
  const log = useSyncExternalStore(google.subscribeToLog, google.getLog, google.getLog);
  const change = changes[next % changes.length]!;

  return (
    <section
      aria-label="Simulated Google Calendar"
      className="flex h-60 shrink-0 flex-col gap-3 border-t bg-fd-card p-3 text-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => {
            const text = `In Google Calendar: ${change.label}`;
            google.changeElsewhere(text, change.change, push);
            setMade(text);
            setNext((index) => index + 1);
          }}
          size="sm"
          variant="outline"
        >
          {change.label}
        </Button>
        <Button onClick={() => void sync.sync().catch(() => undefined)} size="sm" variant="outline">
          Sync now
        </Button>
        <Button onClick={() => google.expireSyncTokens()} size="sm" variant="outline">
          Expire the sync token
        </Button>
        <Button onClick={() => google.rateLimitNext(2)} size="sm" variant="outline">
          Rate-limit 2 requests
        </Button>
        <label className="ms-auto flex items-center gap-2 text-fd-muted-foreground">
          <input
            checked={push}
            className="size-4 accent-current"
            onChange={(event) => onPushChange(event.target.checked)}
            type="checkbox"
          />
          Push notifications
        </label>
      </div>
      {/* The button's label moves on to the next change, so say which one was made. */}
      <p className="sr-only" role="status">
        {made}
      </p>
      <ol
        aria-label="Requests to the Calendar API, and changes in Google, newest first"
        className="min-h-0 flex-1 overflow-y-auto rounded-md border bg-fd-background px-3 py-2 font-mono text-xs leading-5 outline-none focus-visible:ring-2 focus-visible:ring-fd-ring"
        // Scrollable, so keyboard users can reach the older lines.
        tabIndex={0}
      >
        {log.toReversed().map((entry) => (
          <LogLine entry={entry} key={entry.id} />
        ))}
      </ol>
    </section>
  );
}

function LogLine({ entry }: { readonly entry: FakeGoogleLogEntry }) {
  if (entry.kind === "google") {
    return <li className="text-fd-muted-foreground italic">{entry.text}</li>;
  }
  const failed = entry.status !== undefined && entry.status >= 400;
  return (
    <li className="break-all">
      <span>{entry.text}</span>{" "}
      <span
        className={
          failed ? "font-semibold text-red-600 dark:text-red-400" : "text-fd-muted-foreground"
        }
      >
        → {entry.status}
        {entry.note === undefined ? "" : ` ${entry.note}`}
      </span>
    </li>
  );
}
