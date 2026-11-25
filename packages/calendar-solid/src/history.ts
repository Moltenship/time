import type { EventHistory, EventId, EventSnapshot, ResourceId } from "@moltenship/calendar-core";
import {
  bindCalendarHistory,
  type CalendarHistory,
  type CalendarHistoryAnnouncementBuilder,
  type CalendarHistoryAnnouncementContext,
  type CalendarHistoryCommandOptions,
  type CalendarHistoryMessages,
  type CalendarHistoryOptions,
} from "@moltenship/calendar-primitives";
import { createMemo, untrack, type Accessor } from "solid-js";

import { access, useShared, type MaybeAccessor } from "./shared";
import { createStateSelector } from "./state-selector";

export type {
  CalendarHistory,
  CalendarHistoryAnnouncementBuilder,
  CalendarHistoryAnnouncementContext,
  CalendarHistoryCommandOptions,
  CalendarHistoryMessages,
  CalendarHistoryOptions,
};

const same = <T>(value: T) => value;

/**
 * Binds an event history to the nearest `Root`, as an accessor: undo and redo propose the inverse
 * through the root's `proposeEventChange`, against the events the user sees, and with `messages`
 * their outcomes are spoken through the root's `Announcer`. The history records through `Root`'s
 * `onEventChangeResult`:
 *
 * ```tsx
 * const history = createEventHistory<Meeting, string, string>();
 * <Calendar.Root onEventChangeResult={history.record} …>
 *   <UndoButtons history={history} />
 * </Calendar.Root>
 * // Inside: const bound = useCalendarHistory(history, { messages });
 * // <button disabled={!bound().canUndo} onClick={() => bound().undo()}>Undo</button>
 * ```
 *
 * `messages` is read when a step runs. The server and hydration read an empty history.
 */
export function useCalendarHistory<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
>(
  history: EventHistory<TEvent, TEventId, TResourceId>,
  // Typed by the history alone, so messages written for any calendar fit.
  options: MaybeAccessor<
    CalendarHistoryOptions<NoInfer<TEvent>, NoInfer<TEventId>, NoInfer<TResourceId>>
  > = {},
): Accessor<CalendarHistory<TEvent, TEventId, TResourceId>> {
  const { events, interaction } = useShared();
  const bound = createMemo(() => {
    const { actions, announcements, changes } = interaction();
    return bindCalendarHistory({ actions, announcements, changes }, history, () =>
      untrack(() => ({
        events: events() as EventSnapshot<TEvent, TEventId, TResourceId>,
        messages: access(options).messages,
      })),
    );
  });
  return createStateSelector(bound, same);
}
