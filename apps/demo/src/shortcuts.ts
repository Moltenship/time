import type { DemoView } from "./calendar";

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
  { command: { type: "view", view: "week" }, keys: ["w"], label: "Week view" },
  { command: { type: "view", view: "month" }, keys: ["m"], label: "Month view" },
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
      target.closest("input, textarea, select, [role=dialog], [role=listbox], [role=menu]") !==
        null)
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
