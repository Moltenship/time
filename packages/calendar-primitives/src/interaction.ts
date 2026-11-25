import type {
  CalendarDraft,
  CalendarPendingChanges,
  EventId,
  ResourceId,
} from "@moltenship/calendar-core";
import type { PlainDateInterval, WallTimeSnapOptions } from "@moltenship/calendar-temporal";

import type { AnnouncerChannel } from "./announcer-channel";
import type { CalendarSemanticActions } from "./calendar-types";
import type { DraftStore } from "./draft-store";
import type { KeyboardSessionStore } from "./keyboard-store";
import type { RovingFocusStore } from "./roving-focus";
import type { CalendarRequestListener } from "./store";
import type { AnyCalendarState, CalendarStateSource } from "./types";
import type { AnyCalendarViewDefinition, CalendarActiveView } from "./views";

export type AnyPendingChanges = CalendarPendingChanges<unknown, EventId, ResourceId>;

/**
 * A root's interaction plumbing, which views and their gestures drive whatever calendar they
 * render in; the nearest root wins.
 */
export interface CalendarInteractionRuntime {
  // oxlint-disable-next-line typescript/no-explicit-any -- views drive every factory's root.
  readonly actions: CalendarSemanticActions<any, any, any, any, any, any>;
  readonly announcements: AnnouncerChannel;
  /** The root's pending changes, which an event history waits out before it undoes. */
  readonly changes: CalendarStateSource<AnyPendingChanges>;
  /**
   * The change being drafted, by keyboard or pointer: the keyboard's session while one is in
   * progress, else the pointer's draft. A keyboard session's draft keeps its identity for as long
   * as the session does.
   */
  readonly draft: CalendarStateSource<CalendarDraft<EventId, ResourceId> | null>;
  /** The root has no `onEventChange`, so it rejects every change and views start no gestures. */
  readonly isReadOnly: boolean;
  readonly keyboard: KeyboardSessionStore;
  /** The pointer's draft while a drag previews a change; the keyboard's is in `keyboard`. */
  readonly pointerDraft: DraftStore;
  /**
   * The dates the view on screen shows for `anchor`, as of the last commit, so a change of view
   * still waiting for its owner doesn't count; `null` without one.
   */
  readonly rangeOf: (anchor: Temporal.PlainDate) => PlainDateInterval | null;
  /**
   * The latest state, controlled slices and requests not yet committed included; read it in
   * callbacks that run after the render that created them.
   */
  readonly read: () => AnyCalendarState;
  /** Subscribes to every command the root receives, even one that changes nothing. */
  readonly requests: (listener: CalendarRequestListener) => () => void;
  /** For subscribing; its identity changes with controlled values. */
  readonly source: CalendarStateSource<AnyCalendarState>;
}

/** Time-grid slots when a view doesn't choose its own, as in the pointer layer. */
export const DEFAULT_SNAP: WallTimeSnapOptions = Object.freeze({
  increment: 15,
  smallestUnit: "minute",
});

/**
 * The active view's focus plumbing, which an integration creates once per rendered active view
 * (`createCalendarViewRuntime`) and hands to the view's keyboard and focusable elements.
 */
export interface CalendarViewRuntime {
  /** The latest active view, read when a key is handled; `null` once none is registered. */
  readonly getView: () => CalendarActiveView<AnyCalendarViewDefinition> | null;
  /** The view's focusable elements and its one tab stop. */
  readonly roving: RovingFocusStore;
}
