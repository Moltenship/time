import type { InstantInterval } from "@moltenship/calendar-temporal";

import { layoutTimedOverlaps, type TimedOverlapOptions } from "../../layout/timed-overlap";
import type { TimeGridBand, TimeGridColumn } from "./columns";
import { timedFragmentBox } from "./geometry";

/** The minimal shape the time grid lays out: one event's piece within one column's day. */
export interface TimeGridFragment {
  /** Unique within the column, such as the event ID plus the fragment start. */
  readonly key: string;
  /** Already clipped to the column's `day.interval`. */
  readonly interval: InstantInterval;
}

export interface TimeGridEventLayout<TFragment> extends TimeGridBand {
  readonly fragment: TFragment;
  readonly left: number;
  readonly width: number;
}

/**
 * Positions a column's timed fragments as fractions of the column. Collisions are measured on the
 * rendered wall axis, so the two occurrences of a repeated fall-back hour sit side by side.
 */
export function layoutTimeGridColumn<TFragment extends TimeGridFragment>(
  column: TimeGridColumn,
  fragments: readonly TFragment[],
  options?: TimedOverlapOptions,
): readonly TimeGridEventLayout<TFragment>[] {
  const items = fragments.map((fragment) => ({
    ...timedFragmentBox(column, fragment.interval),
    fragment,
    key: fragment.key,
  }));

  return Object.freeze(
    layoutTimedOverlaps(items, options).map(({ item, ...position }) =>
      Object.freeze({ ...position, fragment: item.fragment }),
    ),
  );
}
