import {
  useCalendarHistory,
  useCalendarHistoryShortcuts,
  type CalendarFactory,
  type CalendarHistoryMessages,
  type EventHistory,
  type EventId,
  type ResourceId,
} from "@moltenship/calendar-solid";
import { createEffect, untrack } from "solid-js";

import { XIcon } from "@registry/calendar-ui/icons";
import {
  createToastManager,
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastTitle,
  ToastViewport,
} from "@registry/calendar-ui/toast";
import { calendarHistoryAnnouncements } from "@registry/shared/calendar/announcements";
import {
  calendarHistoryShortcutKeys,
  calendarHistoryToastContent,
  calendarHistoryToastId,
  calendarHistoryToastMessages,
  calendarHistoryToastTimeout,
  reportHistoryFailure,
  type CalendarHistoryToastMessages,
  type CalendarHistoryToastShortcuts,
} from "@registry/shared/calendar-history-toast/history-toast";
import { historyToastHintClassName } from "@registry/shared/calendar-history-toast/history-toast.styles";

export { calendarHistoryToastMessages };
export type { CalendarHistoryToastMessages, CalendarHistoryToastShortcuts };

export interface CalendarHistoryToastProps<
  TEvent,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
> {
  /** The calendar's factory, for its frame, where the keys work, and for event titles. */
  readonly calendar: Pick<CalendarFactory<TEvent, unknown>, "useCalendarMeta">;
  /** The history `Root`'s `onEventChangeResult` records into. Read once. */
  readonly history: EventHistory<TEvent, TEventId, TResourceId>;
  /** What the root's `Announcer` says after an undo or redo; `null` says nothing. */
  readonly announcements?: CalendarHistoryMessages | null;
  /** Classes for the toast's region, such as where it sits. */
  readonly class?: string;
  readonly messages?: CalendarHistoryToastMessages;
  /** The undo and redo keys, in the calendar's frame; `false` turns them off. */
  readonly shortcuts?: CalendarHistoryToastShortcuts | false;
  /** How long a toast stays, in milliseconds. */
  readonly timeout?: number;
}

/**
 * An "Undo" toast for a calendar's event history, with its keys. Render it inside `Root`:
 * after each change it offers to undo it, and after an undo, to redo it. Each toast is read out by
 * its title; a change no gesture announced adds how to reach Undo. Undo and redo are also spoken
 * through the root's `Announcer`, in full. Its buttons are reachable with F6.
 */
export function CalendarHistoryToast<
  TEvent,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
>(props: CalendarHistoryToastProps<TEvent, TEventId, TResourceId>) {
  const messages = () => props.messages ?? calendarHistoryToastMessages;
  const manager = createToastManager();
  const bound = useCalendarHistory(
    untrack(() => props.history),
    () => ({
      messages:
        (props.announcements === undefined ? calendarHistoryAnnouncements : props.announcements) ??
        undefined,
    }),
  );
  const meta = untrack(() => props.calendar).useCalendarMeta();
  useCalendarHistoryShortcuts(bound, () => ({
    ...calendarHistoryShortcutKeys(props.shortcuts),
    scope: meta().refs.frame,
  }));

  // Each new activity replaces the toast on screen; a history recorded before this mounted doesn't.
  let shown = untrack(() => bound().latest);
  createEffect(
    () => bound().latest,
    (activity) => {
      if (activity === shown) return;
      shown = activity;
      // The latest words, titles and timeout, as the activity lands.
      const { snapshot, text, timeout } = untrack(() => ({
        snapshot: meta().eventSnapshot,
        text: messages(),
        timeout: props.timeout ?? calendarHistoryToastTimeout,
      }));
      // A cleared history has nothing left to undo.
      const toast =
        activity === null
          ? null
          : calendarHistoryToastContent(
              activity,
              text,
              (eventId) => snapshot.get(eventId as TEventId)?.title,
              timeout,
            );
      if (toast === null) {
        manager.close(calendarHistoryToastId);
        return;
      }
      const { action } = toast;
      manager.add({
        actionProps:
          action === null
            ? undefined
            : {
                children: action === "undo" ? text.undo : text.redo,
                onClick: ({ input }) => bound()[action]({ input }).catch(reportHistoryFailure),
              },
        description: toast.hint ?? undefined,
        id: calendarHistoryToastId,
        timeout: toast.timeout,
        title: toast.title,
      });
    },
  );

  return (
    <ToastViewport aria-label={messages().region} class={props.class} manager={manager}>
      <Toast>
        <ToastTitle />
        {/* Heard after the title, as the toast shows. */}
        <ToastDescription class={historyToastHintClassName} />
        <ToastAction />
        <ToastClose aria-label={messages().dismiss}>
          <XIcon aria-hidden="true" />
        </ToastClose>
      </Toast>
    </ToastViewport>
  );
}
