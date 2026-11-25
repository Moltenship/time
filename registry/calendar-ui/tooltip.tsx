"use client";

import {
  createTooltipController,
  Tooltip as TooltipRoot,
  TooltipArrow,
  TooltipContent as TooltipContentPart,
  TooltipTrigger as TooltipTriggerPart,
  type TooltipController,
} from "@ui-sdk/react/tooltip";
import { cn } from "cn";
import {
  createContext,
  use,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from "react";

import {
  tooltipArrowClassName,
  tooltipContentClassName,
  tooltipDefaults,
} from "@registry/shared/calendar-ui/tooltip.styles";

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
  readonly children?: ReactNode | ((state: { readonly payload: Payload | undefined }) => ReactNode);
  /** How long, in milliseconds, the pointer rests on the trigger before the tooltip opens. */
  readonly delay?: number;
  /** Keeps the tooltip closed. */
  readonly disabled?: boolean;
  /** Connects triggers outside the tooltip, each with its own payload. */
  readonly handle?: TooltipHandle<Payload>;
  /**
   * Runs as the tooltip opens or closes, and as another trigger takes the open tooltip over.
   * `details.payload` is the payload of the trigger it opens from; `details.cancel()` keeps the
   * tooltip as it is.
   */
  readonly onOpenChange?: (open: boolean, details: TooltipOpenChangeDetails<Payload>) => void;
  readonly open?: boolean;
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
function Tooltip<Payload = unknown>({
  children,
  delay = tooltipDefaults.delay,
  handle,
  onOpenChange,
  trackCursorAxis,
  type = "label",
  ...props
}: TooltipProps<Payload>) {
  const state = handle === undefined ? undefined : handles.get(handle);
  const [payload, setPayload] = useState(
    () => state?.controller.getPayload() as Payload | undefined,
  );
  // ui-sdk reports a trigger's payload before it opens, and a takeover by its payload alone.
  const latest = useRef({ open: false, payload });
  const change = (open: boolean, next: Payload | undefined, cancel: () => void) => {
    let cancelled = false;
    onOpenChange?.(open, {
      cancel: () => {
        cancelled = true;
        cancel();
      },
      payload: next,
    });
    return !cancelled;
  };
  const context = useMemo(() => ({ state, trackCursorAxis }), [state, trackCursorAxis]);
  return (
    <TooltipContext value={context}>
      <TooltipRoot
        controller={state?.controller}
        delay={delay}
        onOpenChange={(open, details) => {
          if (change(open, latest.current.payload, details.cancel)) latest.current.open = open;
        }}
        onPayloadChange={(next, details) => {
          if (latest.current.open && !change(true, next as Payload, details.cancel)) return;
          latest.current.payload = next as Payload;
          setPayload(next as Payload);
        }}
        type={type}
        {...props}
      >
        {typeof children === "function" ? children({ payload }) : children}
      </TooltipRoot>
    </TooltipContext>
  );
}

export interface TooltipTriggerProps<Payload> {
  readonly children?: ReactNode;
  readonly className?: string;
  /** The tooltip this trigger shows, when it renders outside it. */
  readonly handle?: TooltipHandle<Payload>;
  /** What the tooltip's content gets when this trigger shows it. */
  readonly payload?: Payload;
  /** The element that shows the tooltip, such as a `Button`, in place of a plain `<button>`. */
  readonly render?: ReactElement;
}

type PointerHandler = (event: PointerEvent<HTMLElement>) => void;

/** A `render` element's own `data-slot`, which ui-sdk would replace with the trigger's. */
const ownSlot = (render: ReactElement | undefined) =>
  (render?.props as { readonly "data-slot"?: string } | undefined)?.["data-slot"];

/** A `render` element keeps its own `data-slot`. */
function TooltipTrigger<Payload = unknown>({ handle, ...props }: TooltipTriggerProps<Payload>) {
  const context = use(TooltipContext);
  const state = handle === undefined ? context.state : handles.get(handle);
  // A popover trigger that renders this one hands its own handlers down with the rest.
  const { onPointerEnter, onPointerMove, ...rest } = props as TooltipTriggerProps<Payload> & {
    readonly "data-slot"?: string;
    readonly onPointerEnter?: PointerHandler;
    readonly onPointerMove?: PointerHandler;
  };
  const track = (handler: PointerHandler | undefined) => (event: PointerEvent<HTMLElement>) => {
    handler?.(event);
    if (state === undefined) return;
    state.pointer.element = event.currentTarget;
    state.pointer.y = event.clientY;
  };
  return (
    <TooltipTriggerPart
      controller={handle === undefined ? undefined : state?.controller}
      onPointerEnter={track(onPointerEnter)}
      onPointerMove={track(onPointerMove)}
      {...rest}
      data-slot={ownSlot(rest.render) ?? rest["data-slot"]}
    />
  );
}

export interface TooltipContentProps {
  readonly align?: "center" | "end" | "start";
  /** What a `label` tooltip names its trigger, when that's more than the text it shows. */
  readonly "aria-label"?: string;
  readonly children?: ReactNode;
  readonly className?: string;
  /** `inline-start` and `inline-end` follow the writing direction. */
  readonly side?: "bottom" | "inline-end" | "inline-start" | "left" | "right" | "top";
  readonly sideOffset?: number;
}

/** The hint, in the browser's top layer, with an arrow towards its trigger. */
function TooltipContent({
  children,
  className,
  side,
  sideOffset = tooltipDefaults.sideOffset,
  ...props
}: TooltipContentProps) {
  const { state, trackCursorAxis } = use(TooltipContext);
  const anchor = useMemo(() => {
    if (trackCursorAxis !== "y" || state === undefined) return undefined;
    const { pointer } = state;
    return {
      getBoundingClientRect: () => {
        const box = pointer.element?.getBoundingClientRect();
        return { height: 0, width: box?.width ?? 0, x: box?.x ?? 0, y: pointer.y };
      },
    };
  }, [state, trackCursorAxis]);
  return (
    <TooltipContentPart
      anchor={anchor}
      className={cn(tooltipContentClassName, className)}
      side={side === "inline-end" ? "end" : side === "inline-start" ? "start" : side}
      sideOffset={sideOffset}
      {...props}
    >
      {children}
      <TooltipArrow className={tooltipArrowClassName} />
    </TooltipContentPart>
  );
}

export { createTooltipHandle, Tooltip, TooltipContent, TooltipTrigger };
