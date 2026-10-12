# @moltenship/calendar-dnd API report

Made by `vp run release:api:update` from the built declarations. Don't edit it by hand. When the public API changes on purpose, regenerate the report and review its diff with the change.

## `@moltenship/calendar-dnd`

```ts
import {
  CalendarAnnouncer,
  CalendarDraft,
  CalendarEventProposal,
  CalendarPolicyResult,
  CalendarTransactionResult,
  EventId,
  EventSnapshot,
  ResourceId,
  TimeGridColumn,
} from "@moltenship/calendar-core";
import {
  RefCallback,
} from "react";
import {
  WallTimeSnapOptions,
} from "@moltenship/calendar-temporal";

interface CalendarPointerOptions<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly events: EventSnapshot<TEvent, TEventId, TResourceId>;
  readonly onPropose: (proposal: CalendarEventProposal<TEventId, TResourceId>) => void | PromiseLike<CalendarTransactionResult<TEvent, TEventId, TResourceId>>;
  readonly timeZone: string;
  readonly announcer?: CalendarAnnouncer;
  readonly check?: (proposal: CalendarEventProposal<TEventId, TResourceId>) => CalendarPolicyResult<TEvent, TEventId, TResourceId> | null;
  readonly columns?: readonly TimeGridColumn[];
  readonly disabled?: boolean;
  readonly onPreview?: (draft: CalendarDraft<TEventId, TResourceId> | null) => void;
  readonly ghostClassName?: string;
  readonly scrollContainer?: {
    readonly current: Element | null;
  };
  readonly snap?: WallTimeSnapOptions;
}
export declare function attachCalendarPointer<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(region: HTMLElement, getOptions: () => CalendarPointerOptions<TEvent, TEventId, TResourceId>): () => void;
export declare function eventIdAttributes(id: EventId): {
  readonly "data-event-id": string;
  readonly "data-event-id-type"?: "number";
};
export declare function eventIdOf(element: Element): EventId | null;
export declare function resourceIdAttributes(id: ResourceId | null): {
  readonly "data-resource-id": string;
  readonly "data-resource-id-type"?: "number";
};
export declare function resourceIdOf(element: Element): ResourceId | null | undefined;
export declare function useCalendarPointer<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(options: CalendarPointerOptions<TEvent, TEventId, TResourceId>): RefCallback<HTMLElement>;

export {
  type CalendarPointerOptions,
};
```
