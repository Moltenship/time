import type {
  CalendarStateSelector,
  CalendarStateSelectorOptions,
  CalendarStateSource,
} from "@moltenship/calendar-primitives";
import { isServer } from "@solidjs/web";
import {
  createMemo,
  createSignal,
  isHydrating,
  onCleanup,
  onSettled,
  untrack,
  type Accessor,
} from "solid-js";

/**
 * Reads a selection from an external store as an accessor. Whatever reads it re-runs only when the
 * selection changes by `isEqual`, and a selector that reads props or signals re-selects when they
 * change too. Subscribes for as long as the current owner lives; on the server it reads the
 * snapshot once and never subscribes, and while hydrating it reads the server snapshot until the
 * tree settles, so the first client render matches the server's HTML.
 *
 * `source` may be an accessor of a source, for a store whose identity follows props, as a root's
 * connection does: a new source is subscribed to before it is read, and the old one let go.
 *
 * The accessor follows Solid's scheduling: after the store changes, it reads the new selection once
 * Solid flushes (a microtask, or `flush()`). Code that must see a change at once, like an event
 * handler right after a command, reads `source.getSnapshot()` instead.
 */
export function createStateSelector<TState, TSelected>(
  source: CalendarStateSource<TState> | Accessor<CalendarStateSource<TState>>,
  selector: CalendarStateSelector<TState, TSelected>,
  { isEqual = Object.is }: CalendarStateSelectorOptions<TSelected> = {},
): Accessor<TSelected> {
  const current = typeof source === "function" ? source : () => source;
  // The shape of the first source decides what hydration does: the server and the client get the
  // same props, so both make the same calls below and claim the same hydration ids.
  const initial = untrack(current);
  let readServer = isServer || (isHydrating() && initial.getServerSnapshot !== undefined);
  // The store tells us that it changed, not what changed: each notice bumps a version that the
  // memo reads. A store may notify while Solid computes (a clock samples as it is subscribed to),
  // where Solid refuses writes by default.
  const [version, setVersion] = createSignal(0, { ownedWrite: true });
  const notify = () => setVersion((value) => value + 1);

  // Its own memo, so a new source subscribes again and the old one's cleanup runs, and only then.
  // `transparent` keeps the memos out of hydration's ids: they hold no async value to hand over.
  const subscribed = createMemo(
    () => {
      const next = current();
      // A listener of its own for each subscription: Solid runs the last run's cleanup after the
      // new run, and two sources of one store share its listener set, so with one `notify` the old
      // source's unsubscribe would remove the new one's listener.
      if (!isServer) onCleanup(next.subscribe(() => notify()));
      return next;
    },
    { transparent: true },
  );

  const selected = createMemo(
    () => {
      // Subscribed before it reads, so a change between the two isn't missed.
      const store = subscribed();
      version();
      const read = readServer ? (store.getServerSnapshot ?? store.getSnapshot) : store.getSnapshot;
      return selector(read());
    },
    { equals: isEqual, transparent: true },
  );

  // `onSettled` takes a hydration id on the server too, where it never runs, so both sides call it
  // under the same condition: the source's shape, which they share. Hydration's ids stay aligned.
  if (initial.getServerSnapshot !== undefined) {
    onSettled(() => {
      if (!readServer) return;
      readServer = false;
      notify();
    });
  }
  return selected;
}
