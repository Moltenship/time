import { For } from "solid-js";

import { Button } from "@registry/calendar-ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@registry/calendar-ui/dialog";
import {
  moveBetweenRecurrenceScopes,
  offeredRecurrenceScopes,
  recurrenceScopeCancelLabel,
  recurrenceScopeLabels,
  recurrenceScopeText,
  type RecurrenceEditScope,
  type RecurrenceScopeAction,
} from "@registry/shared/recurrence-scope-dialog/recurrence-scope";
import {
  recurrenceScopeChoiceClassName,
  recurrenceScopeChoicesClassName,
} from "@registry/shared/recurrence-scope-dialog/recurrence-scope-dialog.styles";

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
export function RecurrenceScopeDialog(props: RecurrenceScopeDialogProps) {
  let choices: HTMLDivElement | undefined;
  const text = () => recurrenceScopeText(props.action, props.eventTitle);

  return (
    <Dialog
      open={props.open}
      onOpenChange={(next) => {
        if (!next && props.open) props.onResolve(null);
      }}
      // Focus is back where it was by the time the dialog has animated closed.
      onOpenChangeComplete={(next) => {
        if (!next) props.onClosed?.();
      }}
    >
      <DialogContent initialFocus={() => choices?.querySelector<HTMLElement>("[data-scope]")}>
        <DialogHeader>
          <DialogTitle>{text().title}</DialogTitle>
          <DialogDescription>{text().description}</DialogDescription>
        </DialogHeader>
        <div
          ref={(element) => (choices = element)}
          data-slot="recurrence-scope-choices"
          class={recurrenceScopeChoicesClassName}
          onKeyDown={(event) => moveBetweenRecurrenceScopes(event, event.currentTarget)}
        >
          <For each={offeredRecurrenceScopes(props.scopes)}>
            {(scope) => (
              <Button
                data-scope={scope}
                variant="outline"
                size="lg"
                class={recurrenceScopeChoiceClassName}
                onClick={() => {
                  if (props.open) props.onResolve(scope);
                }}
              >
                {recurrenceScopeLabels[scope]}
              </Button>
            )}
          </For>
        </div>
        <DialogFooter>
          <DialogClose render={(close) => <Button variant="outline" {...close} />}>
            {recurrenceScopeCancelLabel}
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
