import { createContext, useContext, type Context } from "react";

import type { CalendarMeta, CalendarSemanticActions } from "./calendar-types";
import type { CalendarPublicState } from "./types";
import type { AnyCalendarView, CalendarActiveView } from "./views";

export type AnyCalendarState = CalendarPublicState<string, unknown, unknown>;

export interface CalendarStateSource<TState = AnyCalendarState> {
  readonly getSnapshot: () => TState;
  readonly subscribe: (listener: () => void) => () => void;
}

// oxlint-disable-next-line typescript/no-explicit-any -- commands accept every factory's values.
type AnyCalendarActions = CalendarSemanticActions<any, any, any, any>;

// The factory narrows these package-level contexts to its own types; nested roots shadow outer ones.
export const CalendarActionsContext = createContext<AnyCalendarActions | null>(null);
export const CalendarMetaContext = createContext<CalendarMeta<unknown, unknown> | null>(null);
export const CalendarSourceContext = createContext<CalendarStateSource | null>(null);
export const CalendarStateContext = createContext<AnyCalendarState | null>(null);
/** `null` while the active view is unregistered; `undefined` outside a root. */
export const CalendarViewContext = createContext<
  CalendarActiveView<AnyCalendarView> | null | undefined
>(undefined);

export function useRootContext<T>(context: Context<T | null>): T {
  const value = useContext(context);
  if (value === null) throw new Error("calendar-hook-outside-root");
  return value;
}

export function useActiveViewContext(): CalendarActiveView<AnyCalendarView> | null {
  const view = useContext(CalendarViewContext);
  if (view === undefined) throw new Error("calendar-hook-outside-root");
  return view;
}
