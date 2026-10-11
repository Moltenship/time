import type { PlainDateInterval, WallTimeSnapOptions } from "@moltenship/calendar-temporal";
import { createContext, useContext, type Context } from "react";

import type { AnnouncerChannel } from "./announcer";
import type { CalendarSemanticActions } from "./calendar-types";
import type { AnyCalendarState, CalendarStateSource } from "./context";
import type { KeyboardSessionStore } from "./keyboard-store";
import type { RovingFocusStore } from "./roving-focus";
import type { CalendarRequestListener } from "./store";
import type { AnyCalendarView, CalendarActiveView } from "./views";

/**
 * A root's interaction plumbing. The context is shared by every factory, so view hooks work in
 * any calendar's views; the nearest root wins.
 */
export interface CalendarInteractionRuntime {
  // oxlint-disable-next-line typescript/no-explicit-any -- views drive every factory's root.
  readonly actions: CalendarSemanticActions<any, any, any, any, any, any>;
  readonly announcements: AnnouncerChannel;
  readonly keyboard: KeyboardSessionStore;
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

/** The active view's focus plumbing, provided by `ActiveView`. */
export interface CalendarViewRuntime {
  /** The latest active view, read when a key is handled; `null` once none is registered. */
  readonly getView: () => CalendarActiveView<AnyCalendarView> | null;
  readonly roving: RovingFocusStore;
}

/** Time-grid slots when a view does not choose its own, as in the pointer layer. */
export const DEFAULT_SNAP: WallTimeSnapOptions = Object.freeze({
  increment: 15,
  smallestUnit: "minute",
});

export const CalendarInteractionContext: Context<CalendarInteractionRuntime | null> =
  createContext<CalendarInteractionRuntime | null>(null);
export const CalendarViewRuntimeContext: Context<CalendarViewRuntime | null> =
  createContext<CalendarViewRuntime | null>(null);

export function useInteractionRuntime(): CalendarInteractionRuntime {
  const runtime = useContext(CalendarInteractionContext);
  if (runtime === null) throw new Error("calendar-hook-outside-root");
  return runtime;
}

export function useViewRuntime(): CalendarViewRuntime {
  const runtime = useContext(CalendarViewRuntimeContext);
  if (runtime === null) throw new Error("calendar-view-hook-outside-active-view");
  return runtime;
}
