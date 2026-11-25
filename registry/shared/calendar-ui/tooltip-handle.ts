import { createTooltipController, type TooltipController } from "@ui-sdk/core/tooltip";

/**
 * One tooltip that many triggers show, each with its own `payload`, like Base UI's
 * `Tooltip.createHandle()`: hundreds of triggers share one root.
 */
export interface TooltipHandle<Payload> {
  close(): void;
  /** The `payload` of the trigger that showed it last. */
  getPayload(): Payload | undefined;
}

/** A handle's controller, and the trigger under the pointer with the pointer's height. */
export interface TooltipHandleState {
  readonly controller: TooltipController<unknown>;
  readonly pointer: { element: Element | null; y: number };
}

const handles = new WeakMap<TooltipHandle<unknown>, TooltipHandleState>();

export function createTooltipHandle<Payload>(): TooltipHandle<Payload> {
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

export function tooltipStateOf<Payload>(
  handle: TooltipHandle<Payload> | undefined,
): TooltipHandleState | undefined {
  return handle === undefined ? undefined : handles.get(handle as TooltipHandle<unknown>);
}

/** Notes the trigger the pointer is on, and its height, for `trackCursorAxis`. */
export function trackTooltipPointer(
  state: TooltipHandleState | undefined,
  element: Element,
  clientY: number,
) {
  if (state === undefined) return;
  state.pointer.element = element;
  state.pointer.y = clientY;
}

/**
 * What a tooltip that follows the pointer up and down its trigger is placed against: the
 * trigger's width, at the pointer's height.
 */
export function cursorAnchor(state: TooltipHandleState) {
  const { pointer } = state;
  return {
    getBoundingClientRect: () => {
      const box = pointer.element?.getBoundingClientRect();
      return { height: 0, width: box?.width ?? 0, x: box?.x ?? 0, y: pointer.y };
    },
  };
}

export interface TooltipOpenChangeDetails<Payload> {
  readonly cancel: () => void;
  readonly payload: Payload | undefined;
}

export type TooltipOpenChangeHandler<Payload> = (
  open: boolean,
  details: TooltipOpenChangeDetails<Payload>,
) => void;

/** Whether the tooltip is open, and the payload it shows, between ui-sdk's reports. */
export interface TooltipTracking<Payload> {
  open: boolean;
  payload: Payload | undefined;
}

function report<Payload>(
  onOpenChange: TooltipOpenChangeHandler<Payload> | undefined,
  open: boolean,
  payload: Payload | undefined,
  cancel: () => void,
) {
  let cancelled = false;
  onOpenChange?.(open, {
    cancel: () => {
      cancelled = true;
      cancel();
    },
    payload,
  });
  return !cancelled;
}

/** For ui-sdk's `onOpenChange`: reports the change with the payload it opens with. */
export function reportTooltipOpen<Payload>(
  tracking: TooltipTracking<Payload>,
  onOpenChange: TooltipOpenChangeHandler<Payload> | undefined,
  open: boolean,
  details: { readonly cancel: () => void },
) {
  if (report(onOpenChange, open, tracking.payload, details.cancel)) tracking.open = open;
}

/**
 * For ui-sdk's `onPayloadChange`. ui-sdk reports a trigger's payload before it opens, and a
 * takeover of the open tooltip by its payload alone, which is reported here as an opening. Returns
 * whether the tooltip now shows `next`.
 */
export function reportTooltipPayload<Payload>(
  tracking: TooltipTracking<Payload>,
  onOpenChange: TooltipOpenChangeHandler<Payload> | undefined,
  next: Payload | undefined,
  details: { readonly cancel: () => void },
) {
  if (tracking.open && !report(onOpenChange, true, next, details.cancel)) return false;
  tracking.payload = next;
  return true;
}
