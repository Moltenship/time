"use client";

// The calendar renders while the page hydrates, so Temporal has to exist before then. The polyfill
// installs itself only in browsers without it.
import "temporal-polyfill/global";

import { usePathname, useRouter } from "next/navigation";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";

import { calendarAnnouncements } from "@/components/calendar/announcements";
import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";
import { ViewSwitcher } from "@/components/calendar/view-switcher";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { createMeeting, moveMeeting, saveTimeZone, type SaveResult } from "./actions";
import { Calendar, policies, type Meeting, type MeetingChange } from "./calendar";
import { locale, locationSearch, weekRules, type CalendarLocation } from "./location";
import type { MeetingJson } from "./meetings";

// #region navigation
/** The view and date from the URL. Changing them pushes a new URL; the calendar moves at once. */
function useCalendarLocation(location: CalendarLocation) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, startNavigation] = useTransition();
  // Shown until the new page has rendered on the server, so the grid moves on the click.
  const [shown, show] = useOptimistic(location);
  const queued = useRef<CalendarLocation | null>(null);

  function navigate(change: Partial<CalendarLocation>) {
    const first = queued.current === null;
    queued.current = { ...(queued.current ?? shown), ...change };
    if (!first) return;
    // Opening a day from the month view changes the date and the view in one click. Wait for
    // both, so they land in one URL and one history entry.
    queueMicrotask(() => {
      const next = queued.current ?? shown;
      queued.current = null;
      if (next.date === shown.date && next.view === shown.view) return;
      startNavigation(() => {
        show(next);
        router.push(`${pathname}?${locationSearch(next)}`, { scroll: false });
      });
    });
  }

  return { loading, location: shown, navigate };
}
// #endregion navigation

// #region save
function fromJson(meeting: MeetingJson): Meeting {
  return {
    ...meeting,
    end: Temporal.Instant.from(meeting.end),
    start: Temporal.Instant.from(meeting.start),
  };
}

function addMeeting(meetings: readonly Meeting[], meeting: Meeting): readonly Meeting[] {
  return [...meetings, meeting];
}

function send(change: MeetingChange): Promise<SaveResult> {
  if (change.proposed?.kind !== "timed") return Promise.resolve({ ok: false, reason: "invalid" });
  const times = { end: change.proposed.end.toString(), start: change.proposed.start.toString() };
  return change.cause === "create"
    ? createMeeting(times)
    : moveMeeting({ ...times, id: change.eventId });
}

const refusals: Record<Exclude<SaveResult, { ok: true }>["reason"], string> = {
  full: "Not saved: this example keeps 200 meetings at most.",
  "in-the-past": "Not saved: the server refuses meetings that start in the past.",
  invalid: "Not saved: the server couldn't read the change.",
  "not-found": "Not saved: the meeting is gone. Reload the page.",
};

/** The server's meetings, plus new ones still saving. */
function useMeetings(json: readonly MeetingJson[]) {
  const saved = useMemo(() => json.map(fromJson), [json]);
  // The calendar shows a moved or resized meeting in its new place while it saves. A new one has
  // no ID until the server gives it one, so it's shown here until the page re-renders with it.
  const [meetings, addPending] = useOptimistic(saved, addMeeting);
  const [message, setMessage] = useState("");

  // The calendar keeps a change pending until this promise settles, and undoes it on a rejection.
  function save(change: MeetingChange): Promise<void> {
    const { promise, reject, resolve } = Promise.withResolvers<void>();
    // Cleared first, so the same refusal twice is announced twice.
    setMessage("");
    startTransition(async () => {
      if (change.cause === "create" && change.proposed.kind === "timed") {
        const { end, start } = change.proposed;
        addPending({
          color: "blue",
          end,
          id: change.id,
          pending: true,
          start,
          title: "New meeting",
        });
      }
      const result = await send(change).catch(() => null);
      if (result?.ok === true) {
        resolve();
      } else {
        setMessage(
          result === null ? "Not saved: the server didn't answer." : refusals[result.reason],
        );
        reject(new Error(result?.reason ?? "network"));
      }
    });
    return promise;
  }

  return { meetings, message, save };
}
// #endregion save

