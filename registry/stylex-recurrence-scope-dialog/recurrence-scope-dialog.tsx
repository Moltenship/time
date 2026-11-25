"use client";

import * as stylex from "@stylexjs/stylex";
import { useRef } from "react";

import { Button } from "@registry/stylex-calendar-ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@registry/stylex-calendar-ui/dialog";
import {
  moveBetweenRecurrenceScopes,
  offeredRecurrenceScopes,
  recurrenceScopeCancelLabel,
  recurrenceScopeLabels,
  recurrenceScopeText,
  type RecurrenceEditScope,
  type RecurrenceScopeAction,
} from "@registry/shared/recurrence-scope-dialog/recurrence-scope";

const styles = stylex.create({
  choice: {
    justifyContent: "flex-start",
  },
  choices: {
    display: "grid",
    gap: "0.5rem",
  },
});

export { offeredRecurrenceScopes };
export type { RecurrenceEditScope, RecurrenceScopeAction };

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
 * Asks which events of a recurring series a change applies to: one button per scope, then
 * Cancel. Focus starts on the narrowest scope offered, the arrow keys move between the scopes,
 * focus stays in the dialog while it is open, and goes back to where it was when the dialog
 * closes. `useRecurrenceScopePrompt` wraps it in a promise for `onEventChange`.
 */
export function RecurrenceScopeDialog({
  action,
  eventTitle,
  onClosed,
  onResolve,
  open,
  scopes,
}: RecurrenceScopeDialogProps) {
  const firstChoice = useRef<HTMLButtonElement>(null);
  const { description, title } = recurrenceScopeText(action, eventTitle);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && open) onResolve(null);
      }}
      // Focus is back where it was by the time the dialog has animated closed.
      onOpenChangeComplete={(next) => {
        if (!next) onClosed?.();
      }}
    >
      <DialogContent initialFocus={firstChoice}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div
          data-slot="recurrence-scope-choices"
          onKeyDown={(event) => moveBetweenRecurrenceScopes(event, event.currentTarget)}
          {...stylex.props(styles.choices)}
        >
          {offeredRecurrenceScopes(scopes).map((scope, index) => (
            <Button
              key={scope}
              ref={index === 0 ? firstChoice : undefined}
              data-scope={scope}
              variant="outline"
              size="lg"
              xstyle={styles.choice}
              onClick={() => {
                if (open) onResolve(scope);
              }}
            >
              {recurrenceScopeLabels[scope]}
            </Button>
          ))}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            {recurrenceScopeCancelLabel}
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
