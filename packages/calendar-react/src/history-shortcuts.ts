import type { EventHistoryDirection } from "@moltenship/calendar-core";
import { useEffect, useInsertionEffect, useRef, type RefObject } from "react";

import type { CalendarHistoryCommandOptions } from "./history";
import { useInteractionRuntime } from "./interaction";
import { reportCallbackError } from "./report-error";

export interface CalendarHistoryShortcutsOptions {
  /** Listens for nothing while `true`. */
  readonly disabled?: boolean;
  /**
   * Keys that redo, such as `"Shift+Mod+Z"`: modifiers joined by `+`, then the key. `Mod` is ⌘
   * on Apple platforms and Ctrl elsewhere. `["Shift+Mod+Z", "Ctrl+Y"]` by default; `[]` turns
   * them off.
   */
  readonly redo?: readonly string[];
  /**
   * The element whose keys undo and redo, usually the root's frame,
   * `Calendar.useCalendarMeta().refs.frame`. Keys elsewhere on the page are left alone.
   */
  readonly scope: RefObject<HTMLElement | null>;
  /** Keys that undo; `["Mod+Z"]` by default, and `[]` turns them off. */
  readonly undo?: readonly string[];
}

/** What undo and redo the shortcuts call: a bound history, from `useCalendarHistory`. */
export interface CalendarHistoryShortcutsTarget {
  readonly redo: (options?: CalendarHistoryCommandOptions) => unknown;
  readonly undo: (options?: CalendarHistoryCommandOptions) => unknown;
}

// Plain literals, so a bundler drops them from a calendar without the shortcuts.
const defaultUndo: readonly string[] = ["Mod+Z"];
const defaultRedo: readonly string[] = ["Shift+Mod+Z", "Ctrl+Y"];
const keyboardInput: CalendarHistoryCommandOptions = { input: "keyboard" };

/**
 * Where a key belongs to something else: text the browser undoes in its own field, and dialogs,
 * menus and lists inside the calendar, which handle their own keys.
 */
const ownKeys =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

function isApplePlatform(): boolean {
  const { platform, userAgentData } = navigator as Navigator & {
    readonly userAgentData?: { readonly platform?: string };
  };
  return /mac|iphone|ipad|ipod/i.test(userAgentData?.platform ?? platform);
}

/** Whether `event` is `binding`: exactly its modifiers, and its key by name or position. */
function matches(event: KeyboardEvent, binding: string, apple: boolean): boolean {
  const parts = binding.split("+").map((part) => part.trim().toLowerCase());
  const key = parts.pop();
  if (key === undefined || key === "") return false;
  let ctrl = false;
  let meta = false;
  let shift = false;
  let alt = false;
  for (const modifier of parts) {
    if (modifier === "mod") {
      if (apple) meta = true;
      else ctrl = true;
    } else if (modifier === "ctrl" || modifier === "control") ctrl = true;
    else if (modifier === "meta" || modifier === "cmd" || modifier === "command") meta = true;
    else if (modifier === "shift") shift = true;
    else if (modifier === "alt" || modifier === "option") alt = true;
    else return false;
  }
  if (
    event.ctrlKey !== ctrl ||
    event.metaKey !== meta ||
    event.shiftKey !== shift ||
    event.altKey !== alt
  ) {
    return false;
  }
  const typed = event.key.toLowerCase();
  if (typed === key) return true;
  // A key that types no Latin letter or digit, as on a Russian layout or with Option on a Mac,
  // matches by its position. One that types another Latin letter doesn't: on QWERTZ, the key
  // where Z is on QWERTY types Y, which is redo's.
  if (/^[a-z0-9]$/.test(typed)) return false;
  if (/^[a-z]$/.test(key)) return event.code === `Key${key.toUpperCase()}`;
  return /^[0-9]$/.test(key) && event.code === `Digit${key}`;
}

/**
 * Whether something on the key's path inside `scope`, from its target out, handles keys of its
 * own: a field, also inside a web component's shadow root, or a dialog, menu or list. A dialog
 * around the whole calendar doesn't count.
 */
function ownsKeys(path: readonly EventTarget[], scope: HTMLElement): boolean {
  for (const node of path) {
    if (node === scope) return false;
    if (!(node instanceof Element)) continue;
    if ((node instanceof HTMLElement && node.isContentEditable) || node.matches(ownKeys)) {
      return true;
    }
  }
  return false;
}

/**
 * Undo and redo keys for a calendar: Mod+Z undoes, and Shift+Mod+Z or Ctrl+Y redoes, where Mod is
 * ⌘ on Apple platforms and Ctrl elsewhere. While the hook is mounted and enabled, one `keydown`
 * listener on the document acts on keys whose target is inside `scope`, after the page's own
 * handlers, React's included. Keys never undo in a text field, where the browser undoes the
 * text, or in a dialog, menu or list inside the scope, nor during a keyboard or pointer gesture,
 * nor once something else handled them. Commands pass `{ input: "keyboard" }`.
 *
 * ```tsx
 * const history = useCalendarHistory(eventHistory);
 * useCalendarHistoryShortcuts(history, { scope: Calendar.useCalendarMeta().refs.frame });
 * ```
 */
export function useCalendarHistoryShortcuts(
  history: CalendarHistoryShortcutsTarget,
  options: CalendarHistoryShortcutsOptions,
): void {
  const { keyboard, pointerDraft } = useInteractionRuntime();
  const latest = useRef({ history, options });
  useInsertionEffect(() => {
    latest.current = { history, options };
  });
  const { disabled = false } = options;

  useEffect(() => {
    if (disabled) return;
    const apple = isApplePlatform();
    // The scope is read when a key arrives, so a frame that mounts after the hook, or remounts,
    // keeps its keys, and a portal outside it, such as a dialog, never reaches them.
    const listener = (event: KeyboardEvent) => {
      const scope = latest.current.options.scope.current;
      if (event.defaultPrevented || event.isComposing || scope === null) return;
      // The path, not the target, which a shadow root around the calendar retargets to its host.
      const path = event.composedPath();
      if (!path.includes(scope)) return;
      const { undo = defaultUndo, redo = defaultRedo } = latest.current.options;
      const direction: EventHistoryDirection | null = undo.some((binding) =>
        matches(event, binding, apple),
      )
        ? "undo"
        : redo.some((binding) => matches(event, binding, apple))
          ? "redo"
          : null;
      if (direction === null || ownsKeys(path, scope)) return;
      // A gesture in progress has keys of its own; Escape cancels it.
      if (keyboard.get() !== null || pointerDraft.getSnapshot() !== null) return;
      event.preventDefault();
      try {
        Promise.resolve(latest.current.history[direction](keyboardInput)).catch(
          reportCallbackError,
        );
      } catch (error) {
        reportCallbackError(error);
      }
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [disabled, keyboard, pointerDraft]);
}
