import type {
  CalendarChangeCause,
  CalendarEventInterval,
  CalendarEventPlacement,
  EventId,
  ResourceId,
} from "@moltenship/calendar-core";

import { coerceRecurrenceDate } from "../dates";
import { RecurrenceRuleError } from "../errors";
import { occurrenceId } from "../occurrence-id";
import { expandRecurrenceRule } from "../rule/expand";
import type {
  EventRecurrence,
  RecurrenceAdapters,
  RecurrenceDate,
  RecurrencePeriod,
  RecurrenceRule,
  RecurrenceRuleStart,
} from "../types";
import {
  datesEqual,
  isTimeZone,
  sameResources,
  seriesTimeOf,
  toWall,
  type SeriesTime,
} from "./dates";
import { readKey, rekey, rekeyExtra, seriesWall, targetWall } from "./keys";
import type {
  RecurrenceEditRejection,
  RecurrenceEditRejectionReason,
  RecurrenceKeyShift,
  RecurringOccurrenceChange,
  ResolveRecurrenceEditOptions,
} from "./types";

export type Change<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> = RecurringOccurrenceChange<TEvent, TEventId, TResourceId>;
export type Options<TEvent, TEventId extends EventId> = ResolveRecurrenceEditOptions<
  TEvent,
  TEventId
>;

/** A series' master, read once per edit. */
export interface Series<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly event: TEvent;
  readonly first: CalendarEventInterval;
  readonly id: TEventId;
  readonly placement: CalendarEventPlacement<TResourceId>;
  readonly recurrence: EventRecurrence;
  /** The edited occurrence's original start, in the series' kind. */
  readonly recurrenceId: RecurrenceDate;
  readonly time: SeriesTime;
  /** The first occurrence on the wall clock, as written when a DST gap moved it. */
  readonly wallFirst: Temporal.PlainDateTime;
  /** `recurrence.wallStart` when it still resolves to the first start, as the engine reads it. */
  readonly wallStart?: Temporal.PlainDateTime;
  /** The time of day a timed series repeats at. */
  readonly wallTime?: Temporal.PlainTime;
}

/** Where the edited occurrence goes, measured in the series' own time. */
export interface Move {
  /** Calendar days its date moves. */
  readonly days: number;
  /** The clock the occurrence showed on before the change. */
  readonly from: SeriesTime;
  /** The clock it shows on after it. */
  readonly shown: SeriesTime;
  /** How far its time of day moves. */
  readonly time: Temporal.Duration;
  /** The kind and zone of the proposed placement, which the series takes. */
  readonly to: SeriesTime;
  /** The whole change on the wall clock. */
  readonly wall: Temporal.Duration;
  readonly wallFrom: Temporal.PlainDateTime;
  readonly wallTo: Temporal.PlainDateTime;
}

export const noIds: ReadonlyMap<EventId, string> = new Map();

export function reject(
  reason: RecurrenceEditRejectionReason,
  message: string,
): RecurrenceEditRejection {
  return { message, reason, type: "rejected" };
}

/** A rejection for an engine error; anything but a `RangeError` is a bug, so it rethrows. */
export function ruleRejection(error: unknown): RecurrenceEditRejection {
  if (error instanceof RecurrenceRuleError) return reject(error.code, error.message);
  if (error instanceof RangeError) return reject("invalid-rule", error.message);
  throw error;
}

/** Only the interval's fields, since adapters may hand back the event itself. */
export function intervalOf(interval: CalendarEventInterval): CalendarEventInterval {
  switch (interval.kind) {
    case "timed":
      return {
        end: interval.end,
        kind: "timed",
        ...(interval.sourceTimeZone === undefined
          ? {}
          : { sourceTimeZone: interval.sourceTimeZone }),
        start: interval.start,
      };
    case "all-day":
      return { end: interval.end, kind: "all-day", start: interval.start };
    case "floating":
      return { end: interval.end, kind: "floating", start: interval.start };
  }
}

/** A start and an end of the same kind, with resources, as a placement. */
function placementOf<TResourceId extends ResourceId>(
  start: RecurrenceDate,
  end: RecurrenceDate,
  resourceIds: readonly TResourceId[],
  sourceTimeZone: string | undefined,
): CalendarEventPlacement<TResourceId> {
  if (start instanceof Temporal.Instant && end instanceof Temporal.Instant) {
    return {
      end,
      kind: "timed",
      resourceIds,
      ...(sourceTimeZone === undefined ? {} : { sourceTimeZone }),
      start,
    };
  }
  if (start instanceof Temporal.PlainDate && end instanceof Temporal.PlainDate) {
    return { end, kind: "all-day", resourceIds, start };
  }
  if (start instanceof Temporal.PlainDateTime && end instanceof Temporal.PlainDateTime) {
    return { end, kind: "floating", resourceIds, start };
  }
  throw new RangeError("A placement's start and end must be of one kind.");
}