// #region time-zone
const timeZones = [
  "America/Los_Angeles",
  "America/New_York",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC",
];

/** The cookie's time zone. A first visit has none: store the browser's, and render in it. */
function useTimeZone(timeZone: string, fromCookie: boolean) {
  const [shown, show] = useOptimistic(timeZone);

  // The calendar switches at once, and the page renders again in the new zone when the cookie is
  // set. If saving fails, it goes back to the zone the server rendered in.
  const change = useCallback(
    (next: string) => {
      startTransition(async () => {
        show(next);
        await saveTimeZone(next).catch(() => undefined);
      });
    },
    [show],
  );

  useEffect(() => {
    if (!fromCookie) change(Temporal.Now.timeZoneId());
  }, [change, fromCookie]);

  return [shown, change] as const;
}

function TimeZonePicker({
  onChange,
  value,
}: {
  readonly onChange: (timeZone: string) => void;
  readonly value: string;
}) {
  const options = (timeZones.includes(value) ? timeZones : [value, ...timeZones]).map((zone) => ({
    label: zone.replaceAll("_", " "),
    value: zone,
  }));
  return (
    <Select items={options} onValueChange={(zone) => zone !== null && onChange(zone)} value={value}>
      <SelectTrigger aria-label="Time zone" className="w-48 rounded-full" size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
// #endregion time-zone

// #region root
const viewOptions = [
  { label: "Week", value: "week" },
  { label: "Day", value: "day" },
  { label: "Month", value: "month" },
] as const;

export interface TeamCalendarProps {
  readonly location: CalendarLocation;
  readonly meetings: readonly MeetingJson[];
  /** When the server rendered the page, so both sides agree on today. */
  readonly now: string;
  readonly timeZone: string;
  /** `false` on a first visit, when the time zone is a guess. */
  readonly timeZoneFromCookie: boolean;
}

const subscribeToNothing = () => () => undefined;

/** `false` while the page hydrates, `true` from then on. */
function useHydrated() {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
}

export function TeamCalendar(props: TeamCalendarProps) {
  const { loading, location, navigate } = useCalendarLocation(props.location);
  const { meetings, message, save } = useMeetings(props.meetings);
  const [timeZone, setTimeZone] = useTimeZone(props.timeZone, props.timeZoneFromCookie);
  // The server's clock while hydrating, so both sides render the same today. The browser's clock
  // after that, so the now line keeps moving between server renders.
  const serverNow = useHydrated() ? {} : { now: Temporal.Instant.from(props.now) };

  return (
    <Calendar.Root
      {...serverNow}
      anchorDate={Temporal.PlainDate.from(location.date)}
      events={meetings}
      locale={locale}
      onAnchorDateChange={(date) => navigate({ date: date.toString() })}
      onEventChange={save}
      onViewChange={(view) => navigate({ view })}
      policies={policies}
      timeZone={timeZone}
      view={location.view}
      weekRules={weekRules}
    >
      <Calendar.Frame className="flex h-full flex-col">
        <CalendarToolbar calendar={Calendar} className="border-b">
          <ViewSwitcher
            onValueChange={(view) => navigate({ view })}
            options={viewOptions}
            value={location.view}
          />
        </CalendarToolbar>
        {/* Stays on screen while the next range loads; only this bar says so. */}
        <div
          aria-hidden="true"
          className={`h-0.5 shrink-0 bg-brand transition-opacity ${loading ? "opacity-100 motion-safe:animate-pulse" : "opacity-0"}`}
        />
        <Calendar.Viewport aria-busy={loading} className="min-h-0 flex-1">
          <Calendar.ActiveView />
        </Calendar.Viewport>
        <footer className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t px-4 py-2 text-sm">
          <TimeZonePicker onChange={setTimeZone} value={timeZone} />
          <p className="text-fd-muted-foreground" role="status">
            {message}
          </p>
        </footer>
        <Calendar.Announcer messages={calendarAnnouncements} />
      </Calendar.Frame>
    </Calendar.Root>
  );
}
// #endregion root
