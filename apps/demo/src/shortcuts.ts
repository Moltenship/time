import { useEffect } from "react";

import type { DemoView } from "./demo-model";
import { viewFor } from "./scrolling";

export type ShortcutCommand =
  | { readonly type: "create" | "help" | "next" | "previous" | "today" }
  | { readonly type: "view"; readonly view: DemoView };

export interface Shortcut {
  readonly command: ShortcutCommand;
  /** `KeyboardEvent.key` values that run the command. */
  readonly keys: readonly string[];
  readonly label: string;
}

/** Global shortcuts, in the order the shortcuts dialog lists them. */
export const shortcuts: readonly Shortcut[] = [
  { command: { type: "today" }, keys: ["t"], label: "Go to today" },
  { command: { type: "previous" }, keys: ["k", "ArrowLeft"], label: "Previous period" },
  { command: { type: "next" }, keys: ["j", "ArrowRight"], label: "Next period" },
  { command: { type: "view", view: "day" }, keys: ["d"], label: "Day view" },
  { command: { type: "view", view: "3-day" }, keys: ["x"], label: "3-day view" },
  { command: { type: "view", view: "week" }, keys: ["w"], label: "Week view" },
  { command: { type: "view", view: "month" }, keys: ["m"], label: "Month view" },
  { command: { type: "view", view: "year" }, keys: ["y"], label: "Year view" },
  { command: { type: "view", view: "agenda" }, keys: ["a"], label: "Agenda view" },
  { command: { type: "view", view: "resources" }, keys: ["r"], label: "Resources view" },
  { command: { type: "view", view: "timeline-week" }, keys: ["l"], label: "Timeline view" },
  { command: { type: "create" }, keys: ["c"], label: "Create an event" },
  { command: { type: "help" }, keys: ["?"], label: "Show keyboard shortcuts" },
];

const commands = new Map(
  shortcuts.flatMap(({ command, keys }) => keys.map((key) => [key, command] as const)),
);

function isTypingOrInDialog(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.closest(
        "input, textarea, select, dialog, [role=dialog], [role=listbox], [role=menu]",
      ) !== null)
  );
}

/**
 * The command for a plain key press outside text fields, dialogs and menus. Shift only counts for
 * "?", which most layouts type with it.
 */
export function shortcutCommand(event: KeyboardEvent): ShortcutCommand | undefined {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return undefined;
  if (event.shiftKey && event.key !== "?") return undefined;
  if (isTypingOrInDialog(event.target)) return undefined;
  return commands.get(event.key);
}

/** What the global shortcuts act on, which each UI's calendar provides. */
export interface ShortcutActions {
  readonly navigateNext: () => void;
  readonly navigatePrevious: () => void;
  readonly navigateToday: () => void;
  readonly setView: (view: DemoView) => void;
}

/** Global shortcuts: t today, d/x/w/m/y/a views, j/k or ←/→ to step, c to create, ? for help. */
export function useShortcutKeys(
  actions: ShortcutActions,
  onCreate: () => void,
  onHelp: () => void,
  /** Whether d, x, w, m, and a open the scrolling day, 3 days, week, month, and agenda. */
  scrolling: boolean,
) {
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const command = shortcutCommand(event);
      if (command === undefined) return;
      event.preventDefault();
      if (command.type === "view") actions.setView(viewFor(command.view, scrolling));
      else if (command.type === "create") onCreate();
      else if (command.type === "help") onHelp();
      else if (command.type === "next") actions.navigateNext();
      else if (command.type === "previous") actions.navigatePrevious();
      else actions.navigateToday();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [actions, onCreate, onHelp, scrolling]);
}

export interface KeyListItem {
  readonly keys: readonly string[];
  readonly label: string;
}

/** Keys for moving around inside the calendar. */
const navigationKeys: readonly KeyListItem[] = [
  { keys: ["Tab"], label: "Move into or out of the calendar" },
  { keys: ["↑ ↓ ← →"], label: "Move between days, times and events" },
  { keys: ["Home", "End"], label: "Go to the first or last day" },
  { keys: ["PageUp", "PageDown"], label: "Go back or forward a page" },
  { keys: ["Enter"], label: "Open the focused event, or go into a day's events" },
  { keys: ["Shift+Enter"], label: "Open the focused day" },
  { keys: ["Escape"], label: "Go back from an event to its day" },
];

/** Keys for moving, resizing and creating events. */
const editingKeys: readonly KeyListItem[] = [
  { keys: ["Space"], label: "Pick up the focused event to move it" },
  { keys: ["Shift+Space"], label: "Pick up the focused event to resize it" },
  { keys: ["Space"], label: "Start a new event on the focused day or time" },
  { keys: ["↑ ↓ ← →"], label: "Move, resize or extend it" },
  { keys: ["Enter", "Space"], label: "Save the change" },
  { keys: ["Escape"], label: "Cancel the change" },
];

const isApple =
  typeof navigator !== "undefined" && /mac|iphone|ipad|ipod/i.test(navigator.platform);

/** Undo and redo, which work while focus is in the calendar. */
const historyKeys: readonly KeyListItem[] = [
  { keys: [isApple ? "⌘Z" : "Ctrl+Z"], label: "Undo the last change" },
  { keys: isApple ? ["Shift+⌘Z"] : ["Shift+Ctrl+Z", "Ctrl+Y"], label: "Redo it" },
];

/** The shortcuts dialog's lists. */
export const shortcutSections: readonly {
  readonly items: readonly KeyListItem[];
  readonly title: string;
}[] = [
  { items: shortcuts, title: "Anywhere" },
  { items: navigationKeys, title: "In the calendar" },
  { items: editingKeys, title: "Changing events" },
  { items: historyKeys, title: "Undo and redo" },
];

const keyNames: Readonly<Record<string, string>> = {
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  Escape: "Esc",
  PageDown: "Page Down",
  PageUp: "Page Up",
};

/** A `KeyboardEvent.key` value as a keycap shows it. */
export function keyLabel(key: string): string {
  return keyNames[key] ?? (key.length === 1 ? key.toUpperCase() : key);
}
