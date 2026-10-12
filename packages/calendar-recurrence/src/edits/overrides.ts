import type { EventId, ResourceId } from "@moltenship/calendar-core";

import { compareDates, datesEqual } from "../internal/dates";
import type { RecurrenceDate } from "../types";
import { readKey, rekey } from "./keys";
import type { RecurrenceOverrideRekey, RecurrenceSeriesEdit } from "./types";

const keep = { action: "keep" } as const;

/**
 * What an edit does to one of the series' other overrides, by its `recurrenceId`. Apply it to every
 * override of `edit.seriesId` the application stores, loaded or not; the edited occurrence's own
 * override is `edit.override`, so this keeps it. An `"update"` gives the override's new original
 * start and series; its own placement stays.
 */
export function recurrenceOverrideEdit<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
>(
  edit: RecurrenceSeriesEdit<TEvent, TEventId, TResourceId>,
  recurrenceId: RecurrenceDate,
): RecurrenceOverrideRekey {
  const { action, after, series, shift } = edit.otherOverrides;
  if (action === "keep" || shift === undefined) return keep;
  if (action === "delete" && after === undefined) return { action: "delete" };
  const key = readKey(shift, recurrenceId, "start");
  if (key === undefined || datesEqual(key, edit.recurrenceId)) return keep;
  if (after !== undefined && compareDates(key, after) <= 0) return keep;
  if (action === "delete") return { action: "delete" };
  const next = rekey(shift, key, "start");
  return next === undefined ? keep : { action: "update", recurrenceId: next, series };
}
