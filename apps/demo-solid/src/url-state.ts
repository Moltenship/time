import type { DemoView } from "@demo/demo-model";

export interface SolidLocation<TView extends string = string> {
  readonly date: Temporal.PlainDate;
  readonly view: TView;
}

/**
 * Each of the React demo's views (`demoViewNames` in apps/demo/src/demo-model.ts), then the views
 * that come nearest, for a page that doesn't have it: the time grid of the same days for the
 * scrolling grids, the resource columns and the timeline, the month grid for the scrolling month,
 * and the agenda for the scrolling agenda.
 */
const nearestViews: Readonly<Record<DemoView, readonly DemoView[]>> = {
  "3-day": ["3-day"],
  agenda: ["agenda"],
  day: ["day"],
  month: ["month"],
  resources: ["resources", "day"],
  "scrolling-3-day": ["scrolling-3-day", "3-day"],
  "scrolling-agenda": ["scrolling-agenda", "agenda"],
  "scrolling-day": ["scrolling-day", "day"],
  "scrolling-month": ["scrolling-month", "month"],
  "scrolling-week": ["scrolling-week", "week"],
  "timeline-week": ["timeline-week", "week"],
  week: ["week"],
  year: ["year"],
};

/** The view `value` names, or the nearest of `views`, the views this page registers. */
export function nearestView<TView extends string>(
  value: string | null,
  views: readonly TView[],
): TView | undefined {
  if (value === null || !Object.hasOwn(nearestViews, value)) return undefined;
  return nearestViews[value as DemoView].find((view): view is DemoView & TView =>
    views.includes(view as DemoView & TView),
  );
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
 * the view mapped to the nearest of `views`. A parameter that's missing or invalid falls back.
 */
export function readSolidLocation<TView extends string>(
  search: string,
  fallback: SolidLocation<TView>,
  views: readonly TView[],
): SolidLocation<TView> {
  const params = new URLSearchParams(search);
  return {
    date: parseDate(params.get("date")) ?? fallback.date,
    view: nearestView(params.get("view"), views) ?? fallback.view,
  };
}

/**
 * Writes the view and date into `href`. A view in the URL that maps to the one shown stays, so
 * `scrolling-week` comes back as itself when the visitor returns to React without changing the
 * view here.
 */
export function writeSolidLocation<TView extends string>(
  href: string,
  { date, view }: SolidLocation<TView>,
  views: readonly TView[],
): string {
  const url = new URL(href);
  if (nearestView(url.searchParams.get("view"), views) !== view) url.searchParams.set("view", view);
  url.searchParams.set("date", date.toString());
  return url.toString();
}
