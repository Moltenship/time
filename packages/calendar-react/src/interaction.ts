import type {
  CalendarInteractionRuntime,
  CalendarViewRuntime,
} from "@moltenship/calendar-primitives";
import { createContext, useContext, type Context } from "react";

export type { CalendarInteractionRuntime, CalendarViewRuntime };

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
