import type { ResourceColumn, ResourceId } from "@moltenship/calendar";
import type { Virtualizer } from "@tanstack/virtual-core";

/** The day column keyboard focus is in: a resource's, on a date. */
export interface FocusedColumn {
  readonly date: Temporal.PlainDate;
  readonly resourceId: ResourceId | null;
}

/** The focused column, from the calendar's focus; `null` when focus is in no resource. */
export function focusedColumn(
  focus: { readonly date: Temporal.PlainDate; readonly resourceId?: ResourceId | null } | null,
): FocusedColumn | null {
  return focus?.resourceId === undefined
    ? null
    : { date: focus.date, resourceId: focus.resourceId };
}

export function sameColumn(left: FocusedColumn | null, right: FocusedColumn | null): boolean {
  return (
    left === right ||
    (left !== null &&
      right !== null &&
      left.resourceId === right.resourceId &&
      left.date.equals(right.date))
  );
}

export interface FocusedColumnTarget {
  /** The body, which scrolls the columns; the header and all-day row follow it. */
  readonly body: HTMLElement;
  readonly focused: FocusedColumn;
  readonly resources: readonly ResourceColumn<unknown>[];
  readonly rtl: boolean;
  readonly virtualizer: Virtualizer<HTMLDivElement, Element>;
}

/**
 * Keeps the focused day column in view: when focus moves to a resource or a date whose column is
 * scrolled out of view, scrolls the body just far enough to show it, so its cell or event renders
 * and takes DOM focus. Focus inside the clipped all-day row can't scroll it into view itself.
 *
 * Call it when focus moves to another column, after the render that pins its resource; new events
 * or the user's own scrolling should leave the position alone.
 */
export function showFocusedColumn({
  body,
  focused,
  resources,
  rtl,
  virtualizer,
}: FocusedColumnTarget): void {
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
}
