import {
  createCanonicalEventAdapter,
  type EventId,
  type ResourceId,
} from "@moltenship/calendar-core";

import type { RecurrenceAdapters, RecurringCalendarEvent } from "../types";

/** Adapters for `RecurringCalendarEvent`, for applications without their own event type. */
export function createCanonicalRecurrenceAdapter<
  TData = unknown,
  TEventId extends EventId = string,
  TResourceId extends ResourceId = string,
>(): RecurrenceAdapters<
  RecurringCalendarEvent<TData, TEventId, TResourceId>,
  TEventId,
  TResourceId
> {
  return {
    event: createCanonicalEventAdapter<TData, TEventId, TResourceId>(),
    recurrence: {
      getOverride: (event) => event.override,
      getRecurrence: (event) => event.recurrence,
    },
  };
}
