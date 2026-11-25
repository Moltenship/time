import type {
  CalendarDraftBusy,
  CalendarEnvironmentBase,
  CalendarResourceStatus,
} from "@moltenship/calendar";

/*
 * A resource's status in words, for every framework's status badge: busy, free, outside hours or
 * closed, and until when. The English words live here; edit or translate them in place.
 */

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

const defaultOptions = Object.freeze({});

/** A view's `resourceStatus` option as options, or `null` when it is off. */
export function resourceStatusOptions<TOptions extends object>(
  option: boolean | TOptions | undefined,
): TOptions | null {
  return option === true
    ? (defaultOptions as TOptions)
    : option === false || option === undefined
      ? null
      : option;
}

type Environment = Pick<CalendarEnvironmentBase, "locale" | "timeZone">;

/** An instant as the words after "until", or nothing without one. */
export type ResourceStatusUntil = (until: Temporal.Instant | null) => string | undefined;

function earliest(...instants: (Temporal.Instant | null)[]): Temporal.Instant | null {
  return (
    instants
      .filter((instant) => instant !== null)
      .sort((left, right) => Temporal.Instant.compare(left, right))[0] ?? null
  );
}

/** A status in words: busy first, then free, outside hours, or closed for the day. */
export function summarizeResourceStatus(
  { availability, busy }: CalendarResourceStatus,
  until: ResourceStatusUntil,
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
export function summarizeDraft(
  { events, outsideHours }: CalendarDraftBusy,
  labels: ResourceStatusLabels,
): ResourceStatusSummary {
  if (events.length > 0) return { state: "busy", text: labels.busy() };
  if (outsideHours) return { state: "outside-hours", text: labels.outsideHours() };
  return { state: "free", text: labels.free() };
}

export interface ResourceStatusFormats {
  readonly date: Intl.DateTimeFormat;
  readonly dayTime: Intl.DateTimeFormat;
  readonly time: Intl.DateTimeFormat;
}

export function resourceStatusFormats({ locale, timeZone }: Environment): ResourceStatusFormats {
  return {
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
  };
}

/**
 * "until 3:00 PM" on the display clock, with the weekday within the next six days, and the date
 * further out, counted from `now`.
 */
export function resourceStatusUntil(
  formats: ResourceStatusFormats,
  now: Temporal.Instant,
  timeZone: string,
): ResourceStatusUntil {
  const today = now.toZonedDateTimeISO(timeZone).toPlainDate();
  return (instant) => {
    if (instant === null) return undefined;
    const days = today.until(instant.toZonedDateTimeISO(timeZone).toPlainDate()).days;
    // A weekday names only the coming week; further out, the date does.
    const format = days === 0 ? formats.time : days < 7 ? formats.dayTime : formats.date;
    return format.format(instant.epochMilliseconds);
  };
}

/** `data-busy` and `data-outside-hours` for a header during a draft, for CSS to style. */
export function draftStatusAttributes(status: { readonly draft: CalendarDraftBusy | null } | null) {
  const draft = status?.draft ?? null;
  return {
    "data-busy": draft !== null && draft.events.length > 0 ? "" : undefined,
    "data-outside-hours": draft?.outsideHours === true ? "" : undefined,
  };
}
