import type { ResourceId } from "../ids";
import type { TimeGridColumn } from "../views/time-grid/columns";
import { wallEpochNanoseconds } from "../views/time-grid/geometry";
import type { AnnotationSnapshot, CalendarAnnotation, CalendarAnnotationSource } from "./types";

/** How marks draw in a time grid's rail, as fractions of a column's 24-hour axis. */
export interface TimeGridAnnotationGeometry {
  /**
   * The shortest a mark draws. A rail draws marks at least as tall as they are wide. One too close
   * to midnight to fit draws up from the day's end instead, so it never overflows the day.
   */
  readonly minHeight?: number;
  /** Marks of one source closer than this merge, so they never touch. */
  readonly minGap?: number;
  /** `pack` shares the rail between overlapping marks; `per-source` gives each source a lane. */
  readonly layout?: "pack" | "per-source";
  /** In `pack`, marks beyond this many overlapping share the last lane. A whole number, 1 or more. */
  readonly maxLanes?: number;
}

/** One source's annotations merged into one mark and placed in a column's rail. */
export interface TimeGridAnnotationMark<
  TSource extends CalendarAnnotationSource = CalendarAnnotationSource,
  TData = unknown,
> {
  /** The annotations it merges, in time order. */
  readonly annotations: readonly CalendarAnnotation<TData, ResourceId>[];
  readonly key: string;
  readonly source: TSource;
  /**
   * The first and last instants whose wall time is on the column's date, `[start, end)`. A fold
   * crossing midnight can put another date's time between them.
   */
  readonly start: Temporal.Instant;
  readonly end: Temporal.Instant;
  /** The time between `start` and `end` on the column's date; less than their difference only in a fold. */
  readonly duration: Temporal.Duration;
  readonly startsBeforeDay: boolean;
  readonly endsAfterDay: boolean;
  /** Fractions of the column's 24-hour axis, like event layouts. */
  readonly top: number;
  readonly height: number;
  /** `dot` when shorter than the geometry's `minHeight`, so it draws as a circle. */
  readonly kind: "bar" | "dot";
  readonly lane: number;
  readonly lanes: number;
}

const DEFAULT_MAX_LANES = 3;
const DAY_NANOSECONDS = 86_400_000_000_000n;
const NOMINAL_DAY_NANOSECONDS = 86_400_000_000_000;

type UnplacedMark<TSource extends CalendarAnnotationSource, TData> = Omit<
  TimeGridAnnotationMark<TSource, TData>,
  "lane" | "lanes"
>;

/** A mark before lanes, with its drawn extent in whole nanoseconds of wall time from midnight. */
interface Unplaced<TSource extends CalendarAnnotationSource, TData> {
  readonly bottom: bigint;
  readonly mark: UnplacedMark<TSource, TData>;
  readonly top: bigint;
}

/** Instants with one UTC offset, `[start, end)`; `shift` turns them into wall time from midnight. */
interface OffsetRun {
  readonly end: bigint;
  readonly shift: bigint;
  readonly start: bigint;
}

/**
 * The instants that can fall on a column's date, one run per UTC offset. Offsets stay within ±24
 * hours, so only instants within a day of the date's wall-clock span can have a wall time on it.
 */
function dateOffsetRuns(column: TimeGridColumn): readonly OffsetRun[] {
  const midnight = wallEpochNanoseconds(column.date.toPlainDateTime());
  const end = midnight + 2n * DAY_NANOSECONDS;
  const runs: OffsetRun[] = [];
  let cursor = new globalThis.Temporal.ZonedDateTime(
    midnight - DAY_NANOSECONDS,
    column.day.timeZone,
  );
  for (;;) {
    const transition = cursor.getTimeZoneTransition("next");
    const runEnd =
      transition === null || transition.epochNanoseconds >= end ? end : transition.epochNanoseconds;
    runs.push({
      end: runEnd,
      shift: BigInt(cursor.offsetNanoseconds) - midnight,
      start: cursor.epochNanoseconds,
    });
    if (runEnd === end) return runs;
    cursor = transition!;
  }
}

