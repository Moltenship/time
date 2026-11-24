import { dynamic, type JSX } from "@solidjs/web";
import { omit, type Component, type Omit as Rest } from "solid-js";

/**
 * Splits a root's props into the options its instance reads and the props its element takes.
 * The options come back as a getter, as `usePrimitive` wants them: each call reads every key, so a
 * memo or effect around it tracks each one, and the rest stays a live view of `props` (`omit`),
 * never a copy. Destructuring either would freeze it at the first render.
 */
export function splitOptions<
  // oxlint-disable-next-line typescript/no-explicit-any -- Solid's `omit` takes any props object.
  TProps extends Record<any, any>,
  const TKeys extends readonly (keyof TProps)[],
>(
  props: TProps,
  keys: TKeys,
): readonly [options: () => Pick<TProps, TKeys[number]>, rest: Rest<TProps, [...TKeys]>] {
  const options = () => {
    const picked: Partial<Pick<TProps, TKeys[number]>> = {};
    for (const key of keys) picked[key] = props[key];
    return picked as Pick<TProps, TKeys[number]>;
  };
  return [options, omit(props, ...keys)];
}

type Tag = keyof JSX.IntrinsicElements;

const elements = new Map<Tag, Component<never>>();

/**
 * A component that renders one native element, for writing parts without JSX. It creates or, while
 * hydrating, claims the element and spreads its props, as compiled JSX does, on the client and the
 * server. One per tag, so repeated renders don't make new factories.
 */
export function element<T extends Tag>(tag: T): Component<JSX.IntrinsicElements[T]> {
  let component = elements.get(tag);
  if (component === undefined) {
    component = dynamic(() => tag, { static: true }) as Component<never>;
    elements.set(tag, component);
  }
  return component as Component<JSX.IntrinsicElements[T]>;
}
