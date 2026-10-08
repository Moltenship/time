import {
  iteratePlainDates,
  zonedDayRange,
  zonedDayTransitions,
  type PlainDateInterval,
  type ZonedDayRange,
  type ZonedOffsetTransition,
} from "@moltenship/calendar-temporal";

import { columnFraction, wallEpochNanoseconds } from "./geometry";

/** A vertical extent as fractions of a column's nominal 24-hour wall-clock axis. */
export interface TimeGridBand {
  readonly height: number;
  readonly top: number;
}

/**
 * One day column. The vertical axis is always the nominal 00:00–24:00 wall clock, so 23- and
 * 25-hour days keep the same hour rows as their neighbours and DST shows up as bands instead.
 */
export interface TimeGridColumn {
  readonly date: Temporal.PlainDate;
  /** The instants this column owns; `kind: "skipped"` for a date removed by a date-line change. */
  readonly day: ZonedDayRange;
  /** Wall time that occurs twice (fall-back). Both occurrences render in this band. */
  readonly folds: readonly TimeGridBand[];
  /** Wall time that never occurs (spring-forward). No instant maps into this band. */
  readonly gaps: readonly TimeGridBand[];
  readonly key: string;
  readonly transitions: readonly ZonedOffsetTransition[];
}

function transitionBand(
  date: Temporal.PlainDate,
  transition: ZonedOffsetTransition,
): TimeGridBand | null {
  const top = columnFraction(date, wallEpochNanoseconds(transition.affectedWallRange.start));
  const bottom = columnFraction(date, wallEpochNanoseconds(transition.affectedWallRange.end));

  return bottom > top ? Object.freeze({ height: bottom - top, top }) : null;
}

function bands(
  date: Temporal.PlainDate,
  transitions: readonly ZonedOffsetTransition[],
  kind: ZonedOffsetTransition["kind"],
): readonly TimeGridBand[] {
  return Object.freeze(
    transitions
      .filter((transition) => transition.kind === kind)
      .map((transition) => transitionBand(date, transition))
      .filter((band) => band !== null),
  );
}

/** Builds one column per visible date in the display timezone. */
export function timeGridColumns(
  range: PlainDateInterval,
  timeZone: string,
): readonly TimeGridColumn[] {
  const columns: TimeGridColumn[] = [];

  for (const date of iteratePlainDates(range)) {
    const day = zonedDayRange(date, timeZone);
    const transitions = zonedDayTransitions(date, day.timeZone);

    columns.push(
      Object.freeze({
        date,
        day,
        folds: bands(date, transitions, "fold"),
        gaps: bands(date, transitions, "gap"),
        key: day.key,
        transitions,
      }),
    );
  }

  return Object.freeze(columns);
}
