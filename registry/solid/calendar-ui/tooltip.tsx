import type { JSX } from "@solidjs/web";
import type { RenderProp } from "@ui-sdk/solid/primitive";
import {
  createTooltipController,
  Tooltip as TooltipRoot,
  TooltipArrow,
  TooltipContent as TooltipContentPart,
  TooltipTrigger as TooltipTriggerPart,
  type TooltipController,
} from "@ui-sdk/solid/tooltip";
import { createContext, createMemo, createSignal, omit, untrack, useContext } from "solid-js";

import {
  tooltipArrowClassName,
  tooltipContentClassName,
  tooltipDefaults,
} from "@registry/shared/calendar-ui/tooltip.styles";
import { cn } from "cn";

/**
 * One tooltip that many triggers show, each with its own `payload`, like Base UI's
 * `Tooltip.createHandle()`: hundreds of triggers share one root.
 */
export interface TooltipHandle<Payload> {
  close(): void;
  /** The `payload` of the trigger that showed it last. */
  getPayload(): Payload | undefined;
}

interface HandleState {
  readonly controller: TooltipController<unknown>;
  /** The trigger under the pointer and the pointer's height, for `trackCursorAxis`. */
  readonly pointer: { element: Element | null; y: number };
}

const handles = new WeakMap<TooltipHandle<unknown>, HandleState>();

function createTooltipHandle<Payload>(): TooltipHandle<Payload> {
  const controller = createTooltipController<Payload>();
  const handle: TooltipHandle<Payload> = {
    close: () => void controller.close(),
    getPayload: () => controller.getPayload(),
  };
  handles.set(handle, {
    controller: controller as TooltipController<unknown>,
    pointer: { element: null, y: 0 },
  });
  return handle;
}

interface TooltipContextValue {
  readonly state: HandleState | undefined;
  readonly trackCursorAxis: "y" | undefined;
}

const TooltipContext = createContext<TooltipContextValue>({
  state: undefined,
  trackCursorAxis: undefined,
});

export interface TooltipOpenChangeDetails<Payload> {
  readonly cancel: () => void;
  readonly payload: Payload | undefined;
}

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
  readonly onOpenChange?: (open: boolean, details: TooltipOpenChangeDetails<Payload>) => void;
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
  const state = untrack(() => (props.handle === undefined ? undefined : handles.get(props.handle)));
  // Boxed, as a payload may be a function, which a signal would call.
  const [shown, setShown] = createSignal(
    { payload: state?.controller.getPayload() as Payload | undefined },
    { ownedWrite: true },
  );
  // ui-sdk reports a trigger's payload before it opens, and a takeover by its payload alone.
  const latest = { open: false, payload: untrack(shown).payload };
  const change = (open: boolean, next: Payload | undefined, cancel: () => void) => {
    let cancelled = false;
    props.onOpenChange?.(open, {
      cancel: () => {
        cancelled = true;
        cancel();
      },
      payload: next,
    });
    return !cancelled;
  };
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
        onOpenChange={(open, details) => {
          if (change(open, latest.payload, details.cancel)) latest.open = open;
        }}
        onPayloadChange={(next, details) => {
          if (latest.open && !change(true, next as Payload, details.cancel)) return;
          latest.payload = next as Payload;
          setShown({ payload: next as Payload });
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
  const state = own === undefined ? context.state : handles.get(own);
  // A popover trigger that renders this one hands its own handlers down with the rest.
  const handlers = props as TooltipTriggerProps<Payload> & {
    readonly onPointerEnter?: PointerHandler;
    readonly onPointerMove?: PointerHandler;
  };
  const track = (key: "onPointerEnter" | "onPointerMove") => (event: PointerEvent) => {
    callHandler(handlers[key], event);
    if (state === undefined) return;
    state.pointer.element = event.currentTarget as Element;
    state.pointer.y = event.clientY;
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
  readonly side?: "bottom" | "inline-end" | "inline-start" | "left" | "right" | "top";
  readonly sideOffset?: number;
}

/** The hint, in the browser's top layer, with an arrow towards its trigger. */
function TooltipContent(props: TooltipContentProps) {
  const context = useContext(TooltipContext);
  const anchor = createMemo(() => {
    const { state } = context;
    if (context.trackCursorAxis !== "y" || state === undefined) return undefined;
    const { pointer } = state;
    return {
      getBoundingClientRect: () => {
        const box = pointer.element?.getBoundingClientRect();
        return { height: 0, width: box?.width ?? 0, x: box?.x ?? 0, y: pointer.y };
      },
    };
  });
  const side = () =>
    props.side === "inline-end" ? "end" : props.side === "inline-start" ? "start" : props.side;
  const rest = omit(props, "children", "class", "side", "sideOffset");
  return (
    <TooltipContentPart
      anchor={anchor()}
      class={cn(tooltipContentClassName, props.class)}
      side={side()}
      sideOffset={props.sideOffset ?? tooltipDefaults.sideOffset}
      {...rest}
    >
      {props.children}
      <TooltipArrow class={tooltipArrowClassName} />
    </TooltipContentPart>
  );
}

export { createTooltipHandle, Tooltip, TooltipContent, TooltipTrigger };
