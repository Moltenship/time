import type { TimeGridAnnotationMark } from "./time-grid";
import type { CalendarAnnotationSource } from "./types";

/** One source's marks on a day, for a screen-reader summary or a day cell. */
export interface AnnotationSourceSummary<
  TSource extends CalendarAnnotationSource = CalendarAnnotationSource,
> {
  readonly source: TSource;
  /** How many marks the source has on the day. */
  readonly count: number;
  /** Their total time on the day, in hours and minutes. */
  readonly duration: Temporal.Duration;
  /** The first mark's start and the last mark's end on the day. */
  readonly start: Temporal.Instant;
  readonly end: Temporal.Instant;
  readonly startsBeforeDay: boolean;
  readonly endsAfterDay: boolean;
}

/** Summarizes a column's marks per source, in source order. */
export function summarizeAnnotationMarks<TSource extends CalendarAnnotationSource>(
  marks: readonly TimeGridAnnotationMark<TSource, unknown>[],
): readonly AnnotationSourceSummary<TSource>[] {
  const bySource = Map.groupBy(marks, (mark) => mark.source);
  return Object.freeze(
    [...bySource].map(([source, list]) => {
      const sorted = list.toSorted((left, right) =>
        Temporal.Instant.compare(left.start, right.start),
      );
      const first = sorted[0]!;
      const last = sorted.at(-1)!;
      const nanoseconds = sorted.reduce(
        (sum, mark) => sum + (mark.end.epochNanoseconds - mark.start.epochNanoseconds),
        0n,
      );
      return Object.freeze({
        count: sorted.length,
        duration: Temporal.Duration.from({ nanoseconds: Number(nanoseconds) }).round({
          largestUnit: "hours",
          smallestUnit: "minutes",
        }),
        end: last.end,
        endsAfterDay: last.endsAfterDay,
        source,
        start: first.start,
        startsBeforeDay: first.startsBeforeDay,
      });
    }),
  );
}
