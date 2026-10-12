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
   * Opens the dialog and resolves with the scope picked, or `null` when it is cancelled. Asking
   * again while it is open resolves the earlier question with `null`, as does unmounting. The
   * same function on every render.
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
 * the change rolls it back.
 *
 * `isRecurringChange(change)` from `@moltenship/calendar-recurrence` skips the question for
 * one-off events, and `recurrenceEditScopes(change, adapters)` from the same package lists the
 * scopes that make sense for the change, such as no "This and following events" on a series'
 * first occurrence.
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
 *
 *   async function onEventChange(change: Change) {
 *     if (!isRecurringChange(change)) return persist(change);
 *     const scope = await ask({
 *       action: change.cause === "delete" ? "delete" : "edit",
 *       scopes: recurrenceEditScopes(change, adapters),
 *     });
 *     // Rejecting rolls the change back.
 *     if (scope === null) throw new Error("cancelled");
 *     const edit = resolveRecurrenceEdit(change, scope, adapters);
 *     if (edit.type === "rejected") throw new Error(edit.message);
 *     await persist(edit);
 *   }
 *
 *   return (
 *     <>
 *       <Calendar.Root events={occurrences} onEventChange={onEventChange}>
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
  const pending = useRef<((scope: RecurrenceEditScope | null) => void) | null>(null);
  const unmounted = useRef(false);

  /** Answers the open question, if there is one, once. */
  const settle = useCallback((scope: RecurrenceEditScope | null) => {
    const resolve = pending.current;
    pending.current = null;
    resolve?.(scope);
  }, []);

  const ask = useCallback(
    (question: RecurrenceScopeQuestion = {}) => {
      // A newer question replaces the open one, which counts as cancelled.
      settle(null);
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
      settle(scope);
      setPrompt((current) => ({ ...current, open: false }));
    },
    [settle],
  );

  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
      settle(null);
    };
  }, [settle]);

  return {
    ask,
    dialog: (
      <RecurrenceScopeDialog
        action={prompt.question.action}
        eventTitle={prompt.question.eventTitle}
        onResolve={onResolve}
        open={prompt.open}
        scopes={prompt.question.scopes}
      />
    ),
  };
}
