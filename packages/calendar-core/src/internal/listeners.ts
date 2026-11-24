/**
 * Change listeners where every subscription is an entry of its own. A store that keeps the
 * listener functions themselves merges two subscriptions of one function into one, so ending the
 * older one silences the newer: an adapter that subscribes again before it cleans up, as Solid
 * does, would stop hearing changes. Here each subscription ends only itself.
 */
export interface Listeners {
  readonly notify: () => void;
  readonly subscribe: (listener: () => void) => () => void;
}

export function createListeners(): Listeners {
  const entries = new Set<{ readonly listener: () => void }>();
  return Object.freeze({
    notify() {
      for (const entry of entries) entry.listener();
    },
    subscribe(listener: () => void) {
      const entry = { listener };
      entries.add(entry);
      return () => {
        entries.delete(entry);
      };
    },
  });
}