/** Where something falls on a column's date. */
interface DayPart {
  /** Wall time from midnight, clamped to the date, as `wallExtent` measures it. */
  top: bigint;
  bottom: bigint;
  /** The first and last instants whose wall time is on the date, `[start, end)`. */
  start: bigint;
  end: bigint;
  /** It also has wall time on an earlier or a later date. */
  before: boolean;
  after: boolean;
}

/**
 * The part of `[start, end)` on the date of `runs`, or `null` when none of its wall time is on
 * the date. Each offset run is measured on its own, like events, so a fold that crosses midnight
 * puts the repeated time on the date its wall clock reads.
 */
function dayPart(runs: readonly OffsetRun[], start: bigint, end: bigint): DayPart | null {
  let part: DayPart | null = null;
  let before = false;
  let after = false;
  for (const run of runs) {
    const from = start > run.start ? start : run.start;
    const to = end < run.end ? end : run.end;
    if (from >= to) continue;
    const wallFrom = from + run.shift;
    const wallTo = to + run.shift;
    before ||= wallFrom < 0n;
    after ||= wallTo > DAY_NANOSECONDS;
    if (wallFrom >= DAY_NANOSECONDS || wallTo <= 0n) continue;
    const top = wallFrom > 0n ? wallFrom : 0n;
    const bottom = wallTo < DAY_NANOSECONDS ? wallTo : DAY_NANOSECONDS;
    // The flags are set once every run is seen.
    const piece = {
      after: false,
      before: false,
      bottom,
      end: bottom - run.shift,
      start: top - run.shift,
      top,
    };
    part = part === null ? piece : union(part, piece);
  }
  return part === null ? null : { ...part, after, before };
}

/** How much of `[start, end)` has wall time on the date of `runs`. */
function timeOnDate(runs: readonly OffsetRun[], start: bigint, end: bigint): bigint {
  let total = 0n;
  for (const run of runs) {
    const from = [start, run.start, -run.shift].reduce((left, right) =>
      right > left ? right : left,
    );
    const to = [end, run.end, DAY_NANOSECONDS - run.shift].reduce((left, right) =>
      right < left ? right : left,
    );
    if (to > from) total += to - from;
  }
  return total;
}

function union(left: DayPart, right: DayPart): DayPart {
  return {
    after: left.after || right.after,
    before: left.before || right.before,
    bottom: left.bottom > right.bottom ? left.bottom : right.bottom,
    end: left.end > right.end ? left.end : right.end,
    start: left.start < right.start ? left.start : right.start,
    top: left.top < right.top ? left.top : right.top,
  };
}

/** A fraction of the 24-hour axis within `[0, 1]`; anything else, such as `NaN`, is `0`. */
const axisFraction = (value: number | undefined) => Math.min(1, Math.max(0, value || 0));

/** A fraction of the 24-hour axis in nanoseconds of wall time. */
const wallNanoseconds = (fraction: number) =>
  BigInt(Math.round(fraction * NOMINAL_DAY_NANOSECONDS));

/** `mergeGap` in nanoseconds from the start of the column's day, so calendar units work too. */
function mergeGapNanoseconds(
  source: CalendarAnnotationSource,
  dayStart: Temporal.Instant,
  timeZone: string,
): bigint {
  if (source.mergeGap === undefined) return 0n;
  const relativeTo = dayStart.toZonedDateTimeISO(timeZone);
  return BigInt(Math.round(source.mergeGap.total({ relativeTo, unit: "nanoseconds" })));
}

/** Annotations that draw as one mark: their whole span in time, and their part on the date. */
interface Group<TData> {
  readonly annotations: CalendarAnnotation<TData, ResourceId>[];
  end: bigint;
  part: DayPart;
  start: bigint;
}

/** A key that keeps `1` and `"1"`, and every source and ID pair, apart. */
const markKey = (
  source: CalendarAnnotationSource,
  annotation: CalendarAnnotation<unknown, ResourceId>,
) => JSON.stringify([source.id, annotation.id]);

