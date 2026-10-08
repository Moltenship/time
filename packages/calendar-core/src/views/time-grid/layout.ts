import { instantInterval } from "@moltenship/calendar-temporal";

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

  // Instants keep fold identity, so every offset run on this date is measured rather than inferred.
  return event.kind === "timed"
    ? timedFragmentBox(column, instantInterval(event.start, event.end))
    : wallRangeBox(column, fragment.start, fragment.end);
}

function layoutColumn<TFragment extends DayFragment>(
  column: TimeGridColumn,
  fragments: readonly TFragment[],
  options: TimedOverlapOptions | undefined,
): readonly TimeGridEventLayout<TFragment>[] {
  const items = fragments.map((fragment) => ({
    ...fragmentBox(column, fragment),
    fragment,
    // `1` and `"1"` are distinct event IDs, so the type is part of the tie-breaking key.
    key: `${typeof fragment.event.id}:${fragment.event.id}`,
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
