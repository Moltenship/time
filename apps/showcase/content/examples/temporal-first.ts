// #region first
import {
  intersectPlainDateIntervals,
  plainDateInterval,
  weekRange,
} from "@moltenship/calendar-temporal";

const date = (value: string) => Temporal.PlainDate.from(value);

// A stay that arrives on October 9 and leaves on the 14th. A range includes its start and
// excludes its end, so the 14th isn't one of its nights.
export const stay = plainDateInterval(date("2026-10-09"), date("2026-10-14"));

// The week of October 8 that starts on a Monday: October 5 up to the 12th.
export const week = weekRange(date("2026-10-08"), { weekStartsOn: 1 });

// The part of the stay inside that week, or null when they don't overlap.
export const nights = intersectPlainDateIntervals(stay, week);
// #endregion first
