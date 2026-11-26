import type { JSX } from "@solidjs/web";
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@ui-sdk/solid/dialog";

import { Button } from "@registry/calendar-ui/button";
import { cn } from "cn";

import { XIcon } from "../icons";

// The React demo's shadcn sheet from the left (apps/demo/src/components/ui/sheet.tsx), on ui-sdk's
// dialog: the same classes, and the same `data-starting-style` and `data-ending-style` to slide on.

export interface SheetProps {
  readonly children?: JSX.Element;
  readonly class?: string;
  /** Where focus goes when the sheet closes: by default, where it was before it opened. */
  readonly finalFocus?: () => HTMLElement | null | undefined;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}

export function Sheet(props: SheetProps) {
  let content: HTMLElement | undefined;
  return (
    <Dialog onOpenChange={(open) => props.onOpenChange(open)} open={props.open}>
      <DialogBackdrop class="fixed inset-0 z-50 bg-black/10 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />
      <DialogContent
        ref={(element: HTMLElement) => (content = element)}
        data-side="left"
        // The sheet itself, so the first control's tooltip doesn't pop open.
        initialFocus={() => content}
        finalFocus={props.finalFocus}
        class={cn(
          "fixed inset-y-0 left-0 z-50 m-0 flex h-full max-h-none w-3/4 max-w-none flex-col gap-4 border-0 border-r bg-popover bg-clip-padding p-0 text-sm text-popover-foreground shadow-lg transition duration-200 ease-in-out data-ending-style:translate-x-[-2.5rem] data-ending-style:opacity-0 data-starting-style:translate-x-[-2.5rem] data-starting-style:opacity-0 sm:max-w-sm",
          props.class,
        )}
      >
        {props.children}
        <DialogClose
          render={(close) => (
            <Button {...close} class="absolute top-3 right-3" size="icon-sm" variant="ghost" />
          )}
        >
          <XIcon />
          <span class="sr-only">Close</span>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

export function SheetTitle(props: { readonly children?: JSX.Element; readonly class?: string }) {
  return (
    <DialogTitle class={cn("font-heading text-base font-medium text-foreground", props.class)}>
      {props.children}
    </DialogTitle>
  );
}
