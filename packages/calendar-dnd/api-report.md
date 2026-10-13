# @moltenship/calendar-dnd API report

Made by `vp run release:api:update` from the built declarations. Don't edit it by hand. When the public API changes on purpose, regenerate the report and review its diff with the change.

## `@moltenship/calendar-dnd`

```ts
import {
  CalendarAnnouncer,
  CalendarDraft,
  CalendarEventPlacement,
  CalendarEventProposal,
  CalendarPolicyResult,
  CalendarProposalDetail,
  CalendarTransactionResult,
  EventId,
  EventSnapshot,
  NormalizedCalendarEvent,
  ResourceId,
  TimeGridColumn,
} from "@moltenship/calendar-core";
import {
  RefCallback,
} from "react";
import {
  WallTimeSnapOptions,
} from "@moltenship/calendar-temporal";

interface CalendarDragFollower {
  readonly claims?: () => boolean;
  readonly end?: (dropped: boolean) => void;
  readonly move?: (point: CalendarPoint) => void;
}
type CalendarDragMonitor = (drag: CalendarEventDrag) => CalendarDragFollower | void;
interface CalendarDropOptions {
  readonly input?: "keyboard" | "pointer";
}
interface CalendarDropSession<TEvent = unknown, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId> {
  readonly cancel: () => void;
  readonly drop: () => Promise<CalendarTransactionResult<TEvent, TEventId, TResourceId> | null>;
  readonly move: (point: CalendarPoint | null) => void;
  readonly placement: CalendarEventPlacement<TResourceId> | null;
}
interface CalendarDropSource<TEvent = unknown, TEventId extends EventId = EventId> {
  readonly days?: number;
  readonly duration?: Temporal.Duration | Temporal.DurationLike;
  readonly event?: TEvent;
  readonly eventId?: TEventId;
  readonly title?: string;
}
interface CalendarEventDrag<TEvent = unknown, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId> {
  readonly element: HTMLElement;
  readonly event: NormalizedCalendarEvent<TEvent, TEventId, TResourceId>;
  readonly origin: CalendarPoint;
  readonly refresh: () => void;
}
interface CalendarPoint {
  readonly x: number;
  readonly y: number;
}
interface CalendarPointerOptions<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly events: EventSnapshot<TEvent, TEventId, TResourceId>;
  readonly onPropose: (proposal: CalendarEventProposal<TEventId, TResourceId, TEvent>, detail: CalendarProposalDetail) => void | PromiseLike<CalendarTransactionResult<TEvent, TEventId, TResourceId>>;
  readonly timeZone: string;
  readonly announcer?: CalendarAnnouncer;
  readonly check?: (proposal: CalendarEventProposal<TEventId, TResourceId, TEvent>) => CalendarPolicyResult<TEvent, TEventId, TResourceId> | null;
  readonly columns?: readonly TimeGridColumn[];
  readonly disabled?: boolean;
  readonly onPreview?: (draft: CalendarDraft<TEventId, TResourceId> | null) => void;
  readonly ghostClassName?: string;
  readonly scrollContainer?: {
    readonly current: Element | null;
  };
  readonly snap?: WallTimeSnapOptions;
}
interface CalendarRegion {
  readonly disabled: boolean;
  readonly element: HTMLElement;
}
export declare function attachCalendarPointer<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(region: HTMLElement, getOptions: () => CalendarPointerOptions<TEvent, TEventId, TResourceId>): () => void;
export declare function eventIdAttributes(id: EventId): {
  readonly "data-event-id": string;
  readonly "data-event-id-type"?: "number";
};
export declare function eventIdOf(element: Element): EventId | null;
export declare function monitorCalendarDrags(monitor: CalendarDragMonitor): () => void;
export declare function observeCalendarRegions(observer: (regions: readonly CalendarRegion[]) => void): () => void;
export declare function resourceIdAttributes(id: ResourceId | null): {
  readonly "data-resource-id": string;
  readonly "data-resource-id-type"?: "number";
};
export declare function resourceIdOf(element: Element): ResourceId | null | undefined;
export declare function startCalendarDrop<TEvent = unknown, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId>(source: CalendarDropSource<TEvent, TEventId>, { input }?: CalendarDropOptions): CalendarDropSession<TEvent, TEventId, TResourceId>;
export declare function useCalendarPointer<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(options: CalendarPointerOptions<TEvent, TEventId, TResourceId>): RefCallback<HTMLElement>;

export {
  type CalendarDragFollower,
  type CalendarDragMonitor,
  type CalendarDropOptions,
  type CalendarDropSession,
  type CalendarDropSource,
  type CalendarEventDrag,
  type CalendarPoint,
  type CalendarPointerOptions,
  type CalendarRegion,
};
```
