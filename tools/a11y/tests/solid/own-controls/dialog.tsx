// An app's own dialog in place of the kit's `dialog.tsx`: the file keeps the kit's names and props
// and renders the browser's `<dialog>`, opened with `showModal()`, with no ui-sdk. The browser
// keeps focus in it and makes the page behind inert; Escape asks to close it.
// `data-own-control` lets the test see the dialog came from here.
import type { JSX } from "@solidjs/web";
import { createContext, createEffect, useContext } from "solid-js";

import type {
  DialogCloseProps,
  DialogContentProps,
  DialogProps,
  DialogSectionProps,
} from "@registry/calendar-ui/dialog";

export type { DialogCloseProps, DialogContentProps, DialogProps, DialogSectionProps };

interface DialogState {
  readonly close: () => void;
  readonly closed: () => void;
  readonly descriptionId: string;
  readonly open: () => boolean;
  readonly titleId: string;
}

const DialogContext = createContext<DialogState>();
let dialogs = 0;

const state = () => {
  const context = useContext(DialogContext);
  if (context === undefined) throw new Error("A dialog part outside <Dialog>");
  return context;
};

export function Dialog(props: DialogProps) {
  dialogs += 1;
  const context: DialogState = {
    close: () => props.onOpenChange?.(false),
    closed: () => props.onOpenChangeComplete?.(false),
    descriptionId: `own-dialog-${dialogs}-description`,
    open: () => props.open === true,
    titleId: `own-dialog-${dialogs}-title`,
  };
  return <DialogContext value={context}>{props.children}</DialogContext>;
}

export function DialogContent(props: DialogContentProps) {
  const context = state();
  let element: HTMLDialogElement | undefined;
  let returnTo: HTMLElement | null = null;
  createEffect(context.open, (open) => {
    if (element === undefined) return;
    if (open && !element.open) {
      returnTo = document.activeElement as HTMLElement | null;
      element.showModal();
      props.initialFocus?.()?.focus();
    } else if (!open && element.open) {
      element.close();
      returnTo?.focus();
      context.closed();
    }
  });
  return (
    <dialog
      ref={(node) => (element = node)}
      aria-describedby={context.descriptionId}
      aria-labelledby={context.titleId}
      class={`rounded-lg border bg-background p-4 ${props.class ?? ""}`}
      data-own-control=""
      onCancel={(event) => {
        event.preventDefault();
        context.close();
      }}
    >
      {props.children}
    </dialog>
  );
}

export function DialogHeader(props: DialogSectionProps) {
  return <div class={props.class}>{props.children}</div>;
}

export function DialogFooter(props: DialogSectionProps) {
  return <div class={props.class}>{props.children}</div>;
}

export function DialogTitle(props: DialogSectionProps) {
  return (
    <h2 class={props.class} id={state().titleId}>
      {props.children}
    </h2>
  );
}

export function DialogDescription(props: DialogSectionProps) {
  return (
    <p class={props.class} id={state().descriptionId}>
      {props.children}
    </p>
  );
}

export function DialogClose(props: DialogCloseProps) {
  const context = state();
  const own = {
    get children(): JSX.Element {
      return props.children;
    },
    get class() {
      return props.class;
    },
    onClick: () => context.close(),
    type: "button" as const,
  };
  return props.render === undefined ? <button {...own} /> : props.render(own, {});
}
