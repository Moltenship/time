import { instantInterval } from "@moltenship/calendar-temporal";

import type { ResourceId } from "../ids";
import type { TimeGridColumn } from "../views/time-grid/columns";
import { timedFragmentBox } from "../views/time-grid/geometry";
import type { AnnotationSnapshot, CalendarAnnotation, CalendarAnnotationSource } from "./types";

/** How marks draw in a time grid's rail, as fractions of a column's 24-hour axis. */
export interface TimeGridAnnotationGeometry {
  /** The shortest a mark draws. A rail draws marks at least as tall as they are wide. */
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
  /** The part on the column's day, `[start, end)`. */
  readonly start: Temporal.Instant;
  readonly end: Temporal.Instant;
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

type UnplacedMark<TSource extends CalendarAnnotationSource, TData> = Omit<
  TimeGridAnnotationMark<TSource, TData>,
  "lane" | "lanes"
>;

const later = (left: Temporal.Instant, right: Temporal.Instant) =>
  Temporal.Instant.compare(left, right) >= 0 ? left : right;
const earlier = (left: Temporal.Instant, right: Temporal.Instant) =>
  Temporal.Instant.compare(left, right) <= 0 ? left : right;

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

interface Group<TData> {
  annotations: CalendarAnnotation<TData, ResourceId>[];
  end: Temporal.Instant;
  start: Temporal.Instant;
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

/**
 * Merges one source's annotations on a column's day: by the source's `mergeGap` in time, and by
 * drawn size, so marks of one source never touch. Drawn positions follow the wall clock, which
 * repeats an hour on a fall-back day, so groups are merged again in drawn order until none touch.
 */
function mergeSource<TSource extends CalendarAnnotationSource, TData>(
  column: TimeGridColumn,
  day: { readonly start: Temporal.Instant; readonly end: Temporal.Instant },
  source: TSource,
  annotations: readonly CalendarAnnotation<TData, ResourceId>[],
  { minGap, minHeight }: { readonly minGap: number; readonly minHeight: number },
): UnplacedMark<TSource, TData>[] {
  const gap = mergeGapNanoseconds(source, day.start, column.day.timeZone);
  const box = ({ end, start }: Group<TData>) =>
    timedFragmentBox(column, instantInterval(later(start, day.start), earlier(end, day.end)));
  const drawn = (group: Group<TData>) => {
    const { height, top } = box(group);
    return { bottom: top + Math.max(height, minHeight), top };
  };
  const touch = (left: Group<TData>, right: Group<TData>) => {
    const [a, b] = [drawn(left), drawn(right)];
    return b.top - a.bottom <= minGap && a.top - b.bottom <= minGap;
  };
  const merge = (into: Group<TData>, from: Group<TData>) => {
    into.annotations = [...into.annotations, ...from.annotations].toSorted(byStart);
    into.start = earlier(into.start, from.start);
    into.end = later(into.end, from.end);
  };

  const groups: Group<TData>[] = [];
  for (const annotation of annotations.toSorted(byStart)) {
    const next = { annotations: [annotation], end: annotation.end, start: annotation.start };
    const last = groups.at(-1);
    if (
      last !== undefined &&
      (annotation.start.epochNanoseconds - last.end.epochNanoseconds <= gap || touch(last, next))
    ) {
      merge(last, next);
    } else {
      groups.push(next);
    }
  }
  for (let merged = true; merged;) {
    merged = false;
    groups.sort((left, right) => drawn(left).top - drawn(right).top);
    for (let index = 1; index < groups.length; index++) {
      if (touch(groups[index - 1]!, groups[index]!)) {
        merge(groups[index - 1]!, groups.splice(index, 1)[0]!);
        merged = true;
        break;
      }
    }
  }

  return groups.toSorted(byStart).map((group) => {
    const start = later(group.start, day.start);
    const end = earlier(group.end, day.end);
    const { height, top } = box(group);
    return {
      annotations: Object.freeze(group.annotations),
      end,
      endsAfterDay: Temporal.Instant.compare(group.end, day.end) > 0,
      height,
      key: markKey(source, group.annotations[0]!),
      kind: height < minHeight ? "dot" : "bar",
      source,
      start,
      startsBeforeDay: Temporal.Instant.compare(group.start, day.start) < 0,
      top,
    };
  });
}

/** Assigns rail lanes among marks only; event lanes never change. */
function placeInLanes<TSource extends CalendarAnnotationSource, TData>(
  marks: readonly UnplacedMark<TSource, TData>[],
  sources: readonly TSource[],
  {
    layout,
    maxLanes,
    minHeight,
  }: Required<Pick<TimeGridAnnotationGeometry, "layout" | "maxLanes" | "minHeight">>,
): readonly TimeGridAnnotationMark<TSource, TData>[] {
  const placed = new Map<string, { lane: number; lanes: number }>();
  if (layout === "per-source") {
    for (const mark of marks) {
      placed.set(mark.key, { lane: sources.indexOf(mark.source), lanes: sources.length });
    }
  } else {
    const drawnEnd = (mark: UnplacedMark<TSource, TData>) =>
      mark.top + Math.max(mark.height, minHeight);
    let group: UnplacedMark<TSource, TData>[] = [];
    let groupEnd = -Infinity;
    const flush = () => {
      const ends: number[] = [];
      const lanes = group.map((mark) => {
        let lane = ends.findIndex((end) => end <= mark.top);
        if (lane === -1) lane = ends.push(drawnEnd(mark)) - 1;
        else ends[lane] = drawnEnd(mark);
        return Math.min(lane, maxLanes - 1);
      });
      group.forEach((mark, index) =>
        placed.set(mark.key, { lane: lanes[index]!, lanes: Math.min(ends.length, maxLanes) }),
      );
      group = [];
      groupEnd = -Infinity;
    };
    for (const mark of marks.toSorted((left, right) => left.top - right.top)) {
      if (group.length > 0 && mark.top >= groupEnd) flush();
      group.push(mark);
      groupEnd = Math.max(groupEnd, drawnEnd(mark));
    }
    flush();
  }
  return Object.freeze(marks.map((mark) => Object.freeze({ ...mark, ...placed.get(mark.key)! })));
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
  const { layout = "pack", minGap = 0, minHeight = 0 } = geometry;
  // Lanes are whole and at least one.
  const maxLanes =
    geometry.maxLanes !== undefined && Number.isFinite(geometry.maxLanes)
      ? Math.max(1, Math.floor(geometry.maxLanes))
      : DEFAULT_MAX_LANES;
  return Object.freeze(
    columns.map((column) => {
      const day = column.day.interval;
      if (day === null) return Object.freeze([]);
      const visible = snapshot.query(day.start, day.end);
      const marks = sources.flatMap((source) =>
        mergeSource(
          column,
          day,
          source,
          visible.filter((annotation) => annotation.sourceId === source.id),
          { minGap, minHeight },
        ),
      );
      return placeInLanes(marks, sources, { layout, maxLanes, minHeight });
    }),
  );
}
