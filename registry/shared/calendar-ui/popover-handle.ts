import { createPopoverController, type PopoverController } from "@ui-sdk/core/popover";

/**
 * One popover that many triggers open, each with its own `payload`, like Base UI's
 * `Popover.createHandle()`: hundreds of triggers share one root.
 */
export interface PopoverHandle<Payload> {
  /**
   * Opens the popover from the trigger with this `id` in the document, as a press on it would. A
   * popover already open from that trigger stays open.
   */
  open(triggerId: string): void;
  close(): void;
  /** The `payload` of the trigger that opened it last. */
  getPayload(): Payload | undefined;
}

const controllers = new WeakMap<PopoverHandle<unknown>, PopoverController<unknown>>();

export function createPopoverHandle<Payload>(): PopoverHandle<Payload> {
  const controller = createPopoverController<Payload>();
  const handle: PopoverHandle<Payload> = {
    close: () => void controller.close(),
    getPayload: () => controller.getPayload(),
    open: (triggerId) => {
      const trigger = document.getElementById(triggerId);
      // A press toggles: on the trigger the popover is open from, it would close it.
      if (trigger?.getAttribute("aria-expanded") !== "true") trigger?.click();
    },
  };
  controllers.set(handle, controller as PopoverController<unknown>);
  return handle;
}

/** The ui-sdk controller behind a handle, for the popover's root and its triggers. */
export function popoverControllerOf<Payload>(
  handle: PopoverHandle<Payload> | undefined,
): PopoverController<unknown> | undefined {
  return handle === undefined ? undefined : controllers.get(handle as PopoverHandle<unknown>);
}

/** The sides a popup takes; `inline-start` and `inline-end` follow the writing direction. */
export type PopupSide = "bottom" | "inline-end" | "inline-start" | "left" | "right" | "top";

/** A side in ui-sdk's names, where the writing direction's sides are `start` and `end`. */
export function popupSide(side: PopupSide | undefined) {
  return side === "inline-end" ? "end" : side === "inline-start" ? "start" : side;
}
