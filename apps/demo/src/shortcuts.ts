import type { DemoView } from "./calendar";

export type ShortcutCommand =
  | { readonly type: "create" | "next" | "previous" | "today" }
  | { readonly type: "view"; readonly view: DemoView };

const commands = new Map<string, ShortcutCommand>([
  ["a", { type: "view", view: "agenda" }],
  ["ArrowLeft", { type: "previous" }],
  ["ArrowRight", { type: "next" }],
  ["c", { type: "create" }],
  ["d", { type: "view", view: "day" }],
  ["j", { type: "next" }],
  ["k", { type: "previous" }],
  ["m", { type: "view", view: "month" }],
  ["t", { type: "today" }],
  ["w", { type: "view", view: "week" }],
]);

function isTypingOrInDialog(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.closest("input, textarea, select, [role=dialog], [role=listbox], [role=menu]") !==
        null)
  );
}

/** The command for a plain key press outside text fields, dialogs and menus. */
export function shortcutCommand(event: KeyboardEvent): ShortcutCommand | undefined {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return undefined;
  }
  if (isTypingOrInDialog(event.target)) return undefined;
  return commands.get(event.key);
}
