import {
  useDraftBusy,
  useNow,
  useResourceStatus,
  type CalendarDraftBusy,
  type CalendarEnvironmentBase,
  type CalendarResource,
  type CalendarResourceStatus,
  type ResourceId,
} from "@moltenship/calendar";
import { useMemo, type ComponentProps, type ComponentType } from "react";

import { Badge } from "@registry/ui/badge";
import { cn } from "cn";

/** What a status badge shows. Busy wins: events occupy time even outside working hours. */
export type ResourceStatusState = "busy" | "closed" | "free" | "outside-hours";

export interface ResourceStatusSummary {
  readonly state: ResourceStatusState;
  /** The status in words, such as "Busy until 3:00 PM" or "Closed today, Company holiday". */
  readonly text: string;
}

/**
 * The words of a status, for the badge and screen readers alike. `until` is a time on the display
 * clock, such as "3:00 PM", "Mon 9:00 AM" or "Oct 21, 9:00 AM"; it is absent during a draft,
 * whose time is the draft's.
 */
export interface ResourceStatusLabels {
  readonly busy: (until?: string) => string;
  readonly free: (until?: string) => string;
  readonly outsideHours: (until?: string) => string;
  /** A day without hours, with its exception's label when one closes it. */
  readonly closedToday: (label?: string) => string;
}

export const resourceStatusLabels: ResourceStatusLabels = {
  busy: (until) => (until === undefined ? "Busy" : `Busy until ${until}`),
  closedToday: (label) => (label === undefined ? "Closed today" : `Closed today, ${label}`),
  free: (until) => (until === undefined ? "Free" : `Free until ${until}`),
  outsideHours: (until) => (until === undefined ? "Outside hours" : `Outside hours until ${until}`),
};

/** What a resource header's status gets during a draft; see `ResourceStatusOptions`. */
export interface ResourceDraftStatusProps extends CalendarDraftBusy {
  /** The classes the badge would get in its place, such as how it sits in its row. */
  readonly className?: string;
  /** The resource, or `null` for the Unassigned column. */
  readonly resource: CalendarResource<unknown, ResourceId> | null;
}

/** How the resource views show each resource's status; `resourceStatus: true` takes defaults. */
export interface ResourceStatusOptions {
  /** Words in place of the English ones, for the badge and screen readers. */
  readonly labels?: Partial<ResourceStatusLabels>;
  /**
   * Draws the status while a draft is being made, in place of the badge, as `ResourceHeader`
   * replaces a header: the resource's busy events during the draft and whether it falls outside
   * its hours. For the draft's range, call `useCalendarDraft`, so only components that need it
   * re-render on every step.
   */
  readonly DraftStatus?: ComponentType<ResourceDraftStatusProps>;
}

const defaultOptions: ResourceStatusOptions = Object.freeze({});

/** A view's `resourceStatus` option as options, or `null` when it is off. */
export function resourceStatusOptions(
  option: boolean | ResourceStatusOptions | undefined,
): ResourceStatusOptions | null {
  return option === true
    ? defaultOptions
    : option === false || option === undefined
      ? null
      : option;
}

type Environment = Pick<CalendarEnvironmentBase, "locale" | "timeZone">;
type Until = (until: Temporal.Instant | null) => string | undefined;

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
  labels: ResourceStatusLabels,
): ResourceStatusSummary {
  if (busy.busy) return { state: "busy", text: labels.busy(until(busy.freeAt)) };
  if (availability.available) {
    const end = earliest(availability.closesAt, busy.nextEventAt);
    return { state: "free", text: labels.free(until(end)) };
  }
  if (availability.reason === "outside-hours") {
    return { state: "outside-hours", text: labels.outsideHours(until(availability.opensAt)) };
  }
  return { state: "closed", text: labels.closedToday(availability.label) };
}

/** A draft's status in words: busy with an event, then outside hours, then free. */
function summarizeDraft(
  { events, outsideHours }: CalendarDraftBusy,
  labels: ResourceStatusLabels,
): ResourceStatusSummary {
  if (events.length > 0) return { state: "busy", text: labels.busy() };
  if (outsideHours) return { state: "outside-hours", text: labels.outsideHours() };
  return { state: "free", text: labels.free() };
}

/**
 * A resource's status now on the calendar's clock, in words: "until 3:00 PM" on the display
 * clock, with the weekday within the next six days, and the date further out. `null` while
 * server rendering, and for a `null` resource.
 */
export function useResourceStatusSummary(
  { locale, timeZone }: Environment,
  resourceId: ResourceId | null,
  labels: ResourceStatusLabels = resourceStatusLabels,
): ResourceStatusSummary | null {
  const status = useResourceStatus(resourceId);
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
    if (instant === null) return undefined;
    const days = today.until(instant.toZonedDateTimeISO(timeZone).toPlainDate()).days;
    // A weekday names only the coming week; further out, the date does.
    const format = days === 0 ? formats.time : days < 7 ? formats.dayTime : formats.date;
    return format.format(instant.epochMilliseconds);
  };
  return summarizeResourceStatus(status, until, labels);
}

/** What a resource header shows: the draft's status while one is made, the status now otherwise. */
export interface ResourceHeaderStatusValue {
  /** The resource during the draft, or `null` without one. */
  readonly draft: CalendarDraftBusy | null;
  readonly options: ResourceStatusOptions;
  readonly resource: CalendarResource<unknown, ResourceId> | null;
  readonly summary: ResourceStatusSummary | null;
}

/**
 * A resource header's status, now and during a draft, with `options`; `null` without options,
 * for a group, whose own bookings aren't its members', or for the Unassigned column.
 */
export function useResourceHeaderStatus(
  environment: Environment,
  resource: {
    readonly hasChildren: boolean;
    readonly id: ResourceId | null;
    readonly resource: CalendarResource<unknown, ResourceId> | null;
  },
  options: ResourceStatusOptions | null,
): ResourceHeaderStatusValue | null {
  const shown = options !== null && !resource.hasChildren ? resource.id : null;
  const custom = options?.labels;
  const labels = useMemo(() => ({ ...resourceStatusLabels, ...custom }), [custom]);
  const draft = useDraftBusy(shown);
  const now = useResourceStatusSummary(environment, shown, labels);
  if (options === null || shown === null) return null;
  return {
    draft,
    options,
    resource: resource.resource,
    summary: draft === null ? now : summarizeDraft(draft, labels),
  };
}

/** `data-busy` and `data-outside-hours` for a header during a draft, for CSS to style. */
export function draftStatusAttributes(status: ResourceHeaderStatusValue | null) {
  const draft = status?.draft ?? null;
  return {
    "data-busy": draft !== null && draft.events.length > 0 ? "" : undefined,
    "data-outside-hours": draft?.outsideHours === true ? "" : undefined,
  };
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

/**
 * A header's status: the options' `DraftStatus` during a draft when it has one, the badge
 * otherwise; nothing while server rendering.
 */
export function ResourceStatusPart({
  className,
  status,
}: {
  readonly className?: string;
  readonly status: ResourceHeaderStatusValue;
}) {
  const { draft, options, resource, summary } = status;
  const { DraftStatus } = options;
  if (draft !== null && DraftStatus !== undefined) {
    return (
      <>
        <DraftStatus
          className={className}
          events={draft.events}
          outsideHours={draft.outsideHours}
          resource={resource}
        />
        {/* Your part draws the status as it likes; screen readers still hear it in words. */}
        {summary !== null && <span className="sr-only">{summary.text}</span>}
      </>
    );
  }
  return summary === null ? null : <ResourceStatusBadge className={className} summary={summary} />;
}
