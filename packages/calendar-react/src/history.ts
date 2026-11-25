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
import { useContext, useInsertionEffect, useMemo, useRef, useSyncExternalStore } from "react";

import { useInteractionRuntime } from "./interaction";
import { CalendarEventsContext } from "./status";

export type {
  CalendarHistory,
  CalendarHistoryAnnouncementBuilder,
  CalendarHistoryAnnouncementContext,
  CalendarHistoryCommandOptions,
  CalendarHistoryMessages,
  CalendarHistoryOptions,
};

/**
 * Binds an event history to the nearest `Root`: undo and redo propose the inverse through the
 * root's `proposeEventChange`, against the events the user sees, and with `messages` their
 * outcomes are spoken through the root's `Announcer`. The history records through `Root`'s
 * `onEventChangeResult`:
 *
 * ```tsx
 * const [history] = useState(() => createEventHistory<Meeting, string, string>());
 * <Calendar.Root onEventChangeResult={history.record} …>
 *   <UndoButtons history={history} />
 * </Calendar.Root>
 * // Inside: const { canUndo, undo } = useCalendarHistory(history, { messages });
 * ```
 *
 * The server and hydration read an empty history.
 */
export function useCalendarHistory<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
>(
  history: EventHistory<TEvent, TEventId, TResourceId>,
  // Typed by the history alone, so messages written for any calendar fit.
  options: CalendarHistoryOptions<NoInfer<TEvent>, NoInfer<TEventId>, NoInfer<TResourceId>> = {},
): CalendarHistory<TEvent, TEventId, TResourceId> {
  const { actions, announcements, changes } = useInteractionRuntime();
  const events = useContext(CalendarEventsContext) as EventSnapshot<TEvent, TEventId, TResourceId>;
  const latest = useRef({ events, messages: options.messages });
  useInsertionEffect(() => {
    latest.current = { events, messages: options.messages };
  });
  const bound = useMemo(
    () => bindCalendarHistory({ actions, announcements, changes }, history, () => latest.current),
    [actions, announcements, changes, history],
  );
  return useSyncExternalStore(bound.subscribe, bound.getSnapshot, bound.getServerSnapshot);
}
