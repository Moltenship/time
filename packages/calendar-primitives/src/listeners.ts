import { reportCallbackError } from "./report-error";

/**
 * Change listeners where every subscription is an entry of its own. A store that keeps the
 * listener functions themselves merges two subscriptions of one function into one, so ending the
 * older one silences the newer: an adapter that subscribes again before it cleans up, as Solid
 * does, would stop hearing changes. Here each subscription ends only itself.
 *
 * A listener that throws is reported (`reportCallbackError`) and the others still hear the change,
 * so one failing subscriber can't keep a store's other subscribers stale, or fail the store's own
 * `subscribe` or update before it returns.
 */
export interface Listeners {
  readonly notify: () => void;
  readonly subscribe: (listener: () => void) => () => void;
}

export function createListeners(): Listeners {
  const entries = new Set<{ readonly listener: () => void }>();
  return Object.freeze({
    notify() {
      for (const entry of entries) {
        try {
          entry.listener();
        } catch (error) {
          reportCallbackError(error);
        }
      }
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
