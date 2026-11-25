import { createEffect, createSignal, onCleanup, untrack, type Signal } from "solid-js";

import { readStorage, writeStorage } from "@demo/storage";
import { readTheme, subscribeTheme, toggleTheme } from "@demo/theme";

/**
 * A signal saved in localStorage under `key`, which the React demo saves under too, so the
 * framework switch keeps it: read once, and written after each change.
 */
export function createPersistentSignal<T>(
  key: string,
  load: (stored: string | null) => T,
  serialize: (value: T) => string,
): Signal<T> {
  // Loaded once: a seed that reads other signals, such as the time zone, doesn't follow them.
  const initial = untrack(() => load(readStorage(key)));
  const [value, setValue] = createSignal<T>(initial as Exclude<T, Function>);
  createEffect(value, (current) => writeStorage(key, serialize(current)));
  return [value, setValue] as Signal<T>;
}

/** The theme the React demo saves and the page's `.dark` class shows, with its toggle. */
export function useTheme() {
  const [theme, setTheme] = createSignal(readTheme());
  onCleanup(subscribeTheme(() => setTheme(readTheme())));
  return { theme, toggleTheme };
}

/** A message that dismisses itself after a few seconds. */
export function createNotice() {
  const [notice, setNotice] = createSignal<{ readonly text: string } | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(timer));
  const show = (text: string) => {
    clearTimeout(timer);
    setNotice({ text });
    timer = setTimeout(() => setNotice(null), 4_000);
  };
  return [() => notice()?.text ?? null, show] as const;
}
