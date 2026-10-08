import { useSyncExternalStore } from "react";

import { readStorage, writeStorage } from "./storage";

type Theme = "light" | "dark";

// Shared with the pre-paint script in index.html.
const themeStorageKey = "moltenship-demo:theme";
const listeners = new Set<() => void>();
let systemQuery: MediaQueryList | undefined;

// The `.dark` class on <html> is the single source of truth, so every toggle stays in sync.
function readTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  for (const listener of listeners) listener();
}

function followSystem(event: MediaQueryListEvent) {
  if (readStorage(themeStorageKey) === null) applyTheme(event.matches ? "dark" : "light");
}

function subscribe(listener: () => void) {
  systemQuery ??= matchMedia("(prefers-color-scheme: dark)");
  if (listeners.size === 0) systemQuery.addEventListener("change", followSystem);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) systemQuery?.removeEventListener("change", followSystem);
  };
}

function toggleTheme() {
  const next = readTheme() === "dark" ? "light" : "dark";
  writeStorage(themeStorageKey, next);
  applyTheme(next);
}

/** Follows the system theme until the user picks one; the choice is saved and applied as `.dark`. */
export function useTheme() {
  return { theme: useSyncExternalStore(subscribe, readTheme), toggleTheme };
}
