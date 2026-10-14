import type { CalendarClock, CalendarDirection, CalendarWeekRules } from "@moltenship/calendar";

/** A point in time: an `Instant`, a `ZonedDateTime`, or ISO text. */
export type DateTimeInput = Temporal.Instant | Temporal.ZonedDateTime | string;

/** A date: a `PlainDate` or ISO text such as `"2026-10-08"`. */
export type DateInput = Temporal.PlainDate | string;

/** What `createTestEnvironment` uses for each option left out. */
const testDefaults = Object.freeze({
  direction: "ltr" as CalendarDirection,
  locale: "en-US",
  now: "2026-10-08T12:00:00Z",
  timeZone: "UTC",
  weekRules: Object.freeze({
    firstDay: 1,
    minimalDays: 4,
    weekend: Object.freeze([6, 7] as const),
  }) as CalendarWeekRules,
});

/**
 * Throws a clear error when the runtime has no `Temporal`. The package never installs a polyfill:
 * add `if (!("Temporal" in globalThis)) await import("temporal-polyfill/global");` to the test
 * setup, as apps do for browsers without it.
 */
export function requireTemporal(): void {
  if (typeof globalThis.Temporal === "undefined") {
    throw new Error(
      '@moltenship/calendar-testing needs Temporal, and this runtime has none. Add `if (!("Temporal" in globalThis)) await import("temporal-polyfill/global");` to your test setup file.',
    );
  }
}

/** A bracketed time zone, such as `[Europe/Berlin]`; `[u-ca=…]` names a calendar instead. */
const zoneAnnotation = /\[(?!u-)[^\]]+\]/u;

/** Whether ISO text names an exact time: a `Z` or an offset after the time, or a time zone. */
function isExact(text: string): boolean {
  if (zoneAnnotation.test(text)) return true;
  const time = text.trim().split(/[Tt ]/u)[1] ?? "";
  return /[zZ+-]/u.test(time.replace(/\[.*$/u, ""));
}

/**
 * An instant from `value`. Text with `Z`, an offset or a time zone is exact, such as
 * `"2026-10-08T09:00Z"` or `"2026-10-08[Europe/Berlin]"` (midnight there); text without is a wall
 * time on `timeZone`'s clock, where a time in a DST gap resolves later, as `Root` does.
 */
export function toInstant(value: DateTimeInput, timeZone: string): Temporal.Instant {
  requireTemporal();
  if (typeof value !== "string") {
    return "toInstant" in value ? value.toInstant() : Temporal.Instant.from(value);
  }
  if (!isExact(value)) {
    return Temporal.PlainDateTime.from(value).toZonedDateTime(timeZone).toInstant();
  }
  return zoneAnnotation.test(value)
    ? Temporal.ZonedDateTime.from(value).toInstant()
    : Temporal.Instant.from(value);
}

/** A date from a `PlainDate` or ISO text. */
export function toPlainDate(value: DateInput): Temporal.PlainDate {
  requireTemporal();
  return Temporal.PlainDate.from(value);
}

export interface TestEnvironmentOptions {
  /** The current instant: exact, or a wall time on `timeZone`. Defaults to 8 October 2026, noon UTC. */
  readonly now?: DateTimeInput;
  /** The display time zone. Defaults to `"UTC"`. */
  readonly timeZone?: string;
  readonly locale?: string;
  readonly weekRules?: CalendarWeekRules;
  readonly direction?: CalendarDirection;
  /** The date the calendar opens on. Defaults to `today`. */
  readonly anchorDate?: DateInput;
}

/** The `Root` props a test environment fixes. */
export interface TestEnvironmentRootProps {
  readonly defaultAnchorDate: Temporal.PlainDate;
  readonly defaultTimeZone: string;
  readonly direction: CalendarDirection;
  readonly locale: string;
  readonly now: Temporal.Instant;
  readonly weekRules: CalendarWeekRules;
}

/**
 * A fixed now, time zone, locale, week rules and direction. `Root` reads the current time only
 * from `now` or `clock` and the zone from `timeZone`, so passing `rootProps` makes a calendar
 * deterministic without patching any global.
 */
export interface TestEnvironment {
  readonly anchorDate: Temporal.PlainDate;
  readonly direction: CalendarDirection;
  readonly locale: string;
  readonly now: Temporal.Instant;
  readonly rootProps: TestEnvironmentRootProps;
  readonly timeZone: string;
  /** `now`'s date in `timeZone`. */
  readonly today: Temporal.PlainDate;
  readonly weekRules: CalendarWeekRules;
  /**
   * An instant on the environment's clock: a time such as `"09:00"` is today's, a date and time
   * such as `"2026-10-09T09:00"` a wall time in `timeZone`, and exact text stays as it is.
   */
  at(value: DateTimeInput): Temporal.Instant;
}

/**
 * Builds a deterministic environment. Every option has a default: Thursday 8 October 2026 at noon
 * UTC, `"en-US"`, weeks from Monday (`{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }`), left to
 * right.
 */
export function createTestEnvironment(options: TestEnvironmentOptions = {}): TestEnvironment {
  requireTemporal();
  const timeZone = options.timeZone ?? testDefaults.timeZone;
  const locale = options.locale ?? testDefaults.locale;
  const weekRules = options.weekRules ?? testDefaults.weekRules;
  const direction = options.direction ?? testDefaults.direction;
  const now = toInstant(options.now ?? testDefaults.now, timeZone);
  const today = now.toZonedDateTimeISO(timeZone).toPlainDate();
  const anchorDate = options.anchorDate === undefined ? today : toPlainDate(options.anchorDate);

  return Object.freeze({
    anchorDate,
    at(value: DateTimeInput) {
      if (typeof value === "string" && /^\d{2}:\d{2}/u.test(value.trim())) {
        return today
          .toPlainDateTime(Temporal.PlainTime.from(value))
          .toZonedDateTime(timeZone)
          .toInstant();
      }
      return toInstant(value, timeZone);
    },
    direction,
    locale,
    now,
    rootProps: Object.freeze({
      defaultAnchorDate: anchorDate,
      defaultTimeZone: timeZone,
      direction,
      locale,
      now,
      weekRules,
    }),
    timeZone,
    today,
    weekRules,
  });
}

/** A `CalendarClock` a test moves by hand. */
export interface TestClock extends CalendarClock {
  /** Moves the clock by a duration of hours or smaller units, such as `{ minutes: 5 }`. */
  advance(duration: Temporal.DurationLike | string): Temporal.Instant;
  set(instant: DateTimeInput): void;
}

/**
 * A clock for `Root`'s `clock` prop, or the harness's `clock` option, starting at `start`
 * (8 October 2026 at noon UTC by default). Text without a zone or offset is a UTC wall time. `Root`
 * and `useNow` sample a clock on an interval, a minute by default, so a test that moves it also
 * advances fake timers; to show a new time at once, use a fixed `now` and the harness's `setNow`.
 */
export function createTestClock(start: DateTimeInput = testDefaults.now): TestClock {
  let current = toInstant(start, "UTC");
  return Object.freeze({
    advance(duration: Temporal.DurationLike | string) {
      current = current.add(duration);
      return current;
    },
    instant: () => current,
    set(instant: DateTimeInput) {
      current = toInstant(instant, "UTC");
    },
  });
}