const byStart = (
  left: { readonly start: Temporal.Instant; readonly end: Temporal.Instant },
  right: typeof left,
) =>
  Temporal.Instant.compare(left.start, right.start) ||
  Temporal.Instant.compare(left.end, right.end);

const compareBigInts = (left: bigint, right: bigint) => (left < right ? -1 : left > right ? 1 : 0);

/**
 * Merges one source's annotations on a column's date: by the source's `mergeGap` in time, and by
 * drawn size, so marks of one source never touch. Drawn positions follow the wall clock, which
 * repeats an hour on a fall-back day, so groups are swept again in drawn order.
 */
function mergeSource<TSource extends CalendarAnnotationSource, TData>(
  column: TimeGridColumn,
  dayStart: Temporal.Instant,
  runs: readonly OffsetRun[],
  source: TSource,
  annotations: readonly CalendarAnnotation<TData, ResourceId>[],
  geometry: { readonly minGap: number; readonly minHeight: number },
): Unplaced<TSource, TData>[] {
  const gap = mergeGapNanoseconds(source, dayStart, column.day.timeZone);
  // Drawn sizes in whole nanoseconds of wall time, so marks that meet exactly always touch.
  const minGap = wallNanoseconds(geometry.minGap);
  const minHeight = wallNanoseconds(geometry.minHeight);
  const drawnTop = ({ part }: Group<TData>) =>
    part.top + minHeight > DAY_NANOSECONDS ? DAY_NANOSECONDS - minHeight : part.top;
  const drawnBottom = (group: Group<TData>) => {
    const top = drawnTop(group);
    return group.part.bottom - top > minHeight ? group.part.bottom : top + minHeight;
  };
  const touch = (left: Group<TData>, right: Group<TData>) =>
    drawnTop(right) - drawnBottom(left) <= minGap && drawnTop(left) - drawnBottom(right) <= minGap;
  const merge = (into: Group<TData>, from: Group<TData>) => {
    // Each group is merged away at most once, so appending stays linear; members sort at the end.
    for (const annotation of from.annotations) into.annotations.push(annotation);
    into.start = into.start < from.start ? into.start : from.start;
    into.end = into.end > from.end ? into.end : from.end;
    into.part = union(into.part, from.part);
  };

  const singles: Group<TData>[] = [];
  for (const annotation of annotations) {
    const start = annotation.start.epochNanoseconds;
    const end = annotation.end.epochNanoseconds;
    const part = dayPart(runs, start, end);
    if (part !== null) singles.push({ annotations: [annotation], end, part, start });
  }
  singles.sort(
    (left, right) => compareBigInts(left.start, right.start) || compareBigInts(left.end, right.end),
  );

  // In time order first, then once more in drawn order, which differs only in a repeated hour.
  // Sorted by drawn top, a merged group keeps its top and its bottom only grows, so one sweep is
  // enough.
  const inTime: Group<TData>[] = [];
  for (const next of singles) {
    const last = inTime.at(-1);
    if (last !== undefined && (next.start - last.end <= gap || touch(last, next))) {
      merge(last, next);
    } else {
      inTime.push(next);
    }
  }
  const groups: Group<TData>[] = [];
  for (const next of inTime.sort((left, right) =>
    compareBigInts(drawnTop(left), drawnTop(right)),
  )) {
    const last = groups.at(-1);
    if (last !== undefined && touch(last, next)) merge(last, next);
    else groups.push(next);
  }

  return groups
    .sort((left, right) => compareBigInts(left.part.start, right.part.start))
    .map((group) => {
      const { after, before, bottom, end, start, top } = group.part;
      const members = group.annotations.sort(byStart);
      const duration = Temporal.Duration.from({
        nanoseconds: Number(timeOnDate(runs, start, end)),
      }).round({ largestUnit: "hours" });
      const mark: UnplacedMark<TSource, TData> = {
        annotations: Object.freeze(members),
        duration,
        end: Temporal.Instant.fromEpochNanoseconds(end),
        endsAfterDay: after,
        height: Number(bottom - top) / NOMINAL_DAY_NANOSECONDS,
        key: markKey(source, members[0]!),
        kind: bottom - top < minHeight ? "dot" : "bar",
        source,
        start: Temporal.Instant.fromEpochNanoseconds(start),
        startsBeforeDay: before,
        top: Number(top) / NOMINAL_DAY_NANOSECONDS,
      };
      return { bottom: drawnBottom(group), mark, top: drawnTop(group) };
    });
}

