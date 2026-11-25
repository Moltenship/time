"use client";

import {
  Dialog as DialogRoot,
  DialogBackdrop,
  DialogClose as DialogClosePart,
  DialogContent as DialogContentPart,
  DialogDescription as DialogDescriptionPart,
  DialogTitle as DialogTitlePart,
} from "@ui-sdk/react/dialog";
import type { ReactElement, ReactNode, RefObject } from "react";

import { dialogStyles } from "@registry/shared/stylex-calendar-ui/dialog.styles";
import { type XStyle, xprops } from "@registry/stylex-calendar-theme/xprops";

export interface DialogProps {
  readonly children?: ReactNode;
  readonly onOpenChange?: (open: boolean) => void;
  /** Runs once the dialog has finished opening or closing, after its animation. */
  readonly onOpenChangeComplete?: (open: boolean) => void;
  readonly open?: boolean;
}

/** A modal dialog: the page behind it is inert until it closes, and Escape closes it. */
function Dialog(props: DialogProps) {
  return <DialogRoot {...props} />;
}

export interface DialogContentProps {
  readonly children?: ReactNode;
  readonly className?: string;
  /** Styles after the dialog's own. */
  readonly xstyle?: XStyle;
  /** Where focus goes when the dialog opens: by default, its first focusable element. */
  readonly initialFocus?: RefObject<HTMLElement | null>;
}

/** The dialog, centred over a dimmed page in the browser's top layer. */
function DialogContent({ className, initialFocus, xstyle, ...props }: DialogContentProps) {
  return (
    <>
      <DialogBackdrop {...xprops({}, dialogStyles.backdrop)} />
      <DialogContentPart
        initialFocus={initialFocus === undefined ? undefined : () => initialFocus.current}
        {...props}
        {...xprops({ className }, dialogStyles.content, xstyle)}
      />
    </>
  );
}

export interface DialogSectionProps {
  readonly children?: ReactNode;
  readonly className?: string;
  /** Styles after the part's own. */
  readonly xstyle?: XStyle;
}

function DialogHeader({ className, xstyle, ...props }: DialogSectionProps) {
  return (
    <div
      data-slot="dialog-header"
      {...props}
      {...xprops({ className }, dialogStyles.header, xstyle)}
    />
  );
}

/** The dialog's buttons, in a band along its bottom. */
function DialogFooter({ className, xstyle, ...props }: DialogSectionProps) {
  return (
    <div
      data-slot="dialog-footer"
      {...props}
      {...xprops({ className }, dialogStyles.footer, xstyle)}
    />
  );
}

/** Names the dialog. */
function DialogTitle({ className, xstyle, ...props }: DialogSectionProps) {
  return <DialogTitlePart {...props} {...xprops({ className }, dialogStyles.title, xstyle)} />;
}

/** Describes the dialog, read with its name. */
function DialogDescription({ className, xstyle, ...props }: DialogSectionProps) {
  return (
    <DialogDescriptionPart
      {...props}
      {...xprops({ className }, dialogStyles.description, xstyle)}
    />
  );
}

export interface DialogCloseProps {
  readonly children?: ReactNode;
  readonly className?: string;
  /** The element that closes the dialog, such as a `Button`, in place of a plain `<button>`. */
  readonly render?: ReactElement;
}

function DialogClose(props: DialogCloseProps) {
  return <DialogClosePart {...props} />;
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
};
