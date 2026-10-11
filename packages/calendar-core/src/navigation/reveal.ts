import { comparePlainDates, plainDateIntervalContains } from "@moltenship/calendar-temporal";

import type { CalendarEnvironmentBase } from "../environment";
import type { CalendarViewStrategy } from "../views";

/** Far enough for any keyboard step; a date further away is anchored directly. */
const MAXIMUM_STEPS = 100;

/**
 * The anchor whose range shows `date`, reached from `anchor` by whole `navigate` steps, so a view
 * keeps paging by its own range (a 3-day view moves 3 days at a time).
 */
export function anchorShowingDate<TOptions>(
  strategy: Pick<CalendarViewStrategy<unknown, TOptions>, "getRange" | "navigate">,
  anchor: Temporal.PlainDate,
  date: Temporal.PlainDate,
  environment: CalendarEnvironmentBase,
  options: TOptions,
): Temporal.PlainDate {
  let current = anchor;
  for (let step = 0; step < MAXIMUM_STEPS; step += 1) {
    const range = strategy.getRange(current, environment, options);
    if (plainDateIntervalContains(range, date)) return current;
    current = strategy.navigate(
      current,
      comparePlainDates(date, range.start) < 0 ? -1 : 1,
      options,
    );
  }
  return date;
}
