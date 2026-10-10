import type { TimeGridAnnotationMark } from "./time-grid";
import type { CalendarAnnotationSource } from "./types";

/** One source's marks on a day, for a screen-reader summary or a day cell. */
export interface AnnotationSourceSummary<
  TSource extends CalendarAnnotationSource = CalendarAnnotationSource,
> {
  readonly source: TSource;
  /** How many marks the source has on the day. */
  readonly count: number;
  /** Their total time on the day, in hours and minutes, gaps inside merged marks included. */
  readonly duration: Temporal.Duration;
  /** The earliest start and the latest end of its marks on the day. */
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
      // In a repeated hour the latest end needn't belong to the latest start.
      const start = list.reduce(
        (earliest, mark) =>
          Temporal.Instant.compare(mark.start, earliest) < 0 ? mark.start : earliest,
        list[0]!.start,
      );
      const end = list.reduce(
        (latest, mark) => (Temporal.Instant.compare(mark.end, latest) > 0 ? mark.end : latest),
        list[0]!.end,
      );
      // Each mark's time fits a double exactly; their sum may not, so it's added up in bigints.
      const nanoseconds = list.reduce(
        (sum, mark) => sum + BigInt(mark.duration.total("nanoseconds")),
        0n,
      );
      return Object.freeze({
        count: list.length,
        duration: Temporal.Duration.from({
          nanoseconds: Number(nanoseconds % 1_000_000_000n),
          seconds: Number(nanoseconds / 1_000_000_000n),
        }).round({ largestUnit: "hours", smallestUnit: "minutes" }),
        end,
        endsAfterDay: list.some((mark) => mark.endsAfterDay),
        source,
        start,
        startsBeforeDay: list.some((mark) => mark.startsBeforeDay),
      });
    }),
  );
}
