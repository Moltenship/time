import type { JSX } from "@solidjs/web";
import {
  DialogBackdrop,
  DialogClose,
  DialogContent as DialogContentPart,
} from "@ui-sdk/solid/dialog";

import { Button } from "@registry/calendar-ui/button";
import {
  dialogBackdropClassName,
  dialogContentClassName,
} from "@registry/shared/calendar-ui/dialog.styles";
import { cn } from "cn";

import { XIcon } from "../icons";

export { Dialog, DialogFooter, DialogHeader, DialogTitle } from "@registry/calendar-ui/dialog";

// The kit's dialog with the React demo's shadcn close button in its corner, and a place for focus
// to go back to, which the kit's content doesn't take.

export function DialogContent(props: {
  readonly children?: JSX.Element;
  readonly class?: string;
  /** Where focus goes when the dialog closes: by default, where it was before it opened. */
  readonly finalFocus?: () => HTMLElement | null | undefined;
}) {
  return (
    <>
      <DialogBackdrop class={dialogBackdropClassName} />
      <DialogContentPart
        class={cn(dialogContentClassName, props.class)}
        finalFocus={props.finalFocus}
      >
        {props.children}
        <DialogClose
          render={(close) => (
            <Button {...close} class="absolute top-2 right-2" size="icon-sm" variant="ghost" />
          )}
        >
          <XIcon />
          <span class="sr-only">Close</span>
        </DialogClose>
      </DialogContentPart>
    </>
  );
}
