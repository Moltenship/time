import { plainDateInterval, type PlainDateInterval } from "@moltenship/calendar";

/**
 * Six weeks either side of `date`: what the calendar shows first, before `onVisibleRangeChange`
 * reports the dates it needs, so series show on the first paint.
 */
export function around(date: Temporal.PlainDate): PlainDateInterval {
  return plainDateInterval(date.subtract({ weeks: 6 }), date.add({ weeks: 6 }));
}

/**
 * The dates to expand series over once the calendar reports the ones it needs: `current` while it
 * still covers them, so moving within it expands nothing again, or else from six weeks before
 * their start to six weeks after it, or to their end if that's later.
 */
export function covering(current: PlainDateInterval, needed: PlainDateInterval): PlainDateInterval {
  const compare = (one: Temporal.PlainDate, two: Temporal.PlainDate) =>
    Temporal.PlainDate.compare(one, two);
  if (compare(current.start, needed.start) <= 0 && compare(needed.end, current.end) <= 0) {
    return current;
  }
  return plainDateInterval(
    needed.start.subtract({ weeks: 6 }),
    compare(needed.end, needed.start.add({ weeks: 6 })) > 0
      ? needed.end
      : needed.start.add({ weeks: 6 }),
  );
}