export function loadSeries<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(
  change: Change<TEvent, TEventId, TResourceId>,
  adapters: RecurrenceAdapters<TEvent, TEventId, TResourceId>,
  options: Options<TEvent, TEventId>,
): Series<TEvent, TEventId, TResourceId> | RecurrenceEditRejection {
  const link = change.event.recurrence;
  if (link.series === undefined) {
    return reject(
      "missing-series",
      "The series' master isn't loaded, so only this occurrence can change.",
    );
  }
  const recurrence = adapters.recurrence.getRecurrence(link.series);
  if (recurrence === undefined) {
    return reject("missing-series", "The occurrence's series has no recurrence.");
  }
  const first = intervalOf(adapters.event.getInterval(link.series));
  const time = seriesTimeOf(first, options.defaultTimeZone);
  if (!isTimeZone(time.timeZone)) {
    return reject("invalid-time-zone", `${time.timeZone} isn't a time zone.`);
  }
  const recurrenceId = coerceRecurrenceDate(link.recurrenceId, first, "start", {
    defaultTimeZone: time.timeZone,
  });
  if (recurrenceId === undefined) {
    return reject("date-kind-mismatch", "The occurrence's original start doesn't fit its series.");
  }
  // A stale `wallStart`, which no longer resolves to the first start, is ignored, as the engine
  // ignores it.
  const declared = recurrence.wallStart?.withCalendar("iso8601");
  const written =
    first.kind === "timed" &&
    declared !== undefined &&
    datesEqual(
      declared.toZonedDateTime(time.timeZone, { disambiguation: "compatible" }).toInstant(),
      first.start,
    )
      ? declared
      : undefined;
  const wallFirst = written ?? toWall(first.start, time);
  return {
    event: link.series,
    first,
    id: link.seriesId,
    placement: { ...first, resourceIds: adapters.event.getResourceIds(link.series) },
    recurrence,
    recurrenceId,
    time,
    wallFirst,
    ...(written === undefined ? {} : { wallStart: written }),
    ...(first.kind === "timed" ? { wallTime: wallFirst.toPlainTime() } : {}),
  };
}

/** Where the series' rule starts, for the engine. */
export function ruleStart(series: Series<unknown, EventId, ResourceId>): RecurrenceRuleStart {
  return {
    ...series.first,
    ...(series.first.kind === "timed" ? { sourceTimeZone: series.time.timeZone } : {}),
    ...(series.wallStart === undefined ? {} : { wallStart: series.wallStart }),
  };
}

/** Asks the engine whether it can expand a rule the edit would write. */
export function checkRule(
  rule: RecurrenceRule | undefined,
  start: RecurrenceRuleStart,
): RecurrenceEditRejection | undefined {
  if (rule === undefined) return undefined;
  try {
    expandRecurrenceRule(rule, start, { maxIterations: 1 });
    return undefined;
  } catch (error) {
    return ruleRejection(error);
  }
}

export function keyShift(
  series: Series<unknown, EventId, ResourceId>,
  move: Move | undefined,
  anchor?: RecurrenceKeyShift["anchor"],
): RecurrenceKeyShift {
  return {
    ...(anchor === undefined ? {} : { anchor }),
    days: move?.days ?? 0,
    first: series.first,
    kind: move?.to.kind ?? series.time.kind,
    timeZone: series.time.timeZone,
    toTimeZone: move?.to.timeZone ?? series.time.timeZone,
    wall: move?.wall ?? new Temporal.Duration(),
    ...(series.wallTime === undefined ? {} : { wallTime: series.wallTime }),
  };
}

