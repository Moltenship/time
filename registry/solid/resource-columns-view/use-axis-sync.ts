import { onCleanup } from "solid-js";

import { createAxisSync, type Axis } from "@registry/shared/resource-columns-view/axis-sync";

/**
 * The axis sync (`axis-sync.ts`) in a Solid component: `followX()` or `followY()`, called in the
 * body of the component that renders a following element, gives that element's ref; call `sync`
 * on the body's scroll events.
 */
export function useAxisSync(body: () => HTMLElement | undefined) {
  const axes = createAxisSync(() => body() ?? null);
  const follow = (axis: Axis) => () => {
    let stop: (() => void) | undefined;
    // The element leaves with the component that rendered it.
    onCleanup(() => stop?.());
    return (element: HTMLElement) => {
      stop?.();
      stop = axes.follow(element, axis);
    };
  };
  return { followX: follow("x"), followY: follow("y"), sync: axes.sync };
}

/** Makes the ref of an element that follows the body's scroll; see `useAxisSync`. */
export type AxisFollower = () => (element: HTMLElement) => void;
