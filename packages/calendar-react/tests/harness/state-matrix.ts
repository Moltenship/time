import type {
  CalendarActions,
  CalendarControlledState,
  CalendarPublicState,
  CalendarStateChangeHandlers,
} from "@moltenship/calendar-react";

import type { GateFocus, GateSelection, GateView } from "./builders";

type GateState = CalendarPublicState<GateView, GateSelection, GateFocus, string>;
type GateActions = CalendarActions<GateView, GateSelection, GateFocus, string>;
type GateControlledState = CalendarControlledState<GateView, GateSelection, GateFocus, string>;
type GateHandlers = CalendarStateChangeHandlers<GateView, GateSelection, GateFocus, string>;

export interface ControlledStateMatrixCase {
  readonly controlled: GateControlledState;
  readonly initial: string;
  readonly name: keyof GateState;
  readonly next: string;
  apply(actions: GateActions): void;
  createHandlers(update: (controlled: GateControlledState) => void): GateHandlers;
  read(state: GateState): string;
}

export const controlledStateMatrix = Object.freeze([
  {
    apply: (actions) => actions.setView("agenda"),
    controlled: Object.freeze({ view: "month" }),
    createHandlers: (update) => ({ onViewChange: (next) => update({ view: next }) }),
    initial: "month",
    name: "view",
    next: "agenda",
    read: (state) => state.view,
  },
  {
    apply: (actions) => actions.setAnchorDate(Temporal.PlainDate.from("2026-08-16")),
    controlled: Object.freeze({ anchorDate: Temporal.PlainDate.from("2026-08-15") }),
    createHandlers: (update) => ({
      onAnchorDateChange: (next) => update({ anchorDate: next }),
    }),
    initial: "2026-08-15",
    name: "anchorDate",
    next: "2026-08-16",
    read: (state) => state.anchorDate.toString(),
  },
  {
    apply: (actions) => actions.setSelection({ eventId: "event-1" }),
    controlled: Object.freeze({ selection: null }),
    createHandlers: (update) => ({
      onSelectionChange: (next) => update({ selection: next }),
    }),
    initial: "none",
    name: "selection",
    next: "event-1",
    read: (state) => state.selection?.eventId ?? "none",
  },
  {
    apply: (actions) => actions.setFocus({ cell: "2026-08-16T09:00" }),
    controlled: Object.freeze({ focus: null }),
    createHandlers: (update) => ({ onFocusChange: (next) => update({ focus: next }) }),
    initial: "none",
    name: "focus",
    next: "2026-08-16T09:00",
    read: (state) => state.focus?.cell ?? "none",
  },
  {
    apply: (actions) => actions.setTimeZone("UTC"),
    controlled: Object.freeze({ timeZone: "Asia/Tbilisi" }),
    createHandlers: (update) => ({ onTimeZoneChange: (next) => update({ timeZone: next }) }),
    initial: "Asia/Tbilisi",
    name: "timeZone",
    next: "UTC",
    read: (state) => state.timeZone,
  },
  {
    apply: (actions) => actions.setExpandedResourceIds(["resource-1"]),
    controlled: Object.freeze({ expandedResourceIds: Object.freeze([]) }),
    createHandlers: (update) => ({
      onExpandedResourceIdsChange: (next) => update({ expandedResourceIds: next }),
    }),
    initial: "none",
    name: "expandedResourceIds",
    next: "resource-1",
    read: (state) => state.expandedResourceIds.join(",") || "none",
  },
] satisfies readonly ControlledStateMatrixCase[]);