/**
 * Assigns rail lanes among marks only; event lanes never change. Packing compares whole
 * nanoseconds, so marks that meet exactly can share a lane.
 */
function placeInLanes<TSource extends CalendarAnnotationSource, TData>(
  marks: readonly Unplaced<TSource, TData>[],
  sources: readonly TSource[],
  { layout, maxLanes }: Required<Pick<TimeGridAnnotationGeometry, "layout" | "maxLanes">>,
): readonly TimeGridAnnotationMark<TSource, TData>[] {
  const placed = new Map<string, { lane: number; lanes: number }>();
  if (layout === "per-source") {
    for (const { mark } of marks) {
      placed.set(mark.key, { lane: sources.indexOf(mark.source), lanes: sources.length });
    }
  } else {
    let group: Unplaced<TSource, TData>[] = [];
    let groupEnd = 0n;
    const flush = () => {
      const ends: bigint[] = [];
      const lanes = group.map(({ bottom, top }) => {
        let lane = ends.findIndex((end) => end <= top);
        if (lane === -1) lane = ends.push(bottom) - 1;
        else ends[lane] = bottom;
        return Math.min(lane, maxLanes - 1);
      });
      group.forEach(({ mark }, index) =>
        placed.set(mark.key, { lane: lanes[index]!, lanes: Math.min(ends.length, maxLanes) }),
      );
      group = [];
    };
    for (const next of marks.toSorted((left, right) => compareBigInts(left.top, right.top))) {
      if (group.length > 0 && next.top >= groupEnd) flush();
      groupEnd = group.length === 0 || next.bottom > groupEnd ? next.bottom : groupEnd;
      group.push(next);
    }
    flush();
  }
  return Object.freeze(
    marks.map(({ mark }) => Object.freeze({ ...mark, ...placed.get(mark.key)! })),
  );
}

/**
 * Lays annotations out beside a time grid's events, one list of marks per column, in source
 * order. Annotations whose source is not in `sources` are left out, so passing fewer sources
 * hides them. The event projection is not involved, so annotations never change event layout.
 */
export function projectTimeGridAnnotations<TSource extends CalendarAnnotationSource, TData>(
  columns: readonly TimeGridColumn[],
  snapshot: AnnotationSnapshot<TData>,
  sources: readonly TSource[],
  geometry: TimeGridAnnotationGeometry = {},
): readonly (readonly TimeGridAnnotationMark<TSource, TData>[])[] {
  const { layout = "pack" } = geometry;
  const minGap = axisFraction(geometry.minGap);
  const minHeight = axisFraction(geometry.minHeight);
  // Lanes are whole and at least one.
  const maxLanes =
    geometry.maxLanes !== undefined && Number.isFinite(geometry.maxLanes)
      ? Math.max(1, Math.floor(geometry.maxLanes))
      : DEFAULT_MAX_LANES;
  return Object.freeze(
    columns.map((column) => {
      const day = column.day.interval;
      if (day === null) return Object.freeze([]);
      const runs = dateOffsetRuns(column);
      // Every instant that may have wall time on the date; `dayPart` keeps those that do.
      const nearby = Map.groupBy(
        snapshot.query(
          Temporal.Instant.fromEpochNanoseconds(runs[0]!.start),
          Temporal.Instant.fromEpochNanoseconds(runs.at(-1)!.end),
        ),
        (annotation) => annotation.sourceId,
      );
      const marks = sources.flatMap((source) =>
        mergeSource(column, day.start, runs, source, nearby.get(source.id) ?? [], {
          minGap,
          minHeight,
        }),
      );
      return placeInLanes(marks, sources, { layout, maxLanes });
    }),
  );
}
