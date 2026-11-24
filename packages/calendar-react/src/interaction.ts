import type { CalendarInteractionRuntime } from "@moltenship/calendar-primitives";
import type { WallTimeSnapOptions } from "@moltenship/calendar-temporal";
import { createContext, useContext, type Context } from "react";

import type { RovingFocusStore } from "./roving-focus";
import type { AnyCalendarView, CalendarActiveView } from "./views";

export type { CalendarInteractionRuntime };

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