export function measureMove(
  series: Series<unknown, EventId, ResourceId>,
  change: {
    readonly original: CalendarEventPlacement<ResourceId>;
    readonly proposed: CalendarEventPlacement<ResourceId>;
  },
  options: Options<unknown, EventId>,
): Move | RecurrenceEditRejection {
  const { original, proposed } = change;
  const defaultTimeZone = options.defaultTimeZone ?? "UTC";
  const timeOf = (placement: CalendarEventPlacement<ResourceId>): SeriesTime =>
    placement.kind === "timed"
      ? {
          kind: "timed",
          timeZone:
            placement.sourceTimeZone ??
            (series.time.kind === "timed" ? series.time.timeZone : defaultTimeZone),
        }
      : { kind: placement.kind, timeZone: defaultTimeZone };
  const from = timeOf(original);
  const shown = timeOf(proposed);
  for (const { timeZone } of [from, shown]) {
    if (!isTimeZone(timeZone)) return reject("invalid-time-zone", `${timeZone} isn't a time zone.`);
  }
  // The series takes a new kind or zone only when the change gives the occurrence one; an
  // override in another zone or kind measures the change on its own clock.
  const converts = from.kind !== shown.kind || from.timeZone !== shown.timeZone;
  const to = converts ? shown : series.time;

  // Starts on the series' own clock read back to the time it repeats at, so one a DST gap moved
  // forward measures from the written time, as the occurrence's original start does.
  const clock = keyShift(series, undefined);
  const read = (date: RecurrenceDate, time: SeriesTime) =>
    time.kind === series.time.kind &&
    (time.kind !== "timed" || time.timeZone === series.time.timeZone)
      ? seriesWall(date, clock)
      : toWall(date, time);
  const wallFrom = seriesWall(series.recurrenceId, clock);
  const shownFrom = read(original.start, from);
  const shownTo = read(proposed.start, shown);

  // The user's change, from where the occurrence showed to where it goes, applied to its original
  // start: a moved override changes the series by what the user did, not to where it is. Days
  // are all that carries between a date and a time, unless the series takes the dropped time.
  const days = shownFrom.toPlainDate().until(shownTo.toPlainDate()).days;
  const onDay = wallFrom.toPlainDate().add({ days });
  const wallTo =
    to.kind === "all-day"
      ? onDay.toPlainDateTime()
      : converts && from.kind === "all-day"
        ? onDay.toPlainDateTime(shownTo.toPlainTime())
        : from.kind === "all-day" || shown.kind === "all-day"
          ? wallFrom.add({ days })
          : wallFrom.add(shownFrom.until(shownTo));
  return {
    days: wallFrom.toPlainDate().until(wallTo.toPlainDate()).days,
    from,
    shown,
    time: wallFrom.toPlainTime().until(wallTo.toPlainTime()),
    to,
    wall: wallFrom.until(wallTo),
    wallFrom,
    wallTo,
  };
}

/**
 * A rejection when the moved rule wouldn't put the edited occurrence where the user's change does,
 * as an ordinal weekday can't in every month: the 2nd Tuesday of a month that starts on a Wednesday
 * moved a day is the 15th, but the 2nd Wednesday is the 8th.
 */
export function landing(
  shift: RecurrenceKeyShift,
  recurrenceId: RecurrenceDate,
  move: Move,
): RecurrenceEditRejection | undefined {
  const landed = targetWall({ ...shift, anchor: undefined }, recurrenceId, true);
  const same =
    landed !== undefined &&
    (move.to.kind === "all-day"
      ? landed.toPlainDate().equals(move.wallTo.toPlainDate())
      : landed.equals(move.wallTo));
  return same
    ? undefined
    : reject(
        "rule-cannot-move",
        `The moved rule doesn't put this occurrence on ${move.wallTo.toPlainDate().toString()}.`,
      );
}

/** The edit leaves every date of the series where it is: same wall time, kind and zone. */
export function isUnchanged(series: Series<unknown, EventId, ResourceId>, move: Move): boolean {
  return (
    move.wall.blank &&
    move.to.kind === series.time.kind &&
    (move.to.kind !== "timed" || move.to.timeZone === series.time.timeZone)
  );
}

/** A placement's length: nominal on its wall clock, or exact. */
function lengthOf(
  placement: CalendarEventInterval,
  time: SeriesTime,
  nominal: boolean,
): Temporal.Duration {
  if (placement.kind === "all-day") return placement.start.until(placement.end);
  if (placement.kind === "floating") return placement.start.until(placement.end);
  return nominal
    ? toWall(placement.start, time).until(toWall(placement.end, time))
    : placement.start.until(placement.end);
}

/**
 * The placement of a series' first occurrence at `start`, with the DURATION it then carries. A move
 * keeps the series' length. A resize or an update changes it as it changed the occurrence: an
 * override's change of length is added to the series', another occurrence's length is taken. The
 * length is nominal when the series has a DURATION, exact otherwise. The series keeps its
 * resources unless the change moved the occurrence to others.
 */
