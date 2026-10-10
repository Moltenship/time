import { summarizeAnnotationMarks } from "@moltenship/calendar";

import type { TimeGridAnnotationMarkData } from "./time-grid-annotations";

export interface AnnotationFormats {
  readonly duration: (duration: Temporal.Duration) => string;
  readonly time: (instant: Temporal.Instant) => string;
  /** The display time zone the times are in. */
  readonly timeZone: string;
}

/** "2 hours, 10 minutes", with unit names in the calendar's locale. */
export function annotationFormats(
  locale: Intl.LocalesArgument,
  timeZone: string,
): AnnotationFormats {
  const unit = (name: "hour" | "minute") =>
    new Intl.NumberFormat(locale, { style: "unit", unit: name, unitDisplay: "long" });
  const hours = unit("hour");
  const minutes = unit("minute");
  const list = new Intl.ListFormat(locale, { style: "long", type: "unit" });
  const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone });
  return {
    duration: ({ hours: h, minutes: m }) =>
      list.format(
        [h > 0 ? hours.format(h) : "", m > 0 || h === 0 ? minutes.format(m) : ""].filter(Boolean),
      ),
    time: (instant) => time.format(instant),
    timeZone,
  };
}

/** The whole time a mark covers, across days. */
export function annotationRange(mark: TimeGridAnnotationMarkData) {
  const [first] = mark.annotations;
  const end = mark.annotations.reduce(
    (latest, annotation) =>
      Temporal.Instant.compare(annotation.end, latest) > 0 ? annotation.end : latest,
    first!.end,
  );
  return { end, start: first!.start };
}

/**
 * A day's annotations for a screen reader, read with its column header: "Annotations: Sleep until
 * 7:05 AM. Music, 3 times, 2 hours, 10 minutes."
 */
export function describeDayAnnotations(
  marks: readonly TimeGridAnnotationMarkData[],
  { duration, time }: AnnotationFormats,
): string | undefined {
  const summaries = summarizeAnnotationMarks(marks);
  if (summaries.length === 0) return undefined;
  const parts = summaries.map(
    ({ count, duration: total, end, endsAfterDay, source, start, startsBeforeDay }) => {
      if (count > 1) return `${source.label}, ${count} times, ${duration(total)}`;
      if (startsBeforeDay && endsAfterDay) return `${source.label} all day`;
      if (startsBeforeDay) return `${source.label} until ${time(end)}`;
      if (endsAfterDay) return `${source.label} from ${time(start)}`;
      return `${source.label} ${time(start)} to ${time(end)}`;
    },
  );
  return `Annotations: ${parts.join(". ")}.`;
}

/**
 * The annotations covering `[start, end)`, added to a slot's accessible name: "Music: Nightcall,
 * 9:00 to 9:04 AM".
 */
export function describeAnnotationsAt(
  marks: readonly TimeGridAnnotationMarkData[],
  start: Temporal.Instant,
  end: Temporal.Instant,
  { time }: AnnotationFormats,
): string | undefined {
  const covering = marks.filter(
    (mark) =>
      Temporal.Instant.compare(mark.start, end) < 0 &&
      Temporal.Instant.compare(mark.end, start) > 0,
  );
  if (covering.length === 0) return undefined;
  return covering
    .map((mark) => {
      const range = annotationRange(mark);
      const what =
        mark.annotations.length === 1
          ? `${mark.source.label}: ${mark.annotations[0]!.title}`
          : `${mark.source.label}, ${mark.annotations.length} items`;
      return `${what}, ${time(range.start)} to ${time(range.end)}`;
    })
    .join("; ");
}
