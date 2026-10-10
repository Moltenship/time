import { useCalendarFocus, type ResourceColumn } from "@moltenship/calendar";
import type { Virtualizer } from "@tanstack/react-virtual";
import { useInsertionEffect, useLayoutEffect, useRef } from "react";

const selectResource = (focus: { readonly resourceId?: unknown } | null) => focus?.resourceId;

/**
 * Keeps the focused resource rendered: when focus moves to a resource whose columns are scrolled
 * out of view, scrolls them in, so its cell or event renders and takes DOM focus. Only a change
 * of focus scrolls; new events or the user's own scrolling leave the position alone.
 */
export function useFocusedResourceInView(
  resources: readonly ResourceColumn<unknown>[],
  virtualizer: Virtualizer<HTMLDivElement, Element>,
): void {
  const focused = useCalendarFocus(selectResource);
  const latest = useRef(resources);
  useInsertionEffect(() => {
    latest.current = resources;
  });

  useLayoutEffect(() => {
    if (focused === undefined) return;
    const index = latest.current.findIndex(({ resource }) => resource.id === focused);
    if (index !== -1) virtualizer.scrollToIndex(index, { align: "auto" });
  }, [focused, virtualizer]);
}
