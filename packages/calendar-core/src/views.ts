import {
  instantInterval,
  plainDateIntervalContainsInterval,
  type InstantInterval,
  type PlainDateInterval,
} from "@moltenship/calendar-temporal";

import type { CalendarEnvironmentBase } from "./environment";
import type { EventId, ResourceId } from "./ids";
import type { CalendarSpatialNavigation, CalendarSpatialNavigationInput } from "./navigation/types";
import type { ResourceTree } from "./resources/tree";
import type { EventSnapshot } from "./snapshots/types";

export interface CalendarViewProjectionInput<TOptions, TEvent = unknown> {
  readonly environment: CalendarEnvironmentBase;
  /** Resources whose children show; see `visibleResources`. */
  readonly expandedResourceIds: readonly ResourceId[];
  /** The visible dates resolved to instants in the display time zone. */
  readonly instantRange: InstantInterval;
  /**
   * The dates to project: `range`, or more when the strategy's `getLoadRange` keeps dates ready
   * around it, as a scrolling view keeps its neighbouring pages. `Root` always sets it; read it as
   * `loadRange ?? range` when calling `project` yourself.
   */
  readonly loadRange?: PlainDateInterval;
  readonly options: TOptions;
  /** The visible dates. */
  readonly range: PlainDateInterval;
  /** The root's resources by `parentId`, built once per resource list. */
  readonly resources: ResourceTree;
  readonly snapshot: EventSnapshot<TEvent, EventId, ResourceId>;
  /** The current date in the display time zone, or `null` until a clock is available. */
  readonly today: Temporal.PlainDate | null;
}

/** Pure range, navigation, title, and projection rules for one kind of view. */
export interface CalendarViewStrategy<TProjection, TOptions = undefined, TEvent = unknown> {
  /**
   * The dates to project and to have events for: the visible range and the dates the view keeps
   * ready around it, as a scrolling view keeps a page on each side so a swipe shows events at
   * once. It must contain `getRange`'s dates. Without it, a view projects only what it shows.
   */
  getLoadRange?(
    anchor: Temporal.PlainDate,
    environment: CalendarEnvironmentBase,
    options: TOptions,
  ): PlainDateInterval;
  getRange(
    anchor: Temporal.PlainDate,
    environment: CalendarEnvironmentBase,
    options: TOptions,
  ): PlainDateInterval;
  /** Where a navigation key moves focus; a view without it has no keyboard navigation. */
  getSpatialNavigation?(
    input: CalendarSpatialNavigationInput<TProjection, TOptions>,
  ): CalendarSpatialNavigation | null;
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

/**
 * The dates a strategy projects for `anchor`: its `getLoadRange`, or the visible `range` when it
 * has none. A load range that leaves out visible dates throws `RangeError`.
 */
export function resolveViewLoadRange<TOptions>(
  strategy: Pick<CalendarViewStrategy<unknown, TOptions>, "getLoadRange">,
  anchor: Temporal.PlainDate,
  environment: CalendarEnvironmentBase,
  options: TOptions,
  range: PlainDateInterval,
): PlainDateInterval {
  const loadRange = strategy.getLoadRange?.(anchor, environment, options);
  if (loadRange === undefined) return range;
  if (!plainDateIntervalContainsInterval(loadRange, range)) {
    throw new RangeError("view-load-range-must-contain-range");
  }
  return loadRange;
}
