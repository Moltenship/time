import type { CalendarEventPlacement, EventId, ResourceId } from "@moltenship/calendar-core";

import type { RecurringCalendarEvent } from "../types";
import { recurrenceOverrideEdit } from "./overrides";
import type { RecurrenceSeriesEdit } from "./types";

export interface ApplyRecurrenceEditOptions<
  TData,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
  /**
   * The ID of an event the edit creates: an override, or the series a `"following"` edit starts
   * when `newSeries.id` doesn't name it. It gets the event without its ID.
   */
  readonly createId: (
    event: Omit<RecurringCalendarEvent<TData, TEventId, TResourceId>, "id">,
  ) => TEventId;
}

type Event<
  TData,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> = RecurringCalendarEvent<TData, TEventId, TResourceId>;

/** The event at `placement`, without the fields of its old kind. */
function placed<TEvent extends Event<unknown, EventId, ResourceId>>(
  event: Omit<TEvent, "id"> & { readonly id?: TEvent["id"] },
  placement: CalendarEventPlacement<NonNullable<TEvent["resourceIds"]>[number]>,
): TEvent {
  const {
    end: _end,
    kind: _kind,
    sourceTimeZone: _zone,
    start: _start,
    ...rest
  } = event as Omit<TEvent, "id"> & { readonly sourceTimeZone?: string };
  return { ...rest, ...placement } as unknown as TEvent;
}

/**
 * Applies a series edit to an application's `RecurringCalendarEvent`s and returns the new list,
 * without changing the input: the master's update or delete, the series a `"following"` edit
 * starts, the edited occurrence's override, and every other override of the series, by
 * `recurrenceOverrideEdit`. New events copy the master and get IDs from `options.createId`.
 * Applications with their own event type or store write the same steps themselves.
 */
export function applyRecurrenceEdit<
  TData,
  TEventId extends EventId,
  TResourceId extends ResourceId,
>(
  events: readonly Event<TData, TEventId, TResourceId>[],
  edit: RecurrenceSeriesEdit<Event<TData, TEventId, TResourceId>, TEventId, TResourceId>,
  options: ApplyRecurrenceEditOptions<TData, TEventId, TResourceId>,
): Event<TData, TEventId, TResourceId>[] {
  type E = Event<TData, TEventId, TResourceId>;
  const created: E[] = [];

  let newSeriesId: TEventId | undefined;
  if (edit.newSeries !== undefined) {
    const { from, id, placement, recurrence } = edit.newSeries;
    const { id: _id, override: _override, ...source } = from;
    const draft = placed<E>({ ...source, recurrence }, placement);
    newSeriesId = id ?? options.createId(draft);
    created.push({ ...draft, id: newSeriesId });
  }
  const seriesIdOf = (series: "current" | "new"): TEventId =>
    series === "new" && newSeriesId !== undefined ? newSeriesId : edit.seriesId;

  const { override: edited } = edit;
  const next = events.flatMap((event): E[] => {
    if (event.id === edit.seriesId && event.override === undefined) {
      const { series } = edit;
      if (series.action === "delete") return [];
      if (series.action === "keep") return [event];
      return [placed<E>({ ...event, recurrence: series.recurrence }, series.placement)];
    }

    const { override } = event;
    if (override === undefined || override.seriesId !== edit.seriesId) return [event];
    if (edited !== undefined && edited.action !== "create" && event.id === edited.eventId) {
      if (edited.action === "delete") return [];
      return [
        placed<E>(
          {
            ...event,
            override: {
              ...override,
              ...(edited.cancelled === true ? { cancelled: true } : {}),
              recurrenceId: edited.recurrenceId,
              seriesId: seriesIdOf(edited.series),
            },
          },
          edited.placement,
        ),
      ];
    }

    const rekey = recurrenceOverrideEdit(edit, override.recurrenceId);
    if (rekey.action === "delete") return [];
    if (rekey.action === "keep") return [event];
    return [
      {
        ...event,
        override: {
          ...override,
          recurrenceId: rekey.recurrenceId,
          seriesId: seriesIdOf(rekey.series),
        },
      },
    ];
  });

  if (edited?.action === "create") {
    const { id: _id, recurrence: _recurrence, ...source } = edited.from;
    const draft = placed<E>(
      { ...source, override: { recurrenceId: edited.recurrenceId, seriesId: edited.seriesId } },
      edited.placement,
    );
    created.push({ ...draft, id: options.createId(draft) });
  }
  return [...next, ...created];
}
