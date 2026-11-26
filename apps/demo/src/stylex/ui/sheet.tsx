import * as stylex from "@stylexjs/stylex";
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@ui-sdk/react/dialog";
import { XIcon } from "lucide-react";
import type { ReactNode, RefObject } from "react";

import { xprops } from "@registry/stylex-calendar-theme/xprops";
import { Button } from "@registry/stylex-calendar-ui/button";

import { visuallyHidden } from "./visually-hidden";

const small = "@media (min-width: 640px)";
const ease = "cubic-bezier(0.4, 0, 0.2, 1)";

/** shadcn's sheet from the left, the main demo's, in StyleX on ui-sdk's dialog. */
const styles = stylex.create({
  backdrop: {
    WebkitBackdropFilter: "blur(4px)",
    backdropFilter: "blur(4px)",
    backgroundColor: "rgb(0 0 0 / 0.1)",
    inset: 0,
    opacity: { default: null, "[data-ending-style]": 0, "[data-starting-style]": 0 },
    position: "fixed",
    transitionDuration: "150ms",
    transitionProperty: "opacity",
    transitionTimingFunction: ease,
    zIndex: 50,
  },
  content: {
    backgroundClip: "padding-box",
    backgroundColor: "var(--popover)",
    borderRightColor: "var(--border)",
    borderRightStyle: "solid",
    borderRightWidth: 1,
    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
    color: "var(--popover-foreground)",
    display: "flex",
    flexDirection: "column",
    fontSize: "0.875rem",
    gap: "0.5rem",
    height: "100%",
    insetBlock: 0,
    left: 0,
    lineHeight: "calc(1.25 / 0.875)",
    margin: 0,
    maxHeight: "none",
    maxWidth: { default: "none", [small]: "24rem" },
    opacity: { default: null, "[data-ending-style]": 0, "[data-starting-style]": 0 },
    outlineStyle: "none",
    padding: 0,
    position: "fixed",
    transitionDuration: "200ms",
    transitionProperty: "opacity, translate",
    transitionTimingFunction: ease,
    translate: {
      default: null,
      "[data-ending-style]": "-2.5rem",
      "[data-starting-style]": "-2.5rem",
    },
    width: "20rem",
  },
  close: {
    position: "absolute",
    right: "0.75rem",
    top: "0.75rem",
  },
  title: {
    color: "var(--foreground)",
    fontSize: "1.125rem",
    fontWeight: 500,
    lineHeight: "calc(1.75 / 1.125)",
  },
});

export interface SheetProps {
  readonly children?: ReactNode;
  /** Where focus goes when the sheet closes: by default, where it was before it opened. */
  readonly finalFocus?: () => HTMLElement | null | undefined;
  /** Where focus goes as it opens: the sheet itself, so the first control's tooltip stays shut. */
  readonly initialFocus?: RefObject<HTMLDivElement | null>;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}

export function Sheet({ children, finalFocus, initialFocus, onOpenChange, open }: SheetProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogBackdrop {...xprops({}, styles.backdrop)} />
      <DialogContent
        ref={initialFocus}
        data-side="left"
        finalFocus={finalFocus}
        initialFocus={initialFocus === undefined ? undefined : () => initialFocus.current}
        {...xprops({}, styles.content)}
      >
        {children}
        <DialogClose render={<Button size="icon-sm" variant="ghost" xstyle={styles.close} />}>
          <XIcon aria-hidden />
          <span {...stylex.props(visuallyHidden.text)}>Close</span>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

export function SheetTitle({ children }: { readonly children?: ReactNode }) {
  return <DialogTitle {...xprops({}, styles.title)}>{children}</DialogTitle>;
}
