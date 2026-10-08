import { comparePlainDates, type PlainDateInterval } from "@moltenship/calendar-temporal";

import type { EventId, ResourceId } from "../ids";
import { compareDayFragments, type EventDayFragment } from "../projection/day-fragments";
import type { NormalizedCalendarEvent } from "../snapshots/types";

/** One event's run of consecutive days within a day-grid row, placed in a lane. */
export interface DayGridSegment<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  /** Zero-based index of the segment's first day within the row. */
  readonly column: number;
  /** The event continues after the segment's last day. */
  readonly endsAfter: boolean;
  readonly event: NormalizedCalendarEvent<TEvent, TEventId, TResourceId>;
  /** One fragment per covered day, in date order. */
  readonly fragments: readonly EventDayFragment<TEvent, TEventId, TResourceId>[];
  /** Zero-based vertical slot; segments in one lane never share a day. */
  readonly lane: number;
  /** Number of days covered. */
  readonly span: number;
  /** The event began before the segment's first day. */
  readonly startsBefore: boolean;
}

export interface DayGridRow<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly laneCount: number;
  readonly range: PlainDateInterval;
  /** Segments in placement order: earlier column, longer span, then day display order. */
  readonly segments: readonly DayGridSegment<TEvent, TEventId, TResourceId>[];
}

export interface DayGridOverflow<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  /** Hidden segment count for each day of the row. */
  readonly hiddenCounts: readonly number[];
  readonly segments: readonly DayGridSegment<TEvent, TEventId, TResourceId>[];
}

type UnplacedSegment<TEvent, TEventId extends EventId, TResourceId extends ResourceId> = Omit<
  DayGridSegment<TEvent, TEventId, TResourceId>,
  "lane"
>;

function toSegment<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(
  range: PlainDateInterval,
  run: readonly EventDayFragment<TEvent, TEventId, TResourceId>[],
): UnplacedSegment<TEvent, TEventId, TResourceId> {
  const first = run[0]!;
  const last = run.at(-1)!;
  return {
    column: range.start.until(first.date).days,
    endsAfter: last.endsAfterDay,
    event: first.event,
    fragments: Object.freeze(run),
    span: run.length,
    startsBefore: first.startsBeforeDay,
  };
}

function segmentsInRow<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(
  range: PlainDateInterval,
  fragments: readonly EventDayFragment<TEvent, TEventId, TResourceId>[],
): UnplacedSegment<TEvent, TEventId, TResourceId>[] {
  const byEvent = new Map<TEventId, EventDayFragment<TEvent, TEventId, TResourceId>[]>();
  for (const fragment of fragments) {
    if (
      comparePlainDates(fragment.date, range.start) < 0 ||
      comparePlainDates(fragment.date, range.end) >= 0
    ) {
      continue;
    }
    const eventFragments = byEvent.get(fragment.event.id);
    if (eventFragments === undefined) byEvent.set(fragment.event.id, [fragment]);
    else eventFragments.push(fragment);
  }

  const segments: UnplacedSegment<TEvent, TEventId, TResourceId>[] = [];
  for (const eventFragments of byEvent.values()) {
    eventFragments.sort((left, right) => comparePlainDates(left.date, right.date));
    let run: EventDayFragment<TEvent, TEventId, TResourceId>[] = [];
    for (const fragment of eventFragments) {
      const previous = run.at(-1);
      if (previous !== undefined && !fragment.date.equals(previous.date.add({ days: 1 }))) {
        segments.push(toSegment(range, run));
        run = [];
      }
      run.push(fragment);
    }
    segments.push(toSegment(range, run));
  }
  return segments;
}

/**
 * Packs day fragments into lanes for one row of consecutive days (a month week or an all-day
 * strip). Each event becomes one segment per run of consecutive days; fragments outside `range`
 * are ignored. Placement is greedy in a fixed order — earlier column, longer span, then the day
 * display order — so lanes do not depend on input order or on events in other rows.
 */
export function layoutDayGridRow<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(
  range: PlainDateInterval,
  fragments: readonly EventDayFragment<TEvent, TEventId, TResourceId>[],
): DayGridRow<TEvent, TEventId, TResourceId> {
  const segments = segmentsInRow(range, fragments).sort(
    (left, right) =>
      left.column - right.column ||
      right.span - left.span ||
      compareDayFragments(left.fragments[0]!, right.fragments[0]!),
  );

  // laneEnds[lane] is the column after the lane's last occupied day.
  const laneEnds: number[] = [];
  const placed = segments.map((segment) => {
    let lane = laneEnds.findIndex((end) => end <= segment.column);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = segment.column + segment.span;
    return Object.freeze({ ...segment, lane });
  });

  return Object.freeze({
    laneCount: laneEnds.length,
    range,
    segments: Object.freeze(placed),
  });
}

/**
 * Fits a row into `maxLanes` lanes per day. A day that needs more lanes keeps one lane free for
 * a "+N more" control; a segment stays visible only if its lane fits on every day it covers.
 */
export function limitDayGridLanes<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(
  row: DayGridRow<TEvent, TEventId, TResourceId>,
  maxLanes: number,
): DayGridOverflow<TEvent, TEventId, TResourceId> {
  if (!Number.isSafeInteger(maxLanes) || maxLanes < 1) {
    throw new RangeError("invalid-max-lanes");
  }

  const dayCount = row.range.start.until(row.range.end).days;
  const lanesUsed = Array.from({ length: dayCount }, () => 0);
  for (const segment of row.segments) {
    for (let day = segment.column; day < segment.column + segment.span; day += 1) {
      lanesUsed[day] = Math.max(lanesUsed[day]!, segment.lane + 1);
    }
  }

  const hiddenCounts = Array.from({ length: dayCount }, () => 0);
  const visible = row.segments.filter((segment) => {
    const covered = lanesUsed.slice(segment.column, segment.column + segment.span);
    const fits = covered.every(
      (used) => segment.lane < (used > maxLanes ? maxLanes - 1 : maxLanes),
    );
    if (!fits) {
      for (let day = segment.column; day < segment.column + segment.span; day += 1) {
        hiddenCounts[day]! += 1;
      }
    }
    return fits;
  });

  return Object.freeze({
    hiddenCounts: Object.freeze(hiddenCounts),
    segments: Object.freeze(visible),
  });
}
