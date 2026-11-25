/** Keys a view moves focus with; inside a view they never reach the app's own shortcuts. */
export const navigationKeys: ReadonlySet<string> = new Set([
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "End",
  "Home",
  "PageDown",
  "PageUp",
]);

/**
 * Whether a key that reached a view is the view's, even where it has nowhere to go, such as past
 * the last event in a column: then it doesn't fall through to shortcuts like "next period". A key
 * with Alt, Control or Meta stays the app's.
 */
export function isViewNavigationKey(event: {
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly key: string;
  readonly metaKey: boolean;
}): boolean {
  return !event.altKey && !event.ctrlKey && !event.metaKey && navigationKeys.has(event.key);
}
