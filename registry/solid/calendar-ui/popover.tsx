import type { JSX } from "@solidjs/web";
import type { RenderProp } from "@ui-sdk/solid/primitive";
import {
  Popover as PopoverRoot,
  PopoverClose as PopoverClosePart,
  PopoverContent as PopoverContentPart,
  PopoverTitle as PopoverTitlePart,
  PopoverTrigger as PopoverTriggerPart,
} from "@ui-sdk/solid/popover";
import { createSignal, omit, untrack } from "solid-js";

import {
  createPopoverHandle,
  popoverControllerOf,
  type PopoverHandle,
} from "@registry/shared/calendar-ui/popover-handle";
import { popupSide, type PopupSide } from "@registry/shared/calendar-ui/popup-side";
import {
  popoverContentClassName,
  popoverDefaults,
  popoverTitleClassName,
} from "@registry/shared/calendar-ui/popover.styles";
import { cn } from "cn";

export interface PopoverProps<Payload> {
  /** The trigger and content, or a function of the payload the open trigger passed. */
  readonly children?:
    | JSX.Element
    | ((state: { readonly payload: Payload | undefined }) => JSX.Element);
  /** Connects triggers outside the popover, each with its own payload. Read once. */
  readonly handle?: PopoverHandle<Payload>;
  /** `"trap-focus"` keeps Tab inside the popover, and the rest of the page usable. */
  readonly modal?: boolean | "trap-focus";
  /** Runs as the popover opens or closes, before focus moves. */
  readonly onOpenChange?: (open: boolean) => void;
}

function Popover<Payload = unknown>(props: PopoverProps<Payload>) {
  const controller = untrack(() => popoverControllerOf(props.handle));
  // Boxed, as a payload may be a function, which a signal would call.
  const [shown, setShown] = createSignal(
    { payload: controller?.getPayload() as Payload | undefined },
    { ownedWrite: true },
  );
  const content = () => {
    const children = props.children;
    // A function of the payload takes an argument; a child component's own result takes none.
    return typeof children === "function" && children.length > 0
      ? children({
          get payload() {
            return shown().payload;
          },
        })
      : (children as JSX.Element);
  };
  return (
    <PopoverRoot
      controller={controller}
      modal={props.modal}
      onOpenChange={(open) => props.onOpenChange?.(open)}
      onPayloadChange={(next) => setShown({ payload: next as Payload })}
    >
      {content()}
    </PopoverRoot>
  );
}

export interface PopoverTriggerProps<Payload> {
  readonly "aria-label"?: string;
  readonly children?: JSX.Element;
  readonly class?: string;
  /** The popover this trigger opens, when it renders outside it. Read once. */
  readonly handle?: PopoverHandle<Payload>;
  readonly id?: string;
  readonly onMouseDown?: (event: MouseEvent) => void;
  /** What the popover's content gets when this trigger opens it. */
  readonly payload?: Payload;
  /**
   * The element that opens the popover, in place of a plain `<button>`: a function of the props
   * to spread on it.
   */
  readonly render?: RenderProp;
  readonly style?: JSX.CSSProperties | string;
  readonly tabIndex?: number;
}

/**
 * Marks the trigger `aria-expanded` while its popover is open, for `aria-expanded:` styles. A
 * `render` element keeps its own `data-slot`.
 */
function PopoverTrigger<Payload = unknown>(props: PopoverTriggerProps<Payload>) {
  const controller = untrack(() => popoverControllerOf(props.handle));
  const rest = omit(props, "handle", "onMouseDown", "render", "tabIndex");
  return (
    <PopoverTriggerPart
      controller={controller}
      onMouseDown={(event: MouseEvent) => props.onMouseDown?.(event)}
      render={
        props.render === undefined
          ? undefined
          : (part, state) => {
              const render = props.render!;
              // ui-sdk names the part `popover-trigger`; the element keeps the slot it gives.
              const element = render(omit(part, "data-slot"), state);
              return element;
            }
      }
      tabindex={props.tabIndex}
      {...rest}
    />
  );
}

export interface PopoverContentProps {
  readonly align?: "center" | "end" | "start";
  /** Names the popover when it has no `PopoverTitle`. */
  readonly "aria-label"?: string;
  readonly children?: JSX.Element;
  readonly class?: string;
  /**
   * Where focus goes when the popover closes with focus inside it: by default, back to the trigger.
   * `false` leaves it where it is. A click outside always leaves it there.
   */
  readonly finalFocus?: false | (() => HTMLElement | null);
  /** Where focus goes when the popover opens: by default, its first focusable element. */
  readonly initialFocus?: () => HTMLElement | null | undefined;
  readonly ref?: (element: HTMLDivElement) => void;
  /** `inline-start` and `inline-end` follow the writing direction. */
  readonly side?: PopupSide;
  readonly sideOffset?: number;
}

/** The panel, in the browser's top layer, beside its trigger. */
function PopoverContent(props: PopoverContentProps) {
  const initialFocus = () => {
    const target = props.initialFocus;
    return target === undefined ? undefined : () => target() ?? null;
  };
  const rest = omit(
    props,
    "aria-label",
    "children",
    "class",
    "finalFocus",
    "initialFocus",
    "side",
    "sideOffset",
  );
  return (
    <PopoverContentPart
      // An `aria-label` names it, not the trigger ui-sdk would point to.
      aria-label={props["aria-label"]}
      aria-labelledby={props["aria-label"] === undefined ? undefined : ""}
      class={cn(popoverContentClassName, props.class)}
      finalFocus={props.finalFocus === false ? "none" : props.finalFocus}
      initialFocus={initialFocus()}
      side={popupSide(props.side)}
      sideOffset={props.sideOffset ?? popoverDefaults.sideOffset}
      {...rest}
    >
      {props.children}
    </PopoverContentPart>
  );
}

export interface PopoverTitleProps {
  readonly children?: JSX.Element;
  readonly class?: string;
}

/** Names the popover. */
function PopoverTitle(props: PopoverTitleProps) {
  const rest = omit(props, "class");
  return <PopoverTitlePart class={cn(popoverTitleClassName, props.class)} {...rest} />;
}

export interface PopoverCloseProps {
  readonly children?: JSX.Element;
  readonly class?: string;
  /**
   * The element that closes the popover, such as a `Button`, in place of a plain `<button>`: a
   * function of the props to spread on it.
   */
  readonly render?: RenderProp;
}

function PopoverClose(props: PopoverCloseProps) {
  return <PopoverClosePart {...props} />;
}

export type { PopoverHandle };
export { createPopoverHandle, Popover, PopoverClose, PopoverContent, PopoverTitle, PopoverTrigger };
