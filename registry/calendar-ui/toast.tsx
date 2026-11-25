"use client";

import {
  createToaster,
  Toast as ToastPart,
  ToastAction as ToastActionPart,
  ToastClose as ToastClosePart,
  ToastDescription as ToastDescriptionPart,
  ToastRegion,
  ToastTitle as ToastTitlePart,
  type Toaster,
} from "@ui-sdk/react/toast";
import { cn } from "cn";
import type { ReactNode } from "react";

import {
  toastActionClassName,
  toastClassName,
  toastCloseClassName,
  toastDescriptionClassName,
  toastRegionClassName,
  toastTitleClassName,
} from "@registry/shared/calendar-ui/toast.styles";

/** A toast to show, in Base UI's terms. */
export interface ToastOptions {
  /** Reuses a toast: one with this id still on screen is updated in place. */
  readonly id?: string;
  readonly title: string;
  /** Read after the title, as more detail. */
  readonly description?: string;
  /** How long it stays, in milliseconds; `0` keeps it until it's dismissed. */
  readonly timeout?: number;
  /** A button that does something, such as Undo. Pressing it leaves the toast open. */
  readonly actionProps?: {
    readonly children: string;
    /** `input` says whether a key or a pointer pressed it. */
    readonly onClick: (details: { readonly input: "keyboard" | "pointer" }) => void;
  };
  /** Runs once it has closed. */
  readonly onRemove?: () => void;
}

/** Adds and closes the toasts a `ToastViewport` shows, like Base UI's `Toast.createToastManager()`. */
export interface ToastManager {
  /** Shows a toast, or updates the one with its `id`, and returns its id. */
  add(toast: ToastOptions): string;
  close(id: string): void;
}

const toasters = new WeakMap<ToastManager, Toaster<string>>();

function createToastManager(): ToastManager {
  const toaster = createToaster<string>();
  const manager: ToastManager = {
    add: ({ actionProps, description, id, onRemove, timeout, title }) =>
      toaster({
        // Always given: updating a toast merges into it, and one without an action mustn't keep
        // the last one's.
        action:
          actionProps === undefined
            ? undefined
            : {
                dismiss: false,
                label: actionProps.children,
                onAction: (_event, { source }) =>
                  actionProps.onClick({
                    input:
                      source === "mouse" || source === "pen" || source === "touch"
                        ? "pointer"
                        : "keyboard",
                  }),
              },
        description,
        duration: timeout === undefined || timeout > 0 ? timeout : Infinity,
        id,
        onDismiss: onRemove,
        title,
      }),
    close: (id) => toaster.dismiss(id),
  };
  toasters.set(manager, toaster);
  return manager;
}

export interface ToastViewportProps {
  /** The region's name, read as a screen reader moves into it. */
  readonly "aria-label": string;
  /** One toast's parts, rendered for each toast. */
  readonly children?: ReactNode;
  readonly className?: string;
  readonly manager: ToastManager;
}

/**
 * Where toasts show: one at a time, at the bottom of the screen, in the browser's top layer. F6
 * moves focus into it and back. Each toast is read out as it shows: its title, then its
 * description.
 */
function ToastViewport({ children, className, manager, ...props }: ToastViewportProps) {
  return (
    <ToastRegion
      align="center"
      className={cn(toastRegionClassName, className)}
      maxVisible={1}
      side="bottom"
      toaster={toasters.get(manager)}
      {...props}
    >
      {() => children}
    </ToastRegion>
  );
}

export interface ToastPartProps {
  readonly children?: ReactNode;
  readonly className?: string;
}

/** One toast. Escape dismisses it while it has focus. */
function Toast({ className, ...props }: ToastPartProps) {
  return <ToastPart className={cn(toastClassName, className)} {...props} />;
}

/** The toast's `title`. */
function ToastTitle({ className }: { readonly className?: string }) {
  return <ToastTitlePart className={cn(toastTitleClassName, className)} />;
}

/** The toast's `description`, if it has one. */
function ToastDescription({ className }: { readonly className?: string }) {
  return <ToastDescriptionPart className={cn(toastDescriptionClassName, className)} />;
}

/** The toast's action button, if it has one. */
function ToastAction({ className }: { readonly className?: string }) {
  return <ToastActionPart className={cn(toastActionClassName, className)} />;
}

export interface ToastCloseProps extends ToastPartProps {
  /** The button's name, when it shows an icon alone. */
  readonly "aria-label"?: string;
}

/** Dismisses the toast. */
function ToastClose({ className, ...props }: ToastCloseProps) {
  return <ToastClosePart className={cn(toastCloseClassName, className)} {...props} />;
}

export {
  createToastManager,
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastTitle,
  ToastViewport,
};
