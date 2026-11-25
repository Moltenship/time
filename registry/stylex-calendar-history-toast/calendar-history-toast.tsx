"use client";

import {
  useCalendarHistory,
  useCalendarHistoryShortcuts,
  type CalendarFactory,
  type CalendarHistoryMessages,
  type EventHistory,
  type EventId,
  type ResourceId,
} from "@moltenship/calendar";
import * as stylex from "@stylexjs/stylex";
import { XIcon } from "lucide-react";
import { useEffect, useInsertionEffect, useRef, useState } from "react";

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
import { visuallyHiddenStyles } from "@registry/shared/stylex-calendar-theme/visually-hidden.styles";
import type { XStyle } from "@registry/stylex-calendar-theme/xprops";
import {
  createToastManager,
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastTitle,
  ToastViewport,
  type ToastManager,
} from "@registry/stylex-calendar-ui/toast";

const styles = stylex.create({
  closeIcon: {
    flexShrink: 0,
    height: "1rem",
    pointerEvents: "none",
    width: "1rem",
  },
});

export { calendarHistoryToastMessages };
export type { CalendarHistoryToastMessages, CalendarHistoryToastShortcuts };

export interface CalendarHistoryToastProps<
  TEvent,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
> {
  /** The calendar's factory, for its frame, where the keys work, and for event titles. */
  readonly calendar: Pick<CalendarFactory<TEvent, unknown>, "useCalendarMeta">;
  /** The history `Root`'s `onEventChangeResult` records into. */
  readonly history: EventHistory<TEvent, TEventId, TResourceId>;
  /** What the root's `Announcer` says after an undo or redo; `null` says nothing. */
  readonly announcements?: CalendarHistoryMessages | null;
  /** Classes for the toast's region, such as where it sits. */
  readonly className?: string;
  readonly messages?: CalendarHistoryToastMessages;
  /** The undo and redo keys, in the calendar's frame; `false` turns them off. */
  readonly shortcuts?: CalendarHistoryToastShortcuts | false;
  /** How long a toast stays, in milliseconds. */
  readonly timeout?: number;
  /** Styles for the toast's region, such as where it sits, after its own. */
  readonly xstyle?: XStyle;
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
>({
  className,
  timeout = calendarHistoryToastTimeout,
  xstyle,
  ...props
}: CalendarHistoryToastProps<TEvent, TEventId, TResourceId>) {
  const { dismiss, region } = props.messages ?? calendarHistoryToastMessages;
  const [manager] = useState(createToastManager);
  return (
    <>
      <HistoryToasts {...props} manager={manager} timeout={timeout} />
      <ToastViewport aria-label={region} className={className} manager={manager} xstyle={xstyle}>
        <Toast>
          <ToastTitle />
          {/* Heard after the title, as the toast shows. */}
          <ToastDescription xstyle={visuallyHiddenStyles.hidden} />
          <ToastAction />
          <ToastClose aria-label={dismiss}>
            <XIcon {...stylex.props(styles.closeIcon)} />
          </ToastClose>
        </Toast>
      </ToastViewport>
    </>
  );
}

function HistoryToasts<TEvent, TEventId extends EventId, TResourceId extends ResourceId>({
  announcements = calendarHistoryAnnouncements,
  calendar,
  history,
  messages = calendarHistoryToastMessages,
  manager,
  shortcuts,
  timeout,
}: Omit<
  CalendarHistoryToastProps<TEvent, TEventId, TResourceId>,
  "className" | "timeout" | "xstyle"
> & {
  readonly manager: ToastManager;
  readonly timeout: number;
}) {
  const bound = useCalendarHistory(history, { messages: announcements ?? undefined });
  const meta = calendar.useCalendarMeta();
  useCalendarHistoryShortcuts(bound, {
    ...calendarHistoryShortcutKeys(shortcuts),
    scope: meta.refs.frame,
  });
  const latest = useRef({ bound, messages, snapshot: meta.eventSnapshot, timeout });
  useInsertionEffect(() => {
    latest.current = { bound, messages, snapshot: meta.eventSnapshot, timeout };
  });

  // Each new activity replaces the toast on screen; a history recorded before this mounted doesn't.
  const shown = useRef(bound.latest);
  useEffect(() => {
    const activity = bound.latest;
    if (activity === shown.current) return;
    shown.current = activity;
    const { bound: controls, messages: text, snapshot, timeout: shownFor } = latest.current;
    // A cleared history has nothing left to undo.
    const toast =
      activity === null
        ? null
        : calendarHistoryToastContent(
            activity,
            text,
            (eventId) => snapshot.get(eventId as TEventId)?.title,
            shownFor,
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
              onClick: ({ input }) => controls[action]({ input }).catch(reportHistoryFailure),
            },
      description: toast.hint ?? undefined,
      id: calendarHistoryToastId,
      timeout: toast.timeout,
      title: toast.title,
    });
  }, [bound.latest, manager]);

  return null;
}
