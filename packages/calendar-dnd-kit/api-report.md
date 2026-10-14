# @moltenship/calendar-dnd-kit API report

Made by `vp run release:api:update` from the built declarations. Don't edit it by hand. When the public API changes on purpose, regenerate the report and review its diff with the change.

## `@moltenship/calendar-dnd-kit`

```ts
import {
  CalendarDropSource,
} from "@moltenship/calendar-dnd";
import {
  CalendarEventPlacement,
  EventId,
  ResourceId,
} from "@moltenship/calendar-core";
import {
  DragDropManager,
} from "@dnd-kit/dom";

export declare function CalendarDndKit(): null;
interface CalendarEventDragData<TEvent = unknown, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId> {
  readonly event: TEvent;
  readonly eventId: TEventId;
  readonly placement: CalendarEventPlacement<TResourceId>;
}
type WithData = {
  readonly data?: unknown;
} | null | undefined;
export declare function calendarDropData<TEvent, TEventId extends EventId = EventId>(source: CalendarDropSource<TEvent, TEventId>): {
  readonly [dropKey]: CalendarDropSource<TEvent, TEventId>;
};
export declare function calendarDropOf<TEvent = unknown, TEventId extends EventId = EventId>(source: WithData): CalendarDropSource<TEvent, TEventId> | null;
export declare function calendarEventOf<TEvent = unknown, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId>(source: WithData): CalendarEventDragData<TEvent, TEventId, TResourceId> | null;
export declare const calendarEventType = "moltenship-calendar-event";
export declare function connectCalendarDragDrop(manager: DragDropManager): () => void;
declare const dropKey = "@moltenship/calendar-drop";
export declare function isCalendarTarget(target: WithData): boolean;

export {
  type CalendarEventDragData,
};
```
