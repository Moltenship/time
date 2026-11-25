import type { JSX } from "@solidjs/web";
import {
  Toast as ToastPart,
  ToastAction as ToastActionPart,
  ToastClose as ToastClosePart,
  ToastDescription as ToastDescriptionPart,
  ToastRegion,
  ToastTitle as ToastTitlePart,
} from "@ui-sdk/solid/toast";
import { omit } from "solid-js";

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
  toastRegionDefaults,
  toastTitleClassName,
} from "@registry/shared/calendar-ui/toast.styles";
import { cn } from "cn";

export type { ToastManager, ToastOptions };

export interface ToastViewportProps {
  /** The region's name, read as a screen reader moves into it. */
  readonly "aria-label": string;
  /** One toast's parts, rendered for each toast. */
  readonly children?: JSX.Element;
  readonly class?: string;
  readonly manager: ToastManager;
}

/**
 * Where toasts show: one at a time, at the bottom of the screen, in the browser's top layer. F6
 * moves focus into it and back. Each toast is read out as it shows: its title, then its
 * description.
 */
function ToastViewport(props: ToastViewportProps) {
  const rest = omit(props, "children", "class", "manager");
  return (
    <ToastRegion
      {...toastRegionDefaults}
      class={cn(toastRegionClassName, props.class)}
      toaster={toasterOf(props.manager)}
      {...rest}
    >
      {/* Read once per toast, so each toast gets parts of its own. */}
      {() => props.children}
    </ToastRegion>
  );
}

export interface ToastPartProps {
  readonly children?: JSX.Element;
  readonly class?: string;
}

/** One toast. Escape dismisses it while it has focus. */
function Toast(props: ToastPartProps) {
  return <ToastPart class={cn(toastClassName, props.class)}>{props.children}</ToastPart>;
}

/** The toast's `title`. */
function ToastTitle(props: { readonly class?: string }) {
  return <ToastTitlePart class={cn(toastTitleClassName, props.class)} />;
}

/** The toast's `description`, if it has one. */
function ToastDescription(props: { readonly class?: string }) {
  return <ToastDescriptionPart class={cn(toastDescriptionClassName, props.class)} />;
}

/** The toast's action button, if it has one. */
function ToastAction(props: { readonly class?: string }) {
  return <ToastActionPart class={cn(toastActionClassName, props.class)} />;
}

export interface ToastCloseProps extends ToastPartProps {
  /** The button's name, when it shows an icon alone. */
  readonly "aria-label"?: string;
}

/** Dismisses the toast. */
function ToastClose(props: ToastCloseProps) {
  const rest = omit(props, "class");
  return <ToastClosePart class={cn(toastCloseClassName, props.class)} {...rest} />;
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
