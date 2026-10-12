import type { CalendarClock, TemporalDisambiguation } from "@moltenship/calendar-temporal";

export type IsoDayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type CalendarDirection = "ltr" | "rtl";

export interface CalendarWeekRules {
  readonly firstDay: IsoDayOfWeek;
  readonly minimalDays: IsoDayOfWeek;
  readonly weekend: readonly IsoDayOfWeek[];
}

/** Another time zone a time grid labels its hours in, beside the display time zone. */
export interface CalendarSecondaryTimeZone {
  /** An IANA time zone, such as `"Asia/Tokyo"`. */
  readonly timeZone: string;
  /** Short text naming the zone, such as "Tokyo". Without it, views name the zone through `Intl`. */
  readonly label?: string;
}

export interface CalendarEnvironmentBase {
  readonly direction: CalendarDirection;
  readonly disambiguation: TemporalDisambiguation;
  readonly locale: Intl.Locale | string;
  /** Other zones time grids label their hours in, in order; none when absent. */
  readonly secondaryTimeZones?: readonly CalendarSecondaryTimeZone[];
  readonly timeZone: string;
  readonly weekRules: CalendarWeekRules;
}

export type CalendarNowSource =
  | { readonly clock: CalendarClock; readonly now?: never }
  | { readonly clock?: never; readonly now: Temporal.Instant }
  | { readonly clock?: undefined; readonly now?: undefined };

export type CalendarEnvironment = CalendarEnvironmentBase & CalendarNowSource;
