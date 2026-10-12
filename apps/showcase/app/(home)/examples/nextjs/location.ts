import {
  getMonthRange,
  resolveViewInstantRange,
  timeGridRange,
  type CalendarEnvironmentBase,
  type InstantInterval,
  type PlainDateInterval,
} from "@moltenship/calendar";

// #region location
export const meetingViews = ["week", "day", "month"] as const;
export type MeetingView = (typeof meetingViews)[number];

/** Where the calendar is, as the URL says: `?view=week&date=2026-10-12`. */
export interface CalendarLocation {
  readonly date: string;
  readonly view: MeetingView;
}

type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

/** Reads the view and date from the URL. Missing or broken ones fall back to this week. */
export function parseLocation(params: SearchParams, today: Temporal.PlainDate): CalendarLocation {
  const view = meetingViews.find((name) => name === params.view) ?? "week";
  return { date: (parseDate(params.date) ?? today).toString(), view };
}

function parseDate(value: string | string[] | undefined): Temporal.PlainDate | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  try {
    return Temporal.PlainDate.from(value, { overflow: "reject" });
  } catch {
    return undefined;
  }
}

export function locationSearch({ date, view }: CalendarLocation): string {
  return new URLSearchParams({ view, date }).toString();
}
// #endregion location

// #region range
export const locale = "en-US";
export const weekRules = { firstDay: 1, minimalDays: 4, weekend: [6, 7] } as const;

/** The dates a location shows, by the same rules as its view. */
export function visibleDates({ date, view }: CalendarLocation): PlainDateInterval {
  const anchor = Temporal.PlainDate.from(date);
  switch (view) {
    case "day":
      return timeGridRange(anchor, { count: 1, kind: "days" }, weekRules);
    case "week":
      return timeGridRange(anchor, { kind: "week" }, weekRules);
    case "month":
      return getMonthRange(anchor, environment("UTC"));
  }
}

/** The instants between those dates' starts of day in `timeZone`: the events to fetch. */
export function visibleRange(location: CalendarLocation, timeZone: string): InstantInterval {
  return resolveViewInstantRange(visibleDates(location), timeZone);
}

export function environment(timeZone: string): CalendarEnvironmentBase {
  return { direction: "ltr", disambiguation: "compatible", locale, timeZone, weekRules };
}
// #endregion range
