/**
 * Memo cells: what `useMemo` and a stable-value hook do in a component, as plain closures a
 * runtime owns, so a framework can derive during render (or in a signal's memo) and get the same
 * objects back while their inputs hold.
 */

/** A value that keeps its first identity while `isEqual` says each next one is the same. */
export function createStableCell<T>(isEqual: (previous: T, next: T) => boolean): (next: T) => T {
  let held: { readonly value: T } | undefined;
  return (next) => {
    if (held !== undefined && (held.value === next || isEqual(held.value, next))) {
      return held.value;
    }
    held = { value: next };
    return next;
  };
}

/** A value computed again only when one of its dependencies changes identity. */
export function createMemoCell<T>(): (deps: readonly unknown[], compute: () => T) => T {
  let held: { readonly deps: readonly unknown[]; readonly value: T } | undefined;
  return (deps, compute) => {
    if (
      held !== undefined &&
      held.deps.length === deps.length &&
      held.deps.every((dep, index) => Object.is(dep, deps[index]))
    ) {
      return held.value;
    }
    const value = compute();
    held = { deps, value };
    return value;
  };
}
