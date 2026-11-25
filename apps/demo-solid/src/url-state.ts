/** The Solid demo's views. `app.tsx` passes them as the calendar's `view`, which checks the names. */
export type SolidView = "month" | "list";

export interface SolidLocation {
  readonly date: Temporal.PlainDate;
  readonly view: SolidView;
}

/**
 * The React demo's views (`demoViewNames` in apps/demo/src/demo-model.ts), each with the nearest
 * view this demo has: the month grid for a month or a year, and the list, two weeks of events with
 * their times, for the agenda and for the views of days and weeks.
 */
const nearestView: Readonly<Record<string, SolidView>> = {
  "3-day": "list",
  agenda: "list",
  day: "list",
  month: "month",
  resources: "list",
  "scrolling-3-day": "list",
  "scrolling-agenda": "list",
  "scrolling-day": "list",
  "scrolling-month": "month",
  "scrolling-week": "list",
  "timeline-week": "list",
  week: "list",
  year: "month",
};

/** What the URL says for each view here, a name the React demo has too. */
const urlView: Readonly<Record<SolidView, string>> = { list: "agenda", month: "month" };

function viewFor(value: string | null): SolidView | undefined {
  return value !== null && Object.hasOwn(nearestView, value) ? nearestView[value] : undefined;
}

function parseDate(value: string | null): Temporal.PlainDate | undefined {
  if (value === null) return undefined;
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
  if (viewFor(url.searchParams.get("view")) !== view) url.searchParams.set("view", urlView[view]);
  url.searchParams.set("date", date.toString());
  return url.toString();
}
