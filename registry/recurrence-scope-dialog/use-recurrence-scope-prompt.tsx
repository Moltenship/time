import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import {
  offeredRecurrenceScopes,
  RecurrenceScopeDialog,
  type RecurrenceEditScope,
  type RecurrenceScopeAction,
} from "./recurrence-scope-dialog";

/** What to ask about a pending change to an occurrence of a recurring event. */
export interface RecurrenceScopeQuestion {
  /** An edit (move, resize, update) or a delete; picks the copy. Defaults to `"edit"`. */
  readonly action?: RecurrenceScopeAction;
  /** The event's title, quoted in the question. */
  readonly eventTitle?: string;
  /**
   * The scopes to offer, shown in a fixed order: this, following, all. Defaults to all three.
   * With none, `ask` resolves `null` at once and shows nothing.
   */
  readonly scopes?: readonly RecurrenceEditScope[];
}

export interface RecurrenceScopePrompt {
  /**
   * Opens the dialog and resolves with the scope picked, or `null` when it is cancelled, once the
   * dialog has closed and focus is back where it was. Asking again while it is open resolves the
   * earlier question with `null`, as does unmounting; an answer still closing is handed over at
   * once. The same function on every render.
   */
  readonly ask: (question?: RecurrenceScopeQuestion) => Promise<RecurrenceEditScope | null>;
  /** The dialog; render it once, anywhere under the component that calls the hook. */
  readonly dialog: ReactNode;
}

interface PromptState {
  readonly open: boolean;
  /** Kept after an answer, so the dialog keeps its copy while it animates closed. */
  readonly question: RecurrenceScopeQuestion;
}

const closed: PromptState = { open: false, question: {} };

/**
 * Asks which events of a recurring series a change applies to, as a promise. Await it in
 * `onEventChange`: the change stays on screen, pending, while the dialog is open, and rejecting
 * the change rolls it back. Reject a cancelled question with an `AbortError`, so the calendar's
 * announcements say the change was cancelled, not that it couldn't be saved.
 *
 * `isRecurringChange(change)` from `@moltenship/calendar-recurrence` skips the question for
 * one-off events, and `recurrenceEditScopes(change, adapters)` from the same package lists the
 * scopes that make sense for the change, such as no "This and following events" on a series'
 * first occurrence.
 *
 * The answer comes once the dialog has closed and focus is back on the event. `"following"` and
 * `"all"` give the event a new ID: map focus through `edit.occurrenceIds` before `onEventChange`
 * returns, and the calendar moves focus to the event under its new ID.
 *
 * @example
 * ```tsx
 * import {
 *   isRecurringChange,
 *   recurrenceEditScopes,
 *   resolveRecurrenceEdit,
 * } from "@moltenship/calendar-recurrence";
 *
 * function Planner() {
 *   const { ask, dialog } = useRecurrenceScopePrompt();
 *   const [focus, setFocus] = useState<CalendarFocus | null>(null);
 *
 *   async function onEventChange(change: Change) {
 *     if (!isRecurringChange(change)) return persist(change);
 *     const scope = await ask({
 *       action: change.cause === "delete" ? "delete" : "edit",
 *       scopes: recurrenceEditScopes(change, adapters, { timeZone }),
 *     });
 *     // Rejecting rolls the change back; an `AbortError` is announced as a cancel.
 *     if (scope === null) throw new DOMException("Cancelled", "AbortError");
 *     // `newSeriesId` names the series "following" starts, so its IDs map too.
 *     // `timeZone` keeps a series' time of day when it is dragged by days on a calendar in another
 *     // zone than its own.
 *     const edit = resolveRecurrenceEdit(change, scope, adapters, {
 *       newSeriesId: createId(),
 *       timeZone,
 *     });
 *     if (edit.type === "rejected") throw new Error(edit.message);
 *     await persist(edit);
 *     setFocus((current) =>
 *       current?.kind === "event" && edit.type === "series"
 *         ? { ...current, eventId: edit.occurrenceIds.get(current.eventId) ?? current.eventId }
 *         : current,
 *     );
 *   }
 *
 *   return (
 *     <>
 *       <Calendar.Root
 *         events={occurrences}
 *         focus={focus}
 *         onEventChange={onEventChange}
 *         onFocusChange={setFocus}
 *         timeZone={timeZone}
 *       >
 *         …
 *       </Calendar.Root>
 *       {dialog}
 *     </>
 *   );
 * }
 * ```
 */
export function useRecurrenceScopePrompt(): RecurrenceScopePrompt {
  const [prompt, setPrompt] = useState<PromptState>(closed);
  /** Resolves the open question until it is answered. */
  const pending = useRef<((scope: RecurrenceEditScope | null) => void) | null>(null);
  /** Hands over an answer once the dialog has closed. */
  const answered = useRef<(() => void) | null>(null);
  const unmounted = useRef(false);

  /** Hands over an answer that is still closing. */
  const handOver = useCallback(() => {
    const answer = answered.current;
    answered.current = null;
    answer?.();
  }, []);

  /** Takes the open question's resolver, so only one answer reaches it. */
  const takePending = useCallback(() => {
    const resolve = pending.current;
    pending.current = null;
    return resolve;
  }, []);

  /** Hands over an answer, and cancels a question that has none. */
  const settle = useCallback(() => {
    handOver();
    takePending()?.(null);
  }, [handOver, takePending]);

  const ask = useCallback(
    (question: RecurrenceScopeQuestion = {}) => {
      // A newer question replaces the open one, which counts as cancelled; an answer still
      // closing goes now.
      settle();
      if (unmounted.current) return Promise.resolve(null);
      if (offeredRecurrenceScopes(question.scopes).length === 0) {
        setPrompt((current) => (current.open ? { ...current, open: false } : current));
        return Promise.resolve(null);
      }
      return new Promise<RecurrenceEditScope | null>((resolve) => {
        pending.current = resolve;
        setPrompt({ open: true, question });
      });
    },
    [settle],
  );

  const onResolve = useCallback(
    (scope: RecurrenceEditScope | null) => {
      const resolve = takePending();
      // The answer waits for focus to be back on the event: applying it can replace the event.
      if (resolve !== null) answered.current = () => resolve(scope);
      setPrompt((current) => ({ ...current, open: false }));
    },
    [takePending],
  );

  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
      settle();
    };
  }, [settle]);

  return {
    ask,
    dialog: (
      <RecurrenceScopeDialog
        action={prompt.question.action}
        eventTitle={prompt.question.eventTitle}
        onClosed={handOver}
        onResolve={onResolve}
        open={prompt.open}
        scopes={prompt.question.scopes}
      />
    ),
  };
}
