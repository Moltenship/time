import {
  instantInterval,
  type InstantInterval,
  type PlainDateInterval,
} from "@moltenship/calendar-temporal";

import type { CalendarEnvironmentBase } from "./environment";
import type { EventId, ResourceId } from "./ids";
import type { EventSnapshot } from "./snapshots/types";

export interface CalendarViewProjectionInput<TOptions, TEvent = unknown> {
  readonly environment: CalendarEnvironmentBase;
  /** The visible dates resolved to instants in the display time zone. */
  readonly instantRange: InstantInterval;
  readonly options: TOptions;
  /** The visible dates. */
  readonly range: PlainDateInterval;
  readonly resources: readonly unknown[];
  readonly snapshot: EventSnapshot<TEvent, EventId, ResourceId>;
  /** The current date in the display time zone, or `null` until a clock is available. */
  readonly today: Temporal.PlainDate | null;
}

/** Pure range, navigation, title, and projection rules for one kind of view. */
export interface CalendarViewStrategy<TProjection, TOptions = undefined, TEvent = unknown> {
  getRange(
    anchor: Temporal.PlainDate,
    environment: CalendarEnvironmentBase,
    options: TOptions,
  ): PlainDateInterval;
  getTitle(
    range: PlainDateInterval,
    environment: CalendarEnvironmentBase,
    options: TOptions,
  ): string;
  navigate(anchor: Temporal.PlainDate, delta: number, options: TOptions): Temporal.PlainDate;
  project(input: CalendarViewProjectionInput<TOptions, TEvent>): TProjection;
}

/**
 * Resolves visible dates to the instants between their starts of day. `toZonedDateTime` uses the
 * start of day, so a date whose midnight is skipped by a DST gap begins at its first valid instant.
 */
export function resolveViewInstantRange(
  range: PlainDateInterval,
  timeZone: string,
): InstantInterval {
  return instantInterval(
    range.start.toZonedDateTime(timeZone).toInstant(),
    range.end.toZonedDateTime(timeZone).toInstant(),
  );
}
