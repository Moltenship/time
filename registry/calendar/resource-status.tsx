import {
  useNow,
  useResourceStatus,
  type CalendarEnvironmentBase,
  type CalendarResourceStatus,
  type ResourceId,
} from "@moltenship/calendar";
import { useMemo, type ComponentProps } from "react";

import { Badge } from "@registry/ui/badge";
import { cn } from "cn";

/** What a status badge shows. Busy wins: events occupy time even outside working hours. */
export type ResourceStatusState = "busy" | "closed" | "free" | "outside-hours";

export interface ResourceStatusSummary {
  readonly state: ResourceStatusState;
  /** The status in words, such as "Busy until 3:00 PM" or "Closed today, Company holiday". */
  readonly text: string;
}

type Environment = Pick<CalendarEnvironmentBase, "locale" | "timeZone">;
type Until = (until: Temporal.Instant | null) => string;

function earliest(...instants: (Temporal.Instant | null)[]): Temporal.Instant | null {
  return (
    instants
      .filter((instant) => instant !== null)
      .sort((left, right) => Temporal.Instant.compare(left, right))[0] ?? null
  );
}

/** A status in words: busy first, then free, outside hours, or closed for the day. */
function summarizeResourceStatus(
  { availability, busy }: CalendarResourceStatus,
  until: Until,
): ResourceStatusSummary {
  if (busy.busy) return { state: "busy", text: `Busy${until(busy.freeAt)}` };
  if (availability.available) {
    return {
      state: "free",
      text: `Free${until(earliest(availability.closesAt, busy.nextEventAt))}`,
    };
  }
  if (availability.reason === "outside-hours") {
    return { state: "outside-hours", text: `Outside hours${until(availability.opensAt)}` };
  }
  return {
    state: "closed",
    text: availability.label === undefined ? "Closed today" : `Closed today, ${availability.label}`,
  };
}

/**
 * A resource's status now on the calendar's clock, in words: " until 3:00 PM" on the display
 * clock, with the weekday within the next six days, and the date further out. `null` while
 * server rendering, and for the unassigned bucket.
 */
export function useResourceStatusSummary(
  { locale, timeZone }: Environment,
  resourceId: ResourceId | null | undefined,
): ResourceStatusSummary | null {
  const status = useResourceStatus(resourceId ?? null);
  // The status changes only at its own instants; the clock tells "3:00 PM" from "Mon 3:00 PM".
  const now = useNow();
  const formats = useMemo(
    () => ({
      dayTime: new Intl.DateTimeFormat(locale, {
        hour: "numeric",
        minute: "2-digit",
        timeZone,
        weekday: "short",
      }),
      date: new Intl.DateTimeFormat(locale, {
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        month: "short",
        timeZone,
      }),
      time: new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone }),
    }),
    [locale, timeZone],
  );
  if (status === null || now === null) return null;
  const today = now.toZonedDateTimeISO(timeZone).toPlainDate();
  const until: Until = (instant) => {
    if (instant === null) return "";
    const days = today.until(instant.toZonedDateTimeISO(timeZone).toPlainDate()).days;
    // A weekday names only the coming week; further out, the date does.
    const format = days === 0 ? formats.time : days < 7 ? formats.dayTime : formats.date;
    return ` until ${format.format(instant.epochMilliseconds)}`;
  };
  return summarizeResourceStatus(status, until);
}

export interface ResourceStatusBadgeProps extends Omit<ComponentProps<"span">, "children"> {
  readonly summary: ResourceStatusSummary;
}

/**
 * A status as a small outline badge: its words carry the state, and `data-state` colours the dot
 * before them, `--calendar-busy` when busy and `--calendar-free` when free.
 */
export function ResourceStatusBadge({ className, summary, ...props }: ResourceStatusBadgeProps) {
  return (
    <Badge
      data-slot="resource-status"
      data-state={summary.state}
      // The whole status on hover, where a narrow column cuts it short.
      title={summary.text}
      variant="outline"
      className={cn("max-w-full min-w-0 gap-1.5 px-1.5 font-normal", className)}
      {...props}
    >
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full bg-muted-foreground in-data-[state=busy]:bg-calendar-busy in-data-[state=free]:bg-calendar-free"
      />
      {/* Its own direction, so a cut-short English status keeps its first word in RTL. */}
      <span dir="auto" className="truncate">
        {summary.text}
      </span>
    </Badge>
  );
}
