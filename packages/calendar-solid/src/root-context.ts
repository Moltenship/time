import { createComponent, type JSX } from "@solidjs/web";
import { createContext, useContext, type Context } from "solid-js";

/** A context a root provides and its parts and accessors read, private to one factory. */
export interface RootContext<T> {
  readonly context: Context<T | null>;
  /** Renders `children` with `value` provided. Call it in the root's body. */
  provide(value: T, children: () => JSX.Element): JSX.Element;
  /** The nearest provider's value; throws the context's error code outside one. */
  use(): T;
}

/**
 * Solid 2.0's own default-less context throws `ContextNotFoundError` outside a provider. A `null`
 * default with our own check throws the error code the React package throws instead, so both
 * adapters fail the same way.
 */
export function createRootContext<T>(
  name: string,
  error = "calendar-hook-outside-root",
): RootContext<T> {
  const context = createContext<T | null>(null, { name });
  return Object.freeze({
    context,
    provide: (value: T, children: () => JSX.Element) =>
      createComponent(context, {
        value,
        get children() {
          return children();
        },
      }),
    use() {
      const value = useContext(context);
      if (value === null) throw new Error(error);
      return value;
    },
  });
}
