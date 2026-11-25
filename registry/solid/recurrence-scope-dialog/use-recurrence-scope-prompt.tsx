import type { JSX } from "@solidjs/web";
import { createSignal, onSettled } from "solid-js";

import {
  closedRecurrenceScopePrompt,
  createRecurrenceScopeQuestions,
  type RecurrenceScopeQuestion,
} from "@registry/shared/recurrence-scope-dialog/recurrence-scope";

import { RecurrenceScopeDialog, type RecurrenceEditScope } from "./recurrence-scope-dialog";

export type { RecurrenceScopeQuestion };

export interface RecurrenceScopePrompt {
  /**
   * Opens the dialog and resolves with the scope picked, or `null` when it is cancelled, once the
   * dialog has closed and focus is back where it was. Asking again while it is open resolves the
   * earlier question with `null`, as does unmounting; an answer still closing is handed over at
   * once.
   */
  readonly ask: (question?: RecurrenceScopeQuestion) => Promise<RecurrenceEditScope | null>;
  /** The dialog; render it once, anywhere under the component that calls the hook. */
  readonly dialog: JSX.Element;
}

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
 *   const [focus, setFocus] = createSignal<CalendarFocus | null>(null);
 *
 *   async function onEventChange(change: Change) {
 *     if (!isRecurringChange(change)) return persist(change);
 *     const scope = await ask({
 *       action: change.cause === "delete" ? "delete" : "edit",
 *       scopes: recurrenceEditScopes(change, adapters, { timeZone }),
 *     });
 *     // Rejecting rolls the change back; an `AbortError` is announced as a cancel.
 *     if (scope === null) throw new DOMException("Cancelled", "AbortError");
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
 *         events={occurrences()}
 *         focus={focus()}
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
  const [prompt, setPrompt] = createSignal(closedRecurrenceScopePrompt, { ownedWrite: true });
  const questions = createRecurrenceScopeQuestions((state) => setPrompt(state));

  onSettled(() => questions.connect());

  return {
    ask: questions.ask,
    dialog: (
      <RecurrenceScopeDialog
        action={prompt().question.action}
        eventTitle={prompt().question.eventTitle}
        onClosed={questions.closed}
        onResolve={questions.answer}
        open={prompt().open}
        scopes={prompt().question.scopes}
      />
    ),
  };
}
