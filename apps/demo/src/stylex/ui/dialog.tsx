import * as stylex from "@stylexjs/stylex";
import {
  DialogBackdrop,
  DialogClose,
  DialogContent as DialogContentPart,
} from "@ui-sdk/react/dialog";
import { XIcon } from "lucide-react";
import type { ReactNode } from "react";

import { dialogStyles } from "@registry/shared/stylex-calendar-ui/dialog.styles";
import { type XStyle, xprops } from "@registry/stylex-calendar-theme/xprops";
import { Button } from "@registry/stylex-calendar-ui/button";

import { visuallyHidden } from "./visually-hidden";

export {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@registry/stylex-calendar-ui/dialog";

const styles = stylex.create({
  close: {
    position: "absolute",
    right: "0.5rem",
    top: "0.5rem",
  },
});

export interface DialogContentProps {
  readonly children?: ReactNode;
  /** Where focus goes when the dialog closes: by default, back to what opened it. */
  readonly finalFocus?: () => HTMLElement | null | undefined;
  readonly xstyle?: XStyle;
}

/**
 * The kit's dialog with the close button in its corner that the main demo's shadcn dialog has. The
 * kit's `DialogContent` has no `finalFocus`, which the event editor needs to return to its event.
 */
export function DialogContent({ children, finalFocus, xstyle }: DialogContentProps) {
  return (
    <>
      <DialogBackdrop {...xprops({}, dialogStyles.backdrop)} />
      <DialogContentPart finalFocus={finalFocus} {...xprops({}, dialogStyles.content, xstyle)}>
        {children}
        <DialogClose render={<Button size="icon-sm" variant="ghost" xstyle={styles.close} />}>
          <XIcon aria-hidden />
          <span {...stylex.props(visuallyHidden.text)}>Close</span>
        </DialogClose>
      </DialogContentPart>
    </>
  );
}
