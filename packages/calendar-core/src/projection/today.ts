import type { CalendarEnvironment } from "../environment";

/** The current local date in the environment's time zone, when it provides a time source. */
export function todayIn(environment: CalendarEnvironment): Temporal.PlainDate | undefined {
  const now = environment.now ?? environment.clock?.instant();
  return now?.toZonedDateTimeISO(environment.timeZone).toPlainDate();
}
