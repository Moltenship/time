import {
  attachCalendarHistoryShortcuts,
  type CalendarHistoryShortcutsTarget,
} from "@moltenship/calendar-primitives";
import { useEffect, useInsertionEffect, useRef, type RefObject } from "react";

import { useInteractionRuntime } from "./interaction";

export type { CalendarHistoryShortcutsTarget };

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
    if (disabled) return undefined;
    // The scope is read when a key arrives, so a frame that mounts after the hook, or remounts,
    // keeps its keys.
    return attachCalendarHistoryShortcuts({ keyboard, pointerDraft }, () => {
      const { history: target, options: current } = latest.current;
      return {
        history: target,
        redo: current.redo,
        scope: current.scope.current,
        undo: current.undo,
      };
    });
  }, [disabled, keyboard, pointerDraft]);
}
