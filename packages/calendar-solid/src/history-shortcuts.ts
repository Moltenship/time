import {
  attachCalendarHistoryShortcuts,
  type CalendarHistoryShortcutsTarget,
} from "@moltenship/calendar-primitives";
import { isServer } from "@solidjs/web";
import { createEffect, createMemo, untrack } from "solid-js";

import { access, useInteractionNow, type MaybeAccessor } from "./shared";

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
   * The element whose keys undo and redo, usually the root's frame: `meta().refs.frame`, read
   * inside the options' accessor. Keys elsewhere on the page are left alone.
   */
  readonly scope: MaybeAccessor<HTMLElement | null | undefined>;
  /** Keys that undo; `["Mod+Z"]` by default, and `[]` turns them off. */
  readonly undo?: readonly string[];
}

/**
 * Undo and redo keys for a calendar: Mod+Z undoes, and Shift+Mod+Z or Ctrl+Y redoes, where Mod is
 * ⌘ on Apple platforms and Ctrl elsewhere. While the hook's owner lives and it is enabled, one
 * `keydown` listener on the document acts on keys whose target is inside `scope`, after the page's
 * own handlers. Keys never undo in a text field, where the browser undoes the text, or in a
 * dialog, menu or list inside the scope, nor during a keyboard or pointer gesture, nor once
 * something else handled them. Commands pass `{ input: "keyboard" }`.
 *
 * `history` is `useCalendarHistory`'s accessor, or any object with `undo` and `redo`; it, the
 * scope and the keys are read when a key arrives.
 *
 * ```ts
 * const history = useCalendarHistory(eventHistory);
 * const meta = Calendar.useCalendarMeta();
 * useCalendarHistoryShortcuts(history, () => ({ scope: meta().refs.frame }));
 * ```
 */
export function useCalendarHistoryShortcuts(
  history: MaybeAccessor<CalendarHistoryShortcutsTarget>,
  options: MaybeAccessor<CalendarHistoryShortcutsOptions>,
): void {
  const { keyboard, pointerDraft } = useInteractionNow();
  const disabled = createMemo(() => access(options).disabled === true);
  createEffect(disabled, (off) => {
    if (off || isServer) return undefined;
    // The scope is read when a key arrives, so a frame that mounts after the hook, or remounts,
    // keeps its keys.
    return attachCalendarHistoryShortcuts({ keyboard, pointerDraft }, () =>
      untrack(() => {
        const current = access(options);
        return {
          history: access(history),
          redo: current.redo,
          scope: access(current.scope) ?? null,
          undo: current.undo,
        };
      }),
    );
  });
}
