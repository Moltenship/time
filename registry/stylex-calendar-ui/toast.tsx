"use client";

import {
  Toast as ToastPart,
  ToastAction as ToastActionPart,
  ToastClose as ToastClosePart,
  ToastDescription as ToastDescriptionPart,
  ToastRegion,
  ToastTitle as ToastTitlePart,
} from "@ui-sdk/react/toast";
import type { ReactNode } from "react";

import {
  createToastManager,
  toasterOf,
  type ToastManager,
  type ToastOptions,
} from "@registry/shared/calendar-ui/toast-manager";
import { toastStyles } from "@registry/shared/stylex-calendar-ui/toast.styles";
import { type XStyle, xprops } from "@registry/stylex-calendar-theme/xprops";

export interface ToastViewportProps {
  /** The region's name, read as a screen reader moves into it. */
  readonly "aria-label": string;
  /** One toast's parts, rendered for each toast. */
  readonly children?: ReactNode;
  readonly className?: string;
  readonly manager: ToastManager;
  /** Styles after the region's own, such as where it sits. */
  readonly xstyle?: XStyle;
}

/**
 * Where toasts show: one at a time, at the bottom of the screen, in the browser's top layer. F6
 * moves focus into it and back. Each toast is read out as it shows: its title, then its
 * description.
 */
function ToastViewport({ children, className, manager, xstyle, ...props }: ToastViewportProps) {
  return (
    <ToastRegion
      align="center"
      maxVisible={1}
      side="bottom"
      toaster={toasterOf(manager)}
      {...props}
      {...xprops({ className }, toastStyles.region, xstyle)}
    >
      {() => children}
    </ToastRegion>
  );
}

export interface ToastPartProps {
  readonly children?: ReactNode;
  readonly className?: string;
  /** Styles after the part's own. */
  readonly xstyle?: XStyle;
}

/** What a part that renders the toast's own text takes. */
interface ToastTextProps {
  readonly className?: string;
  readonly xstyle?: XStyle;
}

/** One toast. Escape dismisses it while it has focus. */
function Toast({ className, xstyle, ...props }: ToastPartProps) {
  return <ToastPart {...props} {...xprops({ className }, toastStyles.toast, xstyle)} />;
}

/** The toast's `title`. */
function ToastTitle({ className, xstyle }: ToastTextProps) {
  return <ToastTitlePart {...xprops({ className }, toastStyles.title, xstyle)} />;
}

/** The toast's `description`, if it has one. */
function ToastDescription({ className, xstyle }: ToastTextProps) {
  return <ToastDescriptionPart {...xprops({ className }, toastStyles.description, xstyle)} />;
}

/** The toast's action button, if it has one. */
function ToastAction({ className, xstyle }: ToastTextProps) {
  return <ToastActionPart {...xprops({ className }, toastStyles.action, xstyle)} />;
}

export interface ToastCloseProps extends ToastPartProps {
  /** The button's name, when it shows an icon alone. */
  readonly "aria-label"?: string;
}

/** Dismisses the toast. */
function ToastClose({ className, xstyle, ...props }: ToastCloseProps) {
  return <ToastClosePart {...props} {...xprops({ className }, toastStyles.close, xstyle)} />;
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
