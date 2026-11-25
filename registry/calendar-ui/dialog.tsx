"use client";

import {
  Dialog as DialogRoot,
  DialogBackdrop,
  DialogClose as DialogClosePart,
  DialogContent as DialogContentPart,
  DialogDescription as DialogDescriptionPart,
  DialogTitle as DialogTitlePart,
} from "@ui-sdk/react/dialog";
import { cn } from "cn";
import type { ReactElement, ReactNode, RefObject } from "react";

import {
  dialogBackdropClassName,
  dialogContentClassName,
  dialogDescriptionClassName,
  dialogFooterClassName,
  dialogHeaderClassName,
  dialogTitleClassName,
} from "@registry/shared/calendar-ui/dialog.styles";

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
  /** Where focus goes when the dialog opens: by default, its first focusable element. */
  readonly initialFocus?: RefObject<HTMLElement | null>;
}

/** The dialog, centred over a dimmed page in the browser's top layer. */
function DialogContent({ className, initialFocus, ...props }: DialogContentProps) {
  return (
    <>
      <DialogBackdrop className={dialogBackdropClassName} />
      <DialogContentPart
        className={cn(dialogContentClassName, className)}
        initialFocus={initialFocus === undefined ? undefined : () => initialFocus.current}
        {...props}
      />
    </>
  );
}

export interface DialogSectionProps {
  readonly children?: ReactNode;
  readonly className?: string;
}

function DialogHeader({ className, ...props }: DialogSectionProps) {
  return (
    <div data-slot="dialog-header" className={cn(dialogHeaderClassName, className)} {...props} />
  );
}

/** The dialog's buttons, in a band along its bottom. */
function DialogFooter({ className, ...props }: DialogSectionProps) {
  return (
    <div data-slot="dialog-footer" className={cn(dialogFooterClassName, className)} {...props} />
  );
}

/** Names the dialog. */
function DialogTitle({ className, ...props }: DialogSectionProps) {
  return <DialogTitlePart className={cn(dialogTitleClassName, className)} {...props} />;
}

/** Describes the dialog, read with its name. */
function DialogDescription({ className, ...props }: DialogSectionProps) {
  return <DialogDescriptionPart className={cn(dialogDescriptionClassName, className)} {...props} />;
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
