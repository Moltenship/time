"use client";

import {
  Popover as PopoverRoot,
  PopoverClose as PopoverClosePart,
  PopoverContent as PopoverContentPart,
  PopoverTitle as PopoverTitlePart,
  PopoverTrigger as PopoverTriggerPart,
} from "@ui-sdk/react/popover";
import {
  useState,
  type CSSProperties,
  type MouseEventHandler,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";

import {
  createPopoverHandle,
  popoverControllerOf,
  popupSide,
  type PopoverHandle,
  type PopupSide,
} from "@registry/shared/calendar-ui/popover-handle";
import { popoverDefaults, popoverStyles } from "@registry/shared/stylex-calendar-ui/popover.styles";
import { type XStyle, xprops } from "@registry/stylex-calendar-theme/xprops";

export interface PopoverProps<Payload> {
  /** The trigger and content, or a function of the payload the open trigger passed. */
  readonly children?: ReactNode | ((state: { readonly payload: Payload | undefined }) => ReactNode);
  /** Connects triggers outside the popover, each with its own payload. */
  readonly handle?: PopoverHandle<Payload>;
  /** `"trap-focus"` keeps Tab inside the popover, and the rest of the page usable. */
  readonly modal?: boolean | "trap-focus";
  /** Runs as the popover opens or closes, before focus moves. */
  readonly onOpenChange?: (open: boolean) => void;
}

function Popover<Payload = unknown>({
  children,
  handle,
  modal,
  onOpenChange,
}: PopoverProps<Payload>) {
  const controller = popoverControllerOf(handle);
  const [payload, setPayload] = useState(() => controller?.getPayload() as Payload | undefined);
  return (
    <PopoverRoot
      controller={controller}
      modal={modal}
      onOpenChange={onOpenChange}
      onPayloadChange={(next) => setPayload(next as Payload)}
    >
      {typeof children === "function" ? children({ payload }) : children}
    </PopoverRoot>
  );
}

export interface PopoverTriggerProps<Payload> {
  readonly "aria-label"?: string;
  readonly children?: ReactNode;
  readonly className?: string;
  /** The popover this trigger opens, when it renders outside it. */
  readonly handle?: PopoverHandle<Payload>;
  readonly id?: string;
  readonly onMouseDown?: MouseEventHandler<HTMLElement>;
  /** What the popover's content gets when this trigger opens it. */
  readonly payload?: Payload;
  /** The element that opens the popover, in place of a plain `<button>`. */
  readonly render?: ReactElement;
  readonly style?: CSSProperties;
  readonly tabIndex?: number;
  /** Styles for the trigger's own element, when it has no `render`. */
  readonly xstyle?: XStyle;
}

/** A `render` element's own `data-slot`, which ui-sdk would replace with the trigger's. */
const ownSlot = (render: ReactElement | undefined) =>
  (render?.props as { readonly "data-slot"?: string } | undefined)?.["data-slot"];

/**
 * Marks the trigger `aria-expanded` while its popover is open, for `aria-expanded:` styles. A
 * `render` element keeps its own `data-slot`.
 */
function PopoverTrigger<Payload = unknown>({
  className,
  handle,
  style,
  xstyle,
  ...props
}: PopoverTriggerProps<Payload>) {
  return (
    <PopoverTriggerPart
      controller={popoverControllerOf(handle)}
      data-slot={ownSlot(props.render)}
      {...props}
      {...xprops({ className, style }, xstyle)}
    />
  );
}

export interface PopoverContentProps {
  readonly align?: "center" | "end" | "start";
  /** Names the popover when it has no `PopoverTitle`. */
  readonly "aria-label"?: string;
  readonly children?: ReactNode;
  readonly className?: string;
  /**
   * Where focus goes when the popover closes with focus inside it: by default, back to the trigger.
   * `false` leaves it where it is. A click outside always leaves it there.
   */
  readonly finalFocus?: false | (() => HTMLElement | null);
  /** Where focus goes when the popover opens: by default, its first focusable element. */
  readonly initialFocus?: RefObject<HTMLElement | null>;
  readonly ref?: Ref<HTMLDivElement>;
  /** `inline-start` and `inline-end` follow the writing direction. */
  readonly side?: PopupSide;
  readonly sideOffset?: number;
  /** Styles after the panel's own. */
  readonly xstyle?: XStyle;
}

/** The panel, in the browser's top layer, beside its trigger. */
function PopoverContent({
  "aria-label": label,
  className,
  finalFocus,
  initialFocus,
  side,
  sideOffset = popoverDefaults.sideOffset,
  xstyle,
  ...props
}: PopoverContentProps) {
  return (
    <PopoverContentPart
      // An `aria-label` names it, not the trigger ui-sdk would point to.
      aria-label={label}
      aria-labelledby={label === undefined ? undefined : ""}
      finalFocus={finalFocus === false ? "none" : finalFocus}
      initialFocus={initialFocus === undefined ? undefined : () => initialFocus.current}
      side={popupSide(side)}
      sideOffset={sideOffset}
      {...props}
      {...xprops({ className }, popoverStyles.content, xstyle)}
    />
  );
}

export interface PopoverTitleProps {
  readonly children?: ReactNode;
  readonly className?: string;
  /** Styles after the title's own. */
  readonly xstyle?: XStyle;
}

/** Names the popover. */
function PopoverTitle({ className, xstyle, ...props }: PopoverTitleProps) {
  return <PopoverTitlePart {...props} {...xprops({ className }, popoverStyles.title, xstyle)} />;
}

export interface PopoverCloseProps {
  readonly children?: ReactNode;
  readonly className?: string;
  /** The element that closes the popover, such as a `Button`, in place of a plain `<button>`. */
  readonly render?: ReactElement;
}

function PopoverClose(props: PopoverCloseProps) {
  return <PopoverClosePart {...props} />;
}

export type { PopoverHandle };
export { createPopoverHandle, Popover, PopoverClose, PopoverContent, PopoverTitle, PopoverTrigger };
