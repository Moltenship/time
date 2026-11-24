import type { CalendarNowSource } from "@moltenship/calendar-core";
import type {
  AnyCalendarState,
  AnyPendingChanges,
  CalendarPrimitive,
  CalendarStateSource,
} from "@moltenship/calendar-primitives";
import type { PrimitiveHandle } from "@ui-sdk/react/primitive";
import { createContext, useContext, type Context } from "react";

import type { CalendarMeta, CalendarSemanticActions } from "./calendar-types";
import type { AnyCalendarView, CalendarActiveView } from "./views";

export type { AnyCalendarState, AnyPendingChanges, CalendarStateSource };

/** The root's ui-sdk instance, which the chrome parts render their slots through. */
// oxlint-disable-next-line typescript/no-explicit-any -- the parts render every factory's root.
export type CalendarHandle = PrimitiveHandle<CalendarPrimitive<string, any, any, any>>;

// oxlint-disable-next-line typescript/no-explicit-any -- commands accept every factory's values.
type AnyCalendarActions = CalendarSemanticActions<any, any, any, any, any, any>;

/** One factory's providers. The factory narrows these untyped contexts to its own records. */
export interface CalendarContexts {
  readonly actions: Context<AnyCalendarActions | null>;
  /** The root's pending changes, for `useCalendarPendingChanges`. */
  readonly changes: Context<CalendarStateSource<AnyPendingChanges> | null>;
  /** The root's ui-sdk instance; ui-sdk keeps its own lookup internal, so the factory carries it. */
  readonly handle: Context<CalendarHandle | null>;
  readonly meta: Context<CalendarMeta<unknown, unknown> | null>;
  readonly source: Context<CalendarStateSource | null>;
  readonly state: Context<AnyCalendarState | null>;
  /** `null` while the active view is unregistered; `undefined` outside a root. */
  readonly view: Context<CalendarActiveView<AnyCalendarView> | null | undefined>;
}

/** Each factory owns its contexts, so its hooks resolve its own root inside another calendar. */
export function createCalendarContexts(): CalendarContexts {
  return Object.freeze({
    actions: createContext<AnyCalendarActions | null>(null),
    changes: createContext<CalendarStateSource<AnyPendingChanges> | null>(null),
    handle: createContext<CalendarHandle | null>(null),
    meta: createContext<CalendarMeta<unknown, unknown> | null>(null),
    source: createContext<CalendarStateSource | null>(null),
    state: createContext<AnyCalendarState | null>(null),
    view: createContext<CalendarActiveView<AnyCalendarView> | null | undefined>(undefined),
  });
}

/** The nearest root's clock, shared by every factory so `useNow` works inside any calendar. */
export const CalendarNowSourceContext: Context<CalendarNowSource | undefined> = createContext<
  CalendarNowSource | undefined
>(undefined);

export function useRootContext<T>(context: Context<T | null>): T {
  const value = useContext(context);
  if (value === null) throw new Error("calendar-hook-outside-root");
  return value;
}

export function useActiveViewContext(
  context: CalendarContexts["view"],
): CalendarActiveView<AnyCalendarView> | null {
  const view = useContext(context);
  if (view === undefined) throw new Error("calendar-hook-outside-root");
  return view;
}
