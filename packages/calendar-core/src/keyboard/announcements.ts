import type { CalendarEventInterval } from "../events";
import type { EventId, ResourceId } from "../ids";
import type { NormalizedCalendarEvent } from "../snapshots/types";
import type { CalendarEventPlacement } from "../transactions/types";

export type CalendarInteractionCause = "create" | "move" | "resize-end" | "resize-start";

interface CalendarInteractionUpdateBase {
  readonly cause: CalendarInteractionCause;
  /** The event being changed; `null` when creating. */
  readonly event: NormalizedCalendarEvent<unknown, EventId, ResourceId> | null;
  readonly input: "keyboard" | "pointer";
  /** The event's placement before the interaction; `null` when creating. */
  readonly original: CalendarEventPlacement | null;
  /** Where the change would land; `null` while the pointer is over nowhere it can drop. */
  readonly proposed: CalendarEventPlacement | null;
}

/** One step in a move, resize, or create, from the keyboard or the pointer. */
export type CalendarInteractionUpdate = CalendarInteractionUpdateBase &
  (
    | { readonly phase: "cancel" }
    | { readonly phase: "start" }
    | { readonly phase: "step" }
    | {
        readonly phase: "commit";
        /** The change as saved, after policies adjusted it. */
        readonly proposed: CalendarEventPlacement;
      }
    | {
        readonly phase: "reject";
        /** The policy or transaction reason, such as `"read-only"` or `"handler-error"`. */
        readonly reason: string;
      }
  );

export type CalendarInteractionPhase = CalendarInteractionUpdate["phase"];

export interface CalendarAnnouncementContext {
  /** Formats a placement the way the drag preview labels it. */
  readonly formatRange: (placement: CalendarEventInterval) => string;
  readonly locale: Intl.Locale | string;
  /** A resource's title from the root's resources, to name where an event goes; `undefined` for an unknown ID. */
  readonly resourceTitle: (resourceId: ResourceId) => string | undefined;
  /** The display time zone. */
  readonly timeZone: string;
}

/** Builds what a screen reader hears for one phase; `null` says nothing. */
export type CalendarAnnouncementBuilder<TPhase extends CalendarInteractionPhase> = (
  update: Extract<CalendarInteractionUpdate, { readonly phase: TPhase }>,
  context: CalendarAnnouncementContext,
) => string | null;

/**
 * Localized announcements for moves, resizes, and creates. The calendar packages ship no text:
 * the registry's calendar source has an English set to copy and translate.
 */
export type CalendarAnnouncementMessages = {
  readonly [TPhase in CalendarInteractionPhase]: CalendarAnnouncementBuilder<TPhase>;
} & {
  /** Replaces `formatPlacementRange` in messages and the drag preview's label. */
  readonly formatRange?: (
    placement: CalendarEventInterval,
    options: Pick<CalendarAnnouncementContext, "locale" | "timeZone">,
  ) => string;
};

/** Where the keyboard and pointer layers report interactions, and how they label ranges. */
export interface CalendarAnnouncer {
  readonly announce: (update: CalendarInteractionUpdate) => void;
  readonly formatRange: (placement: CalendarEventInterval) => string;
}

interface RangeFormats {
  readonly date: Intl.DateTimeFormat;
  readonly dateTime: Intl.DateTimeFormat;
  readonly time: Intl.DateTimeFormat;
}

const rangeFormats = new Map<string, RangeFormats>();

function formatsFor(locale: Intl.Locale | string | undefined): RangeFormats {
  const key = String(locale ?? "");
  let formats = rangeFormats.get(key);
  if (formats === undefined) {
    const time = { hour: "numeric", minute: "2-digit" } as const;
    formats = {
      date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }),
      dateTime: new Intl.DateTimeFormat(locale, { ...time, day: "numeric", month: "short" }),
      time: new Intl.DateTimeFormat(locale, time),
    };
    rangeFormats.set(key, formats);
  }
  return formats;
}

/**
 * A placement's range on the display time zone's wall clock: "7:00 – 7:45 AM", with dates when
 * it spans days ("Oct 8, 10:00 PM – Oct 9, 1:00 AM"), or the dates of an all-day event
 * ("Oct 8 – 10"). Ending at the next midnight still reads as a time.
 */
export function formatPlacementRange(
  placement: CalendarEventInterval,
  { locale, timeZone }: { readonly locale?: Intl.Locale | string; readonly timeZone: string },
): string {
  const formats = formatsFor(locale);
  if (placement.kind === "all-day") {
    return formats.date.formatRange(placement.start, placement.end.subtract({ days: 1 }));
  }
  const wall = (point: Temporal.Instant | Temporal.PlainDateTime) =>
    point instanceof Temporal.Instant
      ? point.toZonedDateTimeISO(timeZone).toPlainDateTime()
      : point;
  const start = wall(placement.start);
  const end = wall(placement.end);
  const nextMidnight = start.toPlainDate().add({ days: 1 }).toPlainDateTime();
  return Temporal.PlainDateTime.compare(end, nextMidnight) <= 0
    ? formats.time.formatRange(start.toPlainTime(), end.toPlainTime())
    : formats.dateTime.formatRange(start, end);
}
