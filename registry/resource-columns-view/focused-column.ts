import { useCalendarFocus, type ResourceColumn, type ResourceId } from "@moltenship/calendar";
import type { Virtualizer } from "@tanstack/react-virtual";
import { useInsertionEffect, useLayoutEffect, useRef, type RefObject } from "react";

interface FocusedColumn {
  readonly date: Temporal.PlainDate;
  readonly resourceId: ResourceId | null;
}

function focusedColumn(
  focus: { readonly date: Temporal.PlainDate; readonly resourceId?: ResourceId | null } | null,
): FocusedColumn | null {
  return focus?.resourceId === undefined
    ? null
    : { date: focus.date, resourceId: focus.resourceId };
}

function sameColumn(left: FocusedColumn | null, right: FocusedColumn | null): boolean {
  return (
    left === right ||
    (left !== null &&
      right !== null &&
      left.resourceId === right.resourceId &&
      left.date.equals(right.date))
  );
}

export interface FocusedColumnOptions {
  readonly resources: readonly ResourceColumn<unknown>[];
  readonly rtl: boolean;
  /** The body, which scrolls the columns; the header and all-day row follow it. */
  readonly scrollRef: RefObject<HTMLElement | null>;
  readonly virtualizer: Virtualizer<HTMLDivElement, Element>;
}

/**
 * Keeps the focused day column in view: when focus moves to a resource or a date whose column is
 * scrolled out of view, scrolls the body just far enough to show it, so its cell or event renders
 * and takes DOM focus. Focus inside the clipped all-day row can't scroll it into view itself. Only
 * a change of focus scrolls; new events or the user's own scrolling leave the position alone.
 */
export function useFocusedColumnInView({
  resources,
  rtl,
  scrollRef,
  virtualizer,
}: FocusedColumnOptions): void {
  const focused = useCalendarFocus(focusedColumn, { isEqual: sameColumn });
  const latest = useRef({ resources, rtl });
  useInsertionEffect(() => {
    latest.current = { resources, rtl };
  });

  useLayoutEffect(() => {
    const body = scrollRef.current;
    if (focused === null || body === null) return;
    const { resources, rtl } = latest.current;
    const index = resources.findIndex(({ resource }) => resource.id === focused.resourceId);
    const days = resources[index]?.days ?? [];
    const day = days.findIndex(({ column }) => column.date.equals(focused.date));
    const item = virtualizer.measurementsCache[index];
    if (item === undefined || day === -1) return;

    const width = item.size / days.length;
    const start = item.start + day * width;
    // RTL `scrollLeft` runs from 0 toward negative values.
    const offset = Math.abs(body.scrollLeft);
    const next =
      start < offset
        ? start
        : start + width > offset + body.clientWidth
          ? start + width - body.clientWidth
          : offset;
    if (next !== offset) body.scrollLeft = rtl ? -next : next;
  }, [focused, scrollRef, virtualizer]);
}
