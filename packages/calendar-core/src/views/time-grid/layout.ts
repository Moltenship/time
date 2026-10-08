import { instantInterval, intersectInstantIntervals } from "@moltenship/calendar-temporal";

import type { EventId, ResourceId } from "../../ids";
import { layoutTimedOverlaps, type TimedOverlapOptions } from "../../layout/timed-overlap";
import type { EventDayFragment } from "../../projection/day-fragments";
import type { TimeGridBand, TimeGridColumn } from "./columns";
import { timedFragmentBox, wallRangeBox } from "./geometry";

type DayFragment = EventDayFragment<unknown, EventId, ResourceId>;

export interface TimeGridEventLayout<TFragment> extends TimeGridBand {
  readonly fragment: TFragment;
  readonly left: number;
  readonly width: number;
}

function fragmentBox(column: TimeGridColumn, fragment: DayFragment): TimeGridBand {
  const { event } = fragment;
  if (event.kind === "timed" && column.day.interval !== null) {
    const interval = intersectInstantIntervals(
      instantInterval(event.start, event.end),
      column.day.interval,
    );
    // Instants keep fold identity, so a repeated hour is measured rather than inferred.
    if (interval !== null) return timedFragmentBox(column, interval);
  }

  return wallRangeBox(column, fragment.start, fragment.end);
}

function layoutColumn<TFragment extends DayFragment>(
  column: TimeGridColumn,
  fragments: readonly TFragment[],
  options: TimedOverlapOptions | undefined,
): readonly TimeGridEventLayout<TFragment>[] {
  const items = fragments.map((fragment) => ({
    ...fragmentBox(column, fragment),
    fragment,
    key: String(fragment.event.id),
  }));

  return Object.freeze(
    layoutTimedOverlaps(items, options).map(({ item, ...position }) =>
      Object.freeze({ ...position, fragment: item.fragment }),
    ),
  );
}

/**
 * Positions the fragments from `splitEventsByDay` that belong in the grid, one array per column.
 * Timed fragments are measured by their instants and floating ones by wall time. Pass timed and
 * floating fragments only: an all-day fragment would fill its column. Collisions are measured on
 * the rendered wall axis, so the two occurrences of a repeated fall-back hour sit side by side.
 */
export function layoutTimeGrid<TFragment extends DayFragment>(
  columns: readonly TimeGridColumn[],
  fragments: readonly TFragment[],
  options?: TimedOverlapOptions,
): readonly (readonly TimeGridEventLayout<TFragment>[])[] {
  const byDate = Map.groupBy(fragments, (fragment) => fragment.date.toString());

  return Object.freeze(
    columns.map((column) =>
      layoutColumn(column, byDate.get(column.date.toString()) ?? [], options),
    ),
  );
}
