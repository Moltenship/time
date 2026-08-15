# Canonical contract surface

The foundation packages expose only contracts that already have an owning implementation boundary:

- `@moltenship/calendar-temporal` owns native Temporal types, validated half-open intervals,
  type-specific comparison and interval operations, bounded date/instant iteration, month/week
  grids, PlainTime/Instant snapping, and injected clocks.
- `@moltenship/calendar-core` owns IDs, canonical events, application adapters, resources,
  environment, view strategy/renderer boundaries, policies, and transactions.
- `@moltenship/calendar` re-exports the supported core surface. It will add supported React exports
  when the React integration issue lands.

Internal validation brands and native-global access stay behind those entry points. Package source
paths are not public APIs.

## Application-native records

Consumers can preserve branded domain identifiers and records without a parallel calendar model:

```ts
import { defineEventAdapter } from "@moltenship/calendar";

declare const eventIdBrand: unique symbol;
declare const roomIdBrand: unique symbol;

type EventId = string & { readonly [eventIdBrand]: true };
type RoomId = number & { readonly [roomIdBrand]: true };

interface ApiEvent {
  readonly endsAt: Temporal.Instant;
  readonly id: EventId;
  readonly roomIds: readonly RoomId[];
  readonly startsAt: Temporal.Instant;
  readonly summary: string;
}

const eventAdapter = defineEventAdapter<ApiEvent>()({
  getId: (event) => event.id,
  getInterval: (event) => ({
    end: event.endsAt,
    kind: "timed",
    start: event.startsAt,
  }),
  getResourceIds: (event) => event.roomIds,
  getTitle: (event) => event.summary,
});
```

The curried definition preserves `ApiEvent`, `EventId`, and `RoomId` inference. No consumer cast is
required.

## Validation boundary

Canonical variants make time meaning explicit: timed events use instants, all-day events use plain
dates, and floating events use plain date-times. External inputs still require runtime validation:
IDs must be non-empty strings or finite numbers, and every event interval must satisfy `start < end`.
The validation APIs return discriminated results; throwing interval constructors are available only
when rejection is the desired control flow.
