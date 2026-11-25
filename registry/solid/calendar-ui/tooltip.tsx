import type { JSX } from "@solidjs/web";
import type { RenderProp } from "@ui-sdk/solid/primitive";
import {
  Tooltip as TooltipRoot,
  TooltipArrow,
  TooltipContent as TooltipContentPart,
  TooltipTrigger as TooltipTriggerPart,
} from "@ui-sdk/solid/tooltip";
import { createContext, createMemo, createSignal, omit, untrack, useContext } from "solid-js";

import { popupSide, type PopupSide } from "@registry/shared/calendar-ui/popup-side";
import {
  createTooltipHandle,
  cursorAnchor,
  reportTooltipOpen,
  reportTooltipPayload,
  tooltipStateOf,
  trackTooltipPointer,
  type TooltipHandle,
  type TooltipHandleState,
  type TooltipOpenChangeDetails,
  type TooltipOpenChangeHandler,
  type TooltipTracking,
} from "@registry/shared/calendar-ui/tooltip-handle";
import {
  tooltipArrowClassName,
  tooltipContentClassName,
  tooltipDefaults,
} from "@registry/shared/calendar-ui/tooltip.styles";
import { cn } from "cn";

interface TooltipContextValue {
  readonly state: TooltipHandleState | undefined;
  readonly trackCursorAxis: "y" | undefined;
}

const TooltipContext = createContext<TooltipContextValue>({
  state: undefined,
  trackCursorAxis: undefined,
});

export interface TooltipProps<Payload> {
  /** The trigger and content, or a function of the payload the trigger under the pointer passed. */
  readonly children?:
    | JSX.Element
    | ((state: { readonly payload: Payload | undefined }) => JSX.Element);
  /** How long, in milliseconds, the pointer rests on the trigger before the tooltip opens. */
  readonly delay?: number;
  /** Keeps the tooltip closed. */
  readonly disabled?: boolean;
  /** Connects triggers outside the tooltip, each with its own payload. Read once. */
  readonly handle?: TooltipHandle<Payload>;
  /**
   * Runs as the tooltip opens or closes, and as another trigger takes the open tooltip over.
   * `details.payload` is the payload of the trigger it opens from; `details.cancel()` keeps the
   * tooltip as it is.
   */
  readonly onOpenChange?: TooltipOpenChangeHandler<Payload>;
  /** Follows the pointer up and down its trigger, rather than centring on it. */
  readonly trackCursorAxis?: "y";
  /**
   * `label`, the default, makes its text the trigger's name, as an icon button's tooltip does;
   * `description` adds its text to the trigger's name.
   */
  readonly type?: "description" | "label";
}

/**
 * A tooltip: a screen reader reads its text once, as the trigger's name or, with `type`, as its
 * description. Tooltips group on their own: once one is open, the next opens at once.
 */
function Tooltip<Payload = unknown>(props: TooltipProps<Payload>) {
  const state = untrack(() => tooltipStateOf(props.handle));
  // Boxed, as a payload may be a function, which a signal would call.
  const [shown, setShown] = createSignal(
    { payload: state?.controller.getPayload() as Payload | undefined },
    { ownedWrite: true },
  );
  // ui-sdk reports a trigger's payload before it opens, and a takeover by its payload alone.
  const tracking: TooltipTracking<Payload> = { open: false, payload: untrack(shown).payload };
  const context: TooltipContextValue = {
    state,
    get trackCursorAxis() {
      return props.trackCursorAxis;
    },
  };
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
    <TooltipContext value={context}>
      <TooltipRoot
        controller={state?.controller}
        delay={props.delay ?? tooltipDefaults.delay}
        disabled={props.disabled}
        onOpenChange={(open, details) =>
          reportTooltipOpen(tracking, props.onOpenChange, open, details)
        }
        onPayloadChange={(next, details) => {
          if (reportTooltipPayload(tracking, props.onOpenChange, next as Payload, details)) {
            setShown({ payload: next as Payload });
          }
        }}
        type={props.type ?? "label"}
      >
        {content()}
      </TooltipRoot>
    </TooltipContext>
  );
}

export interface TooltipTriggerProps<Payload> {
  readonly children?: JSX.Element;
  readonly class?: string;
  /** The tooltip this trigger shows, when it renders outside it. Read once. */
  readonly handle?: TooltipHandle<Payload>;
  /** What the tooltip's content gets when this trigger shows it. */
  readonly payload?: Payload;
  /**
   * The element that shows the tooltip, such as a `Button`, in place of a plain `<button>`: a
   * function of the props to spread on it.
   */
  readonly render?: RenderProp;
}

type PointerHandler = JSX.EventHandlerUnion<HTMLElement, PointerEvent>;

/** Calls a handler as Solid would: a function, or a bound `[handler, data]` pair. */
function callHandler(handler: PointerHandler | undefined, event: PointerEvent) {
  if (typeof handler === "function") (handler as (event: PointerEvent) => void)(event);
  else if (Array.isArray(handler))
    (handler[0] as (data: unknown, event: PointerEvent) => void)(handler[1], event);
}

function TooltipTrigger<Payload = unknown>(props: TooltipTriggerProps<Payload>) {
  const context = useContext(TooltipContext);
  const own = untrack(() => props.handle);
  const state = own === undefined ? context.state : tooltipStateOf(own);
  // A popover trigger that renders this one hands its own handlers down with the rest.
  const handlers = props as TooltipTriggerProps<Payload> & {
    readonly onPointerEnter?: PointerHandler;
    readonly onPointerMove?: PointerHandler;
  };
  const track = (key: "onPointerEnter" | "onPointerMove") => (event: PointerEvent) => {
    callHandler(handlers[key], event);
    trackTooltipPointer(state, event.currentTarget as Element, event.clientY);
  };
  const rest = omit(handlers, "handle", "onPointerEnter", "onPointerMove");
  return (
    <TooltipTriggerPart
      controller={own === undefined ? undefined : state?.controller}
      onPointerEnter={track("onPointerEnter")}
      onPointerMove={track("onPointerMove")}
      {...rest}
    />
  );
}

export interface TooltipContentProps {
  readonly align?: "center" | "end" | "start";
  /** What a `label` tooltip names its trigger, when that's more than the text it shows. */
  readonly "aria-label"?: string;
  readonly children?: JSX.Element;
  readonly class?: string;
  /** `inline-start` and `inline-end` follow the writing direction. */
  readonly side?: PopupSide;
  readonly sideOffset?: number;
}

/** The hint, in the browser's top layer, with an arrow towards its trigger. */
function TooltipContent(props: TooltipContentProps) {
  const context = useContext(TooltipContext);
  const anchor = createMemo(() => {
    const { state } = context;
    return context.trackCursorAxis !== "y" || state === undefined ? undefined : cursorAnchor(state);
  });
  const rest = omit(props, "children", "class", "side", "sideOffset");
  return (
    <TooltipContentPart
      anchor={anchor()}
      class={cn(tooltipContentClassName, props.class)}
      side={popupSide(props.side)}
      sideOffset={props.sideOffset ?? tooltipDefaults.sideOffset}
      {...rest}
    >
      {props.children}
      <TooltipArrow class={tooltipArrowClassName} />
    </TooltipContentPart>
  );
}

export type { TooltipHandle, TooltipOpenChangeDetails };
export { createTooltipHandle, Tooltip, TooltipContent, TooltipTrigger };
