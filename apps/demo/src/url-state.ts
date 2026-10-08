import { useEffect, useState } from "react";

import { DemoCalendar, type DemoView } from "./calendar";

export interface CalendarLocation {
  readonly date: Temporal.PlainDate;
  readonly view: DemoView;
}

function isDemoView(value: string | null): value is DemoView {
  return DemoCalendar.views.some(({ name }) => name === value);
}

function parseDate(value: string | null): Temporal.PlainDate | undefined {
  if (value === null) return undefined;
  try {
    return Temporal.PlainDate.from(value);
  } catch {
    return undefined;
  }
}

/** Reads `?view=week&date=2026-10-08`, falling back per parameter when one is missing or invalid. */
export function readCalendarLocation(search: string, fallback: CalendarLocation): CalendarLocation {
  const params = new URLSearchParams(search);
  const view = params.get("view");
  return {
    date: parseDate(params.get("date")) ?? fallback.date,
    view: isDemoView(view) ? view : fallback.view,
  };
}

export function writeCalendarLocation(href: string, { date, view }: CalendarLocation): string {
  const url = new URL(href);
  url.searchParams.set("view", view);
  url.searchParams.set("date", date.toString());
  return url.toString();
}

/**
 * The anchor date and view, initialised from the URL and mirrored back into it. Without a view in
 * the URL, phones (under 640px) start on the day view.
 */
export function useCalendarLocation(today: Temporal.PlainDate) {
  const [location, setLocation] = useState(() =>
    readCalendarLocation(window.location.search, {
      date: today,
      view: matchMedia("(max-width: 639px)").matches ? "day" : "week",
    }),
  );

  useEffect(() => {
    history.replaceState(history.state, "", writeCalendarLocation(window.location.href, location));
  }, [location]);

  return [location, setLocation] as const;
}
