import type { PlainDateInterval, WallTimeSnapOptions } from "@moltenship/calendar-temporal";

import type { CalendarEnvironmentBase } from "../environment";
import type { CalendarFocus } from "./focus";

/**
 * A navigation key, by meaning. `"enter"` moves into the focused cell's events and `"exit"` back
 * out to the cell an event sits in.
 */
export type CalendarNavigationCommand =
  | "down"
  | "end"
  | "enter"
  | "exit"
  | "home"
  | "left"
  | "page-down"
  | "page-up"
  | "right"
  | "up";

export interface CalendarSpatialNavigationInput<TProjection, TOptions> {
  readonly command: CalendarNavigationCommand;
  readonly environment: CalendarEnvironmentBase;
  /**
   * The focus to move from. `null` asks where focus enters the view: its last target for
   * `"end"`, as after paging back past its start, and its default entry for any other command.
   */
  readonly focus: CalendarFocus | null;
  readonly options: TOptions;
  readonly projection: TProjection;
  /** The visible dates. */
  readonly range: PlainDateInterval;
  /** Length and alignment of time-grid slots. */
  readonly snap: WallTimeSnapOptions;
}

/**
 * Where focus goes. A focus outside the visible range navigates the view to show it; `page`
 * navigates by whole ranges when the next target is not known yet, as in an agenda, and focus
 * then enters the new range from its start (`1`) or end (`-1`).
 */
export type CalendarSpatialNavigation =
  | { readonly focus: CalendarFocus }
  | { readonly page: -1 | 1 };
