import type {
  CalendarChangeCause,
  CalendarEventInterval,
  CalendarEventPlacement,
  EventId,
  ResourceId,
} from "@moltenship/calendar-core";

import { coerceRecurrenceDate } from "../dates";
import { RecurrenceRuleError } from "../errors";
import {
  datesEqual,
  fromWall,
  intervalOf,
  isTimeZone,
  seriesTimeOf,
  toWall,
  writtenStart,
  type SeriesTime,
} from "../internal/dates";
import { occurrenceId, recurrenceKey } from "../occurrence-id";
import { expandRecurrenceRule } from "../rule/expand";
import type {
  EventRecurrence,
  RecurrenceAdapters,
  RecurrenceDate,
  RecurrencePeriod,
  RecurrenceRule,
  RecurrenceRuleStart,
} from "../types";
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

/** Same members, in any order. */
function sameResources(
  left: readonly (string | number)[],
  right: readonly (string | number)[],
): boolean {
  return left.length === right.length && left.every((resourceId) => right.includes(resourceId));
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
  // Only the interval's fields, since adapters may hand back the event itself.
  const interval = adapters.event.getInterval(link.series);
  const first = intervalOf(interval.start, interval.end, interval);
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
  const written =
    first.kind === "timed"
      ? writtenStart(recurrence.wallStart, first.start, time.timeZone)
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

/** The clock a placement shows on: its zone, the series' for a timed one without, else the default. */
function clockOf(
  placement: CalendarEventPlacement<ResourceId>,
  series: Series<unknown, EventId, ResourceId>,
  defaultTimeZone: string,
): SeriesTime {
  return placement.kind === "timed"
    ? {
        kind: "timed",
        timeZone:
          placement.sourceTimeZone ??
          (series.time.kind === "timed" ? series.time.timeZone : defaultTimeZone),
      }
    : { kind: placement.kind, timeZone: defaultTimeZone };
}

/**
 * The change as the same gesture makes it on the series' own clock. The calendar moves and resizes
 * occurrences, and its editor shows their times, on its clock, `options.timeZone`, which defaults
 * to the series': a change there is calendar days on its wall clock and then exact time, as core's
 * placement helpers apply it. Replayed on the series' clock, a drag by a week keeps the series' time
 * of day in a week when the calendar's zone has changed DST and the series' hasn't, and a drag an
 * hour later moves it an hour. A drag's days count from the series' written time, so an occurrence a
 * DST gap moved forward and dragged a day keeps the time written; an editor's update names the
 * times it shows, so it counts from where the occurrence shows. A move keeps the occurrence's
 * length, and a resize or an update moves each end it changes by its own change. An end dropped on
 * either of two equal wall times there keeps its instant. An override in another zone measures the change on
 * its own clock, so it replays there; changes that give the occurrence another kind or zone are left
 * as they are.
 */
export function onSeriesClock<TChange extends Change<unknown, EventId, ResourceId>>(
  series: Series<unknown, EventId, ResourceId>,
  change: TChange,
  options: Options<unknown, EventId>,
): TChange | RecurrenceEditRejection {
  if (options.timeZone !== undefined && !isTimeZone(options.timeZone)) {
    return reject("invalid-time-zone", `${options.timeZone} isn't a time zone.`);
  }
  if (change.cause === "delete") return change;
  const { original, proposed } = change;
  if (original.kind !== "timed" || proposed.kind !== "timed") return change;
  const defaultTimeZone = options.defaultTimeZone ?? "UTC";
  const clock = clockOf(original, series, defaultTimeZone);
  if (clockOf(proposed, series, defaultTimeZone).timeZone !== clock.timeZone) return change;
  if (!isTimeZone(clock.timeZone)) return change;
  const timeZone = options.timeZone ?? clock.timeZone;
  // On the series' own clock, a start a DST gap moved forward reads back to its written time.
  const onSeries = series.time.kind === "timed" && clock.timeZone === series.time.timeZone;

  // The change on the calendar's clock: calendar days, then exact time.
  const delta = (from: Temporal.Instant, to: Temporal.Instant) => {
    const shown = from.toZonedDateTimeISO(timeZone);
    const days = shown.toPlainDate().until(to.toZonedDateTimeISO(timeZone).toPlainDate()).days;
    return { days, time: shown.add({ days }).toInstant().until(to) };
  };
  const written = onSeries
    ? seriesWall(original.start, keyShift(series, undefined))
    : toWall(original.start, clock);
  // A drag's start from the written time; an editor's times, and ends, from where they show.
  const dragged = (from: Temporal.Instant, to: Temporal.Instant) => {
    const { days, time } = delta(from, to);
    return (fromWall(written.add({ days }), clock) as Temporal.Instant).add(time);
  };
  const shown = (from: Temporal.Instant, to: Temporal.Instant) => {
    const { days, time } = delta(from, to);
    return from.toZonedDateTimeISO(clock.timeZone).add({ days }).toInstant().add(time);
  };
  // A target on the same wall time as the drop, as either 02:30 of DST's end, is the drop.
  const keep = (dropped: Temporal.Instant, target: Temporal.Instant) =>
    toWall(dropped, clock).equals(toWall(target, clock)) ? dropped : target;

  const length = original.start.until(original.end);
  let { end, start } = proposed;
  switch (change.cause) {
    case "move":
      start = keep(proposed.start, dragged(original.start, proposed.start));
      end = start.add(length);
      break;
    case "resize-start":
      start = keep(proposed.start, dragged(original.start, proposed.start));
      break;
    case "resize-end":
      end = keep(proposed.end, shown(original.end, proposed.end));
      break;
    case "update": {
      start = keep(proposed.start, shown(original.start, proposed.start));
      const kept = Temporal.Duration.compare(proposed.start.until(proposed.end), length) === 0;
      end = kept ? start.add(length) : keep(proposed.end, shown(original.end, proposed.end));
      break;
    }
  }
  if (Temporal.Instant.compare(end, start) <= 0) return change;
  return { ...change, proposed: { ...proposed, end, start } };
}

/**
 * The original starts of the series' cancelled overrides among `options.overrides`, by recurrence
 * key: occurrences that don't show though the rule has them. As in the expander, of two overrides
 * for one occurrence the later wins.
 */
export function cancelledStarts<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(
  series: Series<TEvent, TEventId, TResourceId>,
  adapters: RecurrenceAdapters<TEvent, TEventId, TResourceId>,
  options: Options<TEvent, TEventId>,
): ReadonlySet<string> {
  const cancelled = new Map<string, boolean>();
  const shift = keyShift(series, undefined);
  for (const event of options.overrides ?? []) {
    const override = adapters.recurrence.getOverride?.(event);
    if (override === undefined || override.seriesId !== series.id) continue;
    const key = readKey(shift, override.recurrenceId, "start");
    if (key !== undefined) cancelled.set(recurrenceKey(key), override.cancelled === true);
  }
  return new Set([...cancelled].flatMap(([key, hidden]) => (hidden ? [key] : [])));
}

export function measureMove(
  series: Series<unknown, EventId, ResourceId>,
  change: {
    readonly cause: CalendarChangeCause;
    readonly original: CalendarEventPlacement<ResourceId>;
    readonly proposed: CalendarEventPlacement<ResourceId>;
  },
  options: Options<unknown, EventId>,
): Move | RecurrenceEditRejection {
  const { original, proposed } = change;
  const defaultTimeZone = options.defaultTimeZone ?? "UTC";
  const from = clockOf(original, series, defaultTimeZone);
  const shown = clockOf(proposed, series, defaultTimeZone);
  for (const timeZone of [from.timeZone, shown.timeZone]) {
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
