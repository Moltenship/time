import type { EventId, ResourceId } from "@moltenship/calendar-core";

import { coerceRecurrenceDate } from "../dates";
import type { RecurrenceAdapters } from "../types";
import { seriesTimeOf } from "./dates";
import {
  isExcluded,
  loadSeries,
  noIds,
  overrideOf,
  reject,
  type Change,
  type Options,
} from "./series";
import type { RecurrenceEdit } from "./types";

const keepOthers = { action: "keep", series: "current" } as const;
const keepSeries = { action: "keep" } as const;

/**
 * `"this"`: an override for a move, resize or update, which keeps the original start and so the
 * occurrence's ID; an EXDATE for a delete, or a cancelled override when the master isn't loaded.
 */
export function resolveThis<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(
  change: Change<TEvent, TEventId, TResourceId>,
  adapters: RecurrenceAdapters<TEvent, TEventId, TResourceId>,
  options: Options<TEvent, TEventId>,
): RecurrenceEdit<TEvent, TEventId, TResourceId> {
  const link = change.event.recurrence;
  const override = overrideOf(change, adapters);
  const base = {
    cause: change.cause,
    occurrenceIds: noIds,
    otherOverrides: keepOthers,
    recurrenceId: link.recurrenceId,
    scope: "this",
    seriesId: link.seriesId,
    type: "series",
  } as const;

  if (change.cause !== "delete") {
    if (override !== undefined) {
      return {
        ...base,
        override: {
          action: "update",
          ...override,
          placement: change.proposed,
          recurrenceId: link.recurrenceId,
          series: "current",
        },
        series: keepSeries,
      };
    }
    if (link.series === undefined) return reject("missing-series", "The occurrence has no series.");
    // A new override's original start takes the series' kind, as the contract says.
    const first = adapters.event.getInterval(link.series);
    const recurrenceId = coerceRecurrenceDate(link.recurrenceId, first, "start", {
      defaultTimeZone: seriesTimeOf(first, options.defaultTimeZone).timeZone,
    });
    if (recurrenceId === undefined) {
      return reject(
        "date-kind-mismatch",
        "The occurrence's original start doesn't fit its series.",
      );
    }
    return {
      ...base,
      override: {
        action: "create",
        from: link.series,
        placement: change.proposed,
        recurrenceId,
        seriesId: link.seriesId,
      },
      recurrenceId,
      series: keepSeries,
    };
  }

  if (link.series === undefined) {
    // Without the master there is no EXDATE to add, so the override marks the occurrence deleted.
    if (override === undefined) return reject("missing-series", "The occurrence has no series.");
    return {
      ...base,
      override: {
        action: "update",
        cancelled: true,
        ...override,
        placement: change.original,
        recurrenceId: link.recurrenceId,
        series: "current",
      },
      series: keepSeries,
    };
  }

  const series = loadSeries(change, adapters, options);
  if ("type" in series) return series;
  const exceptions = series.recurrence.exceptionDates ?? [];
  return {
    ...base,
    recurrenceId: series.recurrenceId,
    ...(override === undefined ? {} : { override: { action: "delete", ...override } }),
    series: {
      action: "update",
      event: series.event,
      eventId: series.id,
      placement: series.placement,
      recurrence: isExcluded(series, series.recurrenceId)
        ? series.recurrence
        : { ...series.recurrence, exceptionDates: [...exceptions, series.recurrenceId] },
    },
  };
}
