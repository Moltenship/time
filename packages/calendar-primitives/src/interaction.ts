import type { CalendarPendingChanges, EventId, ResourceId } from "@moltenship/calendar-core";
import type { PlainDateInterval } from "@moltenship/calendar-temporal";

import type { AnnouncerChannel } from "./announcer-channel";
import type { CalendarSemanticActions } from "./calendar-types";
import type { DraftStore } from "./draft-store";
import type { KeyboardSessionStore } from "./keyboard-store";
import type { CalendarRequestListener } from "./store";
import type { AnyCalendarState, CalendarStateSource } from "./types";

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
