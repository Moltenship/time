/** The Solid demo's views. `app.tsx` passes them as the calendar's `view`, which checks the names. */
export type SolidView = "month" | "agenda";

export interface SolidLocation {
  readonly date: Temporal.PlainDate;
  readonly view: SolidView;
}

/**
 * The React demo's views (`demoViewNames` in apps/demo/src/demo-model.ts), each with the nearest
 * view this demo has: the month grid for a month or a year, and the registry's agenda, the days
 * with events, for the agendas and for the views of days and weeks.
 */
const nearestView: Readonly<Record<string, SolidView>> = {
  "3-day": "agenda",
  agenda: "agenda",
  day: "agenda",
  month: "month",
  resources: "agenda",
  "scrolling-3-day": "agenda",
  "scrolling-agenda": "agenda",
  "scrolling-day": "agenda",
  "scrolling-month": "month",
  "scrolling-week": "agenda",
  "timeline-week": "agenda",
  week: "agenda",
  year: "month",
};

function viewFor(value: string | null): SolidView | undefined {
  return value !== null && Object.hasOwn(nearestView, value) ? nearestView[value] : undefined;
}

/**
 * The view this demo shows for a view name a part asks for: the month's date number opens `day`,
 * which shows here as the agenda from that date.
 */
export function nearestSolidView(name: string, fallback: SolidView): SolidView {
  return viewFor(name) ?? fallback;
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
