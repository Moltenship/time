import type { DemoView } from "@demo/demo-model";
import { viewFor as reactViewFor } from "@demo/scrolling";

/**
 * `view` in the set the "Scroll days, weeks, months and agenda" setting chooses, as in the React
 * demo (apps/demo/src/scrolling.ts), among `views`, the views this page registers: a paged view
 * whose scrolling version isn't registered stays paged.
 */
export function viewFor<TView extends string>(
  view: TView,
  scrolling: boolean,
  views: readonly TView[],
): TView {
  const next = reactViewFor(view as DemoView, scrolling) as string;
  return views.includes(next as TView) ? (next as TView) : view;
}

/** Whether `view` is a scrolling one, which turns the setting on for a link to it. */
export function isScrolling(view: string): boolean {
  return reactViewFor(view as DemoView, false) !== view;
}
