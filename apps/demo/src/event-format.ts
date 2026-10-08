import type { DemoEvent } from "./calendar";

/** "Thursday, October 8 · 9:30 – 9:45 AM", or a date range for multi-day and all-day events. */
export function formatEventWhen(
  event: DemoEvent,
  timeZone: string,
  locale: Intl.LocalesArgument,
): string {
  const day = { day: "numeric", month: "long", weekday: "long" } as const;
  if (event.kind === "all-day") {
    const last = event.end.subtract({ days: 1 });
    const format = new Intl.DateTimeFormat(locale, day);
    return last.equals(event.start)
      ? format.format(event.start)
      : format.formatRange(event.start, last);
  }

  const start = event.start.toZonedDateTimeISO(timeZone).toPlainDateTime();
  const end = event.end.toZonedDateTimeISO(timeZone).toPlainDateTime();
  const time = { hour: "numeric", minute: "2-digit" } as const;
  if (start.toPlainDate().equals(end.toPlainDate())) {
    const date = new Intl.DateTimeFormat(locale, day).format(start.toPlainDate());
    const times = new Intl.DateTimeFormat(locale, time).formatRange(
      start.toPlainTime(),
      end.toPlainTime(),
    );
    return `${date} · ${times}`;
  }
  return new Intl.DateTimeFormat(locale, { ...day, ...time }).formatRange(start, end);
}
