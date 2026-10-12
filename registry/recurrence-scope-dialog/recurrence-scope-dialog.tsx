import { useInsertionEffect, useLayoutEffect, useRef } from "react";

import { Button } from "@registry/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@registry/ui/dialog";

/**
 * Which events a change to one occurrence of a recurring event applies to: `"this"` occurrence
 * alone, `"following"` (it and every later one), or `"all"` of the series.
 *
 * The same union as `RecurrenceEditScope` from `@moltenship/calendar-recurrence`, declared here so
 * the registry source depends on nothing but `@moltenship/calendar`. The two match structurally,
 * so a scope from this dialog passes straight to `resolveRecurrenceEdit`.
 */
export type RecurrenceEditScope = "this" | "following" | "all";

/** What the pending change does; it picks the dialog's title and question. */
export type RecurrenceScopeAction = "edit" | "delete";

/** The order the dialog lists scopes in, from the narrowest to the whole series. */
const scopeOrder: readonly RecurrenceEditScope[] = ["this", "following", "all"];

const scopeLabels: Readonly<Record<RecurrenceEditScope, string>> = {
  this: "This event",
  following: "This and following events",
  all: "All events",
};

const actionCopy: Readonly<
  Record<RecurrenceScopeAction, { readonly question: string; readonly title: string }>
> = {
  edit: {
    question: "Which events should this change apply to?",
    title: "Edit recurring event",
  },
  delete: {
    question: "Which events do you want to delete?",
    title: "Delete recurring event",
  },
};

/**
 * The scopes the dialog offers for `scopes`, in display order: this, following, all, whatever
 * order they are given in. Duplicates and unknown values drop out; no `scopes` means all three.
 */
export function offeredRecurrenceScopes(
  scopes?: readonly RecurrenceEditScope[],
): readonly RecurrenceEditScope[] {
  return scopes === undefined ? scopeOrder : scopeOrder.filter((scope) => scopes.includes(scope));
}

export interface RecurrenceScopeDialogProps {
  /** An edit (move, resize, update) or a delete. Defaults to `"edit"`. */
  readonly action?: RecurrenceScopeAction;
  /** The event's title, quoted in the question. */
  readonly eventTitle?: string;
  /**
   * Called once the dialog has closed and focus is back where it was. Apply the answer then: when
   * the edit replaces the focused event, as `"all"` does, the calendar moves focus to the new one.
   * Applied earlier, focus has nowhere to go back to and drops to the page.
   */
  readonly onClosed?: () => void;
  /**
   * Called with the scope picked, or with `null` when the dialog is dismissed: Cancel, Escape or
   * a click outside. Clicks while the dialog animates closed call nothing.
   */
  readonly onResolve: (scope: RecurrenceEditScope | null) => void;
  readonly open: boolean;
  /**
   * The scopes to offer, such as no "This and following events" on a series' first occurrence.
   * They show in a fixed order whatever order they come in. Defaults to all three.
   */
  readonly scopes?: readonly RecurrenceEditScope[];
}

/**
 * Calls `onClosed` once the dialog it is in has unmounted and focus is back. Base UI queues that
 * focus as the popup unmounts, and the popup's cleanups run before those of its children, so the
 * call this one queues comes after it. The browser a11y suite checks that order.
 */
function ClosedSignal({ onClosed }: { readonly onClosed: (() => void) | undefined }) {
  const latest = useRef(onClosed);
  const mounted = useRef(false);
  useInsertionEffect(() => {
    latest.current = onClosed;
  });
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // StrictMode runs this cleanup and mounts again at once; only a real unmount stays down.
      queueMicrotask(() => {
        if (!mounted.current) latest.current?.();
      });
    };
  }, []);
  return null;
}

/**
 * Asks which events of a recurring series a change applies to: one button per scope, then
 * Cancel. Focus starts on the narrowest scope offered, stays in the dialog while it is open, and
 * goes back to where it was when the dialog closes. `useRecurrenceScopePrompt` wraps it in a
 * promise for `onEventChange`.
 */
export function RecurrenceScopeDialog({
  action = "edit",
  eventTitle,
  onClosed,
  onResolve,
  open,
  scopes,
}: RecurrenceScopeDialogProps) {
  const firstChoice = useRef<HTMLButtonElement>(null);
  const { question, title } = actionCopy[action];
  const subject = eventTitle === undefined ? "This event" : `“${eventTitle}”`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && open) onResolve(null);
      }}
    >
      <DialogContent showCloseButton={false} initialFocus={firstChoice}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {subject} repeats. {question}
          </DialogDescription>
        </DialogHeader>
        <div data-slot="recurrence-scope-choices" className="grid gap-2">
          {offeredRecurrenceScopes(scopes).map((scope, index) => (
            <Button
              key={scope}
              ref={index === 0 ? firstChoice : undefined}
              data-scope={scope}
              variant="outline"
              size="lg"
              className="justify-start"
              onClick={() => {
                if (open) onResolve(scope);
              }}
            >
              {scopeLabels[scope]}
            </Button>
          ))}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        </DialogFooter>
        <ClosedSignal onClosed={onClosed} />
      </DialogContent>
    </Dialog>
  );
}
