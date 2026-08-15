import type { CalendarClock, TemporalDisambiguation } from "@moltenship/calendar-temporal";

export type IsoDayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type CalendarDirection = "ltr" | "rtl";

export interface CalendarWeekRules {
  readonly firstDay: IsoDayOfWeek;
  readonly minimalDays: IsoDayOfWeek;
  readonly weekend: readonly IsoDayOfWeek[];
}

export interface CalendarEnvironmentBase {
  readonly direction: CalendarDirection;
  readonly disambiguation: TemporalDisambiguation;
  readonly locale: Intl.Locale | string;
  readonly timeZone: string;
  readonly weekRules: CalendarWeekRules;
}

export type CalendarNowSource =
  | { readonly clock: CalendarClock; readonly now?: never }
  | { readonly clock?: never; readonly now: Temporal.Instant }
  | { readonly clock?: undefined; readonly now?: undefined };

export type CalendarEnvironment = CalendarEnvironmentBase & CalendarNowSource;
