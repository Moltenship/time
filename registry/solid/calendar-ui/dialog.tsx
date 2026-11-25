import type { JSX } from "@solidjs/web";
import {
  Dialog as DialogRoot,
  DialogBackdrop,
  DialogClose as DialogClosePart,
  DialogContent as DialogContentPart,
  DialogDescription as DialogDescriptionPart,
  DialogTitle as DialogTitlePart,
} from "@ui-sdk/solid/dialog";
import type { RenderProp } from "@ui-sdk/solid/primitive";
import { omit } from "solid-js";

import {
  dialogBackdropClassName,
  dialogContentClassName,
  dialogDescriptionClassName,
  dialogFooterClassName,
  dialogHeaderClassName,
  dialogTitleClassName,
} from "@registry/shared/calendar-ui/dialog.styles";
import { cn } from "cn";

export interface DialogProps {
  readonly children?: JSX.Element;
  readonly onOpenChange?: (open: boolean) => void;
  /** Runs once the dialog has finished opening or closing, after its animation. */
  readonly onOpenChangeComplete?: (open: boolean) => void;
  readonly open?: boolean;
}

/** A modal dialog: the page behind it is inert until it closes, and Escape closes it. */
function Dialog(props: DialogProps) {
  return (
    <DialogRoot
      onOpenChange={(open) => props.onOpenChange?.(open)}
      onOpenChangeComplete={(open) => props.onOpenChangeComplete?.(open)}
      open={props.open}
    >
      {props.children}
    </DialogRoot>
  );
}

export interface DialogContentProps {
  readonly children?: JSX.Element;
  readonly class?: string;
  /** Where focus goes when the dialog opens: by default, its first focusable element. */
  readonly initialFocus?: () => HTMLElement | null | undefined;
}

/** The dialog, centred over a dimmed page in the browser's top layer. */
function DialogContent(props: DialogContentProps) {
  const rest = omit(props, "class");
  return (
    <>
      <DialogBackdrop class={dialogBackdropClassName} />
      <DialogContentPart class={cn(dialogContentClassName, props.class)} {...rest} />
    </>
  );
}

export interface DialogSectionProps {
  readonly children?: JSX.Element;
  readonly class?: string;
}

function DialogHeader(props: DialogSectionProps) {
  return (
    <div data-slot="dialog-header" class={cn(dialogHeaderClassName, props.class)}>
      {props.children}
    </div>
  );
}

/** The dialog's buttons, in a band along its bottom. */
function DialogFooter(props: DialogSectionProps) {
  return (
    <div data-slot="dialog-footer" class={cn(dialogFooterClassName, props.class)}>
      {props.children}
    </div>
  );
}

/** Names the dialog. */
function DialogTitle(props: DialogSectionProps) {
  return (
    <DialogTitlePart class={cn(dialogTitleClassName, props.class)}>
      {props.children}
    </DialogTitlePart>
  );
}

/** Describes the dialog, read with its name. */
function DialogDescription(props: DialogSectionProps) {
  return (
    <DialogDescriptionPart class={cn(dialogDescriptionClassName, props.class)}>
      {props.children}
    </DialogDescriptionPart>
  );
}

export interface DialogCloseProps {
  readonly children?: JSX.Element;
  readonly class?: string;
  /**
   * The element that closes the dialog, such as a `Button`, in place of a plain `<button>`: a
   * function of the props to spread on it.
   */
  readonly render?: RenderProp;
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
