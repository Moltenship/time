"use client";

import {
  Toast as ToastPart,
  ToastAction as ToastActionPart,
  ToastClose as ToastClosePart,
  ToastDescription as ToastDescriptionPart,
  ToastRegion,
  ToastTitle as ToastTitlePart,
} from "@ui-sdk/react/toast";
import { cn } from "cn";
import type { ReactNode } from "react";

import {
  createToastManager,
  toasterOf,
  type ToastManager,
  type ToastOptions,
} from "@registry/shared/calendar-ui/toast-manager";
import {
  toastActionClassName,
  toastClassName,
  toastCloseClassName,
  toastDescriptionClassName,
  toastRegionClassName,
  toastTitleClassName,
} from "@registry/shared/calendar-ui/toast.styles";

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
      toaster={toasterOf(manager)}
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

export type { ToastManager, ToastOptions };
export {
  createToastManager,
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastTitle,
  ToastViewport,
};
