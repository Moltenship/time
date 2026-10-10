import {
  instantInterval,
  summarizeAnnotationMarks,
  timedFragmentBox,
  type TimeGridBand,
  type TimeGridColumn,
} from "@moltenship/calendar";

import type { TimeGridAnnotationMarkData } from "./time-grid-annotations";

export interface AnnotationFormats {
  readonly duration: (duration: Temporal.Duration) => string;
  readonly time: (instant: Temporal.Instant) => string;
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

/** A mark names this many of its items; the rest are counted, as in the details popover. */
const NAMED_ITEMS = 5;
/** Bands this close, as fractions of a day, meet rather than overlap. */
const EPSILON = 1e-9;

/**
 * The annotations drawn across a slot's band, added to its accessible name: "Music: Nightcall,
 * 9:00 AM to 9:04 AM; Genesis, 9:05 AM to 9:09 AM". Each item is measured as the rail draws it,
 * so a repeated hour names both of its occurrences, a skipped one names none, and the gap inside
 * a merged mark names nothing.
 */
export function describeAnnotationsAt(
  marks: readonly TimeGridAnnotationMarkData[],
  column: TimeGridColumn,
  band: TimeGridBand,
  { time }: AnnotationFormats,
): string | undefined {
  const crosses = ({ height, top }: TimeGridBand) =>
    top < band.top + band.height - EPSILON && top + height > band.top + EPSILON;
  const parts = marks.flatMap((mark) => {
    const items = crosses(mark)
      ? mark.annotations.filter(({ end, start }) =>
          crosses(timedFragmentBox(column, instantInterval(start, end))),
        )
      : [];
    if (items.length === 0) return [];
    const named = items
      .slice(0, NAMED_ITEMS)
      .map(
        ({ end, start, title }) =>
          `${title === mark.source.label ? "" : `${title}, `}${time(start)} to ${time(end)}`,
      );
    if (items.length > NAMED_ITEMS) named.push(`and ${items.length - NAMED_ITEMS} more`);
    return [`${mark.source.label}: ${named.join("; ")}`];
  });
  return parts.length === 0 ? undefined : parts.join(". ");
}
