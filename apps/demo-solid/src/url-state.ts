/** The Solid demo's views. `app.tsx` passes them as the calendar's `view`, which checks the names. */
export type SolidView =
  | "week"
  | "3-day"
  | "day"
  | "month"
  | "year"
  | "agenda"
  | "scrolling-month"
  | "scrolling-agenda"
  | "resources";

export interface SolidLocation {
  readonly date: Temporal.PlainDate;
  readonly view: SolidView;
}

/**
 * The React demo's views (`demoViewNames` in apps/demo/src/demo-model.ts), each with the nearest
 * view this demo has: the time grid of the same days for the scrolling grids and the timeline, the
 * month grid for a month, the year for a year, and the agenda for the agendas. The resource columns
 * and the scrolling month and agenda are themselves.
 */
const nearestView: Readonly<Record<string, SolidView>> = {
  "3-day": "3-day",
  agenda: "agenda",
  day: "day",
  month: "month",
  resources: "resources",
  "scrolling-3-day": "3-day",
  "scrolling-agenda": "scrolling-agenda",
  "scrolling-day": "day",
  "scrolling-month": "scrolling-month",
  "scrolling-week": "week",
  "timeline-week": "week",
  week: "week",
  year: "year",
};

function viewFor(value: string | null): SolidView | undefined {
  return value !== null && Object.hasOwn(nearestView, value) ? nearestView[value] : undefined;
}

function parseDate(value: string | null): Temporal.PlainDate | undefined {
  // A plain ISO date of a four-digit year: Temporal also takes a calendar annotation and years
  // out to ±271821, whose edges no view can show.
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return undefined;
  try {
    return Temporal.PlainDate.from(value);
  } catch {
    return undefined;
  }
}

/**
 * Reads `?view=week&date=2026-10-08`, the React demo's format (apps/demo/src/url-state.ts), with
 * the view mapped to the nearest one here. A parameter that's missing or invalid falls back.
 */
export function readSolidLocation(search: string, fallback: SolidLocation): SolidLocation {
  const params = new URLSearchParams(search);
  return {
    date: parseDate(params.get("date")) ?? fallback.date,
    view: viewFor(params.get("view")) ?? fallback.view,
  };
}

/**
 * Writes the view and date into `href`. A view in the URL that maps to the one shown stays, so
 * `week` comes back as `week` when the visitor returns to React without changing the view here.
 */
export function writeSolidLocation(href: string, { date, view }: SolidLocation): string {
  const url = new URL(href);
  if (viewFor(url.searchParams.get("view")) !== view) url.searchParams.set("view", view);
  url.searchParams.set("date", date.toString());
  return url.toString();
}
