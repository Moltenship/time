import type { SolidView } from "./url-state";

/** The paged views and their scrolling versions, as the React demo's setting switches them. */
const scrollingViews = {
  agenda: "scrolling-agenda",
  month: "scrolling-month",
} as const satisfies Partial<Record<SolidView, SolidView>>;

type PagedView = keyof typeof scrollingViews;

const pagedViews = new Map<SolidView, PagedView>(
  Object.entries(scrollingViews).map(([paged, scrolling]) => [scrolling, paged as PagedView]),
);

/**
 * `view` in the set the setting chooses: the month and the agenda become their scrolling versions
 * while `scrolling` is on, and back again when it is off (apps/demo/src/scrolling.ts).
 */
export function viewFor(view: SolidView, scrolling: boolean): SolidView {
  if (scrolling) return view in scrollingViews ? scrollingViews[view as PagedView] : view;
  return pagedViews.get(view) ?? view;
}

/** Whether `view` is a scrolling one, which is what the setting shows: the URL keeps it. */
export function isScrolling(view: SolidView): boolean {
  return pagedViews.has(view);
}
