import { createComponent, type JSX } from "@solidjs/web";
import { For, Show, type Accessor, type Component } from "solid-js";

// `For` and `Show` are overloaded on `keyed`, and `createComponent` infers its props from the last
// overload only, so written without JSX they don't type check. These pick one overload each.
// oxlint-disable-next-line typescript/no-explicit-any -- the overloads differ in their props.
type AnyComponent = Component<any>;

/**
 * Renders one element per item of `each()`, keyed by identity: an item that stays keeps its
 * elements, and `render` gets it as a value and its index as an accessor.
 */
export function keyedList<T>(
  each: () => readonly T[] | undefined | null | false,
  render: (item: T, index: Accessor<number>) => JSX.Element,
  fallback?: () => JSX.Element,
): JSX.Element {
  return createComponent(For as AnyComponent, {
    get each() {
      return each();
    },
    get fallback() {
      return fallback?.();
    },
    children: (item: T, index: Accessor<number>) => render(item, index),
  });
}

/**
 * Renders `render` while `condition()` is truthy, and `fallback` otherwise. `render` gets the value
 * as an accessor and stays mounted while it changes from one truthy value to another.
 */
export function when<T>(
  condition: () => T | undefined | null | false,
  render: (value: Accessor<NonNullable<T>>) => JSX.Element,
  fallback?: () => JSX.Element,
): JSX.Element {
  return createComponent(Show as AnyComponent, {
    get when() {
      return condition();
    },
    get fallback() {
      return fallback?.();
    },
    // Show passes the value only to a child that declares a parameter.
    children: (value: Accessor<NonNullable<T>>) => render(value),
  });
}