export function seriesPlacement<TResourceId extends ResourceId>(
  start: RecurrenceDate,
  series: Series<unknown, EventId, TResourceId>,
  move: Move,
  change: {
    readonly cause: CalendarChangeCause;
    readonly original: CalendarEventPlacement<TResourceId>;
    readonly proposed: CalendarEventPlacement<TResourceId>;
  },
  overridden: boolean,
): {
  readonly duration?: Temporal.Duration;
  readonly placement: CalendarEventPlacement<TResourceId>;
} {
  const { original, proposed } = change;
  const { to } = move;
  const resourceIds = sameResources(original.resourceIds, proposed.resourceIds)
    ? series.placement.resourceIds
    : proposed.resourceIds;
  // The series keeps its own zone unless the change gave the occurrence a new one.
  const ownZone = series.first.kind === "timed" ? series.first.sourceTimeZone : undefined;
  const sourceTimeZone =
    to.kind === series.time.kind && to.timeZone === series.time.timeZone
      ? ownZone
      : ((proposed.kind === "timed" ? proposed.sourceTimeZone : undefined) ?? ownZone);

  const nominal = series.recurrence.duration !== undefined;
  const kept = to.kind === series.time.kind;
  const seriesLength = series.recurrence.duration ?? lengthOf(series.first, series.time, false);
  const proposedLength = lengthOf(proposed, move.shown, nominal);
  let length = proposedLength;
  if (kept && change.cause === "move") length = seriesLength;
  else if (kept && overridden && original.kind === to.kind && proposed.kind === to.kind) {
    // Lengths add on a wall clock, which takes DURATION's weeks and days as they are.
    const reference = series.wallFirst;
    const changed = reference.until(
      reference
        .add(seriesLength)
        .add(proposedLength)
        .subtract(lengthOf(original, move.from, nominal)),
      { largestUnit: nominal || to.kind !== "timed" ? "days" : "hours" },
    );
    if (changed.sign > 0) length = changed;
  }

  const end =
    start instanceof Temporal.Instant
      ? nominal
        ? start.toZonedDateTimeISO(to.timeZone).add(length).toInstant()
        : start.add(length)
      : start.add(length);
  return {
    ...(nominal ? { duration: length } : {}),
    placement: placementOf(
      start,
      end,
      resourceIds,
      to.kind === "timed" ? sourceTimeZone : undefined,
    ),
  };
}

/** A recurrence with some fields replaced; `undefined` removes one. */
export function withFields(
  recurrence: EventRecurrence,
  fields: { readonly [Key in keyof EventRecurrence]?: EventRecurrence[Key] | undefined },
): EventRecurrence {
  const next: Record<string, unknown> = { ...recurrence };
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return next as EventRecurrence;
}

export function rekeyExceptions(
  dates: readonly RecurrenceDate[] | undefined,
  shift: RecurrenceKeyShift,
): readonly RecurrenceDate[] | undefined {
  return dates?.map((date) => rekey(shift, date, "exception") ?? date);
}

export function rekeyExtras(
  extras: readonly (RecurrenceDate | RecurrencePeriod)[] | undefined,
  shift: RecurrenceKeyShift,
): readonly (RecurrenceDate | RecurrencePeriod)[] | undefined {
  return extras?.map((extra) => rekeyExtra(shift, extra) ?? extra);
}

/** Whether an EXDATE removes the start: exactly, or as the whole day it falls on. */
export function isExcluded(
  series: Series<unknown, EventId, ResourceId>,
  start: RecurrenceDate,
): boolean {
  const shift = keyShift(series, undefined);
  return (series.recurrence.exceptionDates ?? []).some((date) => {
    const key = readKey(shift, date, "exception");
    if (key === undefined) return false;
    if (key instanceof Temporal.PlainDate && !(start instanceof Temporal.PlainDate)) {
      return key.equals(seriesWall(start, shift).toPlainDate());
    }
    return datesEqual(key, start);
  });
}

/** Old occurrence IDs to new ones, for the edited occurrence and the loaded ones that move. */
export function occurrenceIds<TEvent, TEventId extends EventId>(
  editedId: EventId,
  editedKey: RecurrenceDate,
  seriesId: TEventId,
  newSeriesId: TEventId,
  options: Options<TEvent, TEventId>,
  rekeyLoaded: (recurrenceId: RecurrenceDate) => RecurrenceDate | undefined,
): ReadonlyMap<EventId, string> {
  const ids = new Map<EventId, string>();
  const map = (id: EventId, key: RecurrenceDate) => {
    const next = occurrenceId(newSeriesId, key);
    if (next !== id) ids.set(id, next);
  };
  map(editedId, editedKey);
  for (const { id, recurrence } of options.occurrences ?? []) {
    if (recurrence === undefined || recurrence.seriesId !== seriesId || id === editedId) continue;
    const key = rekeyLoaded(recurrence.recurrenceId);
    if (key !== undefined) map(id, key);
  }
  return ids;
}

export function overrideOf<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(
  change: Change<TEvent, TEventId, TResourceId>,
  adapters: RecurrenceAdapters<TEvent, TEventId, TResourceId>,
): { readonly event: TEvent; readonly eventId: TEventId } | undefined {
  const event = change.event.recurrence.override;
  return event === undefined ? undefined : { event, eventId: adapters.event.getId(event) };
}
