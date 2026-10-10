import type { DemoView } from "./calendar";

/** The paged views and their scrolling versions. */
const scrollingViews = {
  day: "scrolling-day",
  month: "scrolling-month",
  week: "scrolling-week",
} as const satisfies Partial<Record<DemoView, DemoView>>;

type PagedView = keyof typeof scrollingViews;

const pagedViews = new Map<DemoView, PagedView>(
  Object.entries(scrollingViews).map(([paged, scrolling]) => [scrolling, paged as PagedView]),
);

/**
 * `view` in the set the settings choose: day, week, and month become their scrolling versions
 * while `scrolling` is on, and back again when it is off. Other views stay as they are.
 */
export function viewFor(view: DemoView, scrolling: boolean): DemoView {
  if (scrolling) return view in scrollingViews ? scrollingViews[view as PagedView] : view;
  return pagedViews.get(view) ?? view;
}
