import type {
  AnnotationSnapshotIssue,
  AvailabilityIssue,
  CalendarEventProposal,
  CalendarFocus,
  CalendarPolicyResult,
  CalendarProposalDetail,
  CalendarSelection,
  CalendarTransactionResult,
  EventId,
  EventSnapshotIssue,
  ResourceId,
  SecondaryTimeZoneIssue,
} from "@moltenship/calendar-core";
import type { InstantInterval, PlainDateInterval } from "@moltenship/calendar-temporal";

import type { CalendarActions, CalendarCommandOptions } from "./types";

export type CalendarSemanticActions<
  TView extends string = string,
  TSelection = CalendarSelection,
  TFocus = CalendarFocus,
  TResourceId extends ResourceId = ResourceId,
  TEvent = unknown,
  TEventId extends EventId = EventId,
> = CalendarActions<TView, TSelection, TFocus, TResourceId> & {
  navigateNext(options?: CalendarCommandOptions): void;
  navigatePrevious(options?: CalendarCommandOptions): void;
  navigateToday(options?: CalendarCommandOptions): void;
  /**
   * Runs a change through the root's policies without showing or saving it, as a gesture's
   * preview does: `rejected` with the reason `proposeEventChange` would give, or `accepted`, with
   * any `change.warnings`. `null` for an unknown event, or when a policy answers asynchronously.
   * Policies read `detail`, `{ input: "api" }` by default, as `proposeEventChange` gives it.
   */
  readonly checkEventChange: (
    proposal: CalendarEventProposal<TEventId, TResourceId, TEvent>,
    detail?: CalendarProposalDetail,
  ) => CalendarPolicyResult<TEvent, TEventId, TResourceId> | null;
  /**
   * Validates a change against the root's policies, shows it while `onEventChange` persists it,
   * and resolves with the outcome, which `onEventChangeResult` hears first, with `detail` as
   * given. Read-only events and roots without `onEventChange` reject. `detail.input` names the
   * input that made the proposal, `"api"` by default. A plain function, so it can be passed on as
   * a callback.
   */
  readonly proposeEventChange: (
    proposal: CalendarEventProposal<TEventId, TResourceId, TEvent>,
    detail?: CalendarProposalDetail,
  ) => Promise<CalendarTransactionResult<TEvent, TEventId, TResourceId>>;
};

export type CalendarDiagnostic<TEvent, TEventId extends EventId> =
  | {
      readonly code: "unregistered-active-view";
      readonly severity: "error";
      readonly viewName: string;
    }
  | {
      readonly code: "invalid-event";
      readonly issue: EventSnapshotIssue<TEvent, TEventId>;
      readonly severity: "error";
    }
  | {
      readonly code: "invalid-annotation";
      readonly issue: AnnotationSnapshotIssue;
      readonly severity: "error";
    }
  | {
      readonly code: "invalid-availability";
      readonly issue: AvailabilityIssue;
      readonly severity: "error";
    }
  | {
      readonly code: "invalid-secondary-time-zone";
      readonly issue: SecondaryTimeZoneIssue;
      readonly severity: "error";
    };

export interface CalendarPartIds {
  readonly frame: string;
  readonly title: string;
  readonly viewport: string;
}

/** The ids a root's chrome parts point at each other with. */
export function createCalendarPartIds(instanceId: string): CalendarPartIds {
  return Object.freeze({
    frame: `${instanceId}-frame`,
    title: `${instanceId}-title`,
    viewport: `${instanceId}-viewport`,
  });
}

/** What the active view shows and which events it needs, as `onVisibleRangeChange` reports it. */
export interface CalendarVisibleRange<TView extends string = string> {
  /** `range` resolved to instants in the display time zone. */
  readonly instantRange: InstantInterval;
  /** `loadRange` resolved to instants in the display time zone. */
  readonly loadInstantRange: InstantInterval;
  /**
   * The dates to have events for: `range`, plus the pages a scrolling view keeps ready on each
   * side, so a swipe shows their events at once.
   */
  readonly loadRange: PlainDateInterval;
  /** The visible dates. */
  readonly range: PlainDateInterval;
  readonly view: TView;
}
