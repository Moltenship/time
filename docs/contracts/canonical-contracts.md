# Canonical contract surface

The foundation packages expose only contracts that already have an owning implementation boundary:

- `@moltenship/calendar-temporal` owns native Temporal types, validated half-open intervals,
  type-specific comparison and interval operations, bounded date/instant iteration, month/week
  grids, PlainTime/Instant snapping, zoned-day boundaries and splitting, explicit gap/fold
  projection, transition-aware wall slots, machine keys, and injected clocks/environments.
- `@moltenship/calendar-core` owns IDs, canonical events, application adapters, resources,
  normalized snapshots, interval/resource queries, advanced event sources, environment, view
  strategy/renderer boundaries, policies, and transactions.
- `@moltenship/calendar-react` owns per-instance controllable state, semantic actions and hooks,
  render-scoped controlled readers, selector subscriptions, store injection, the typed factory,
  compound context, custom-view registration, capabilities, diagnostics, and React/SSR binding.
  Jotai atoms and stores are private implementation details.
- `@moltenship/calendar` re-exports the supported core and React surfaces behind one React client
  boundary.

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

## Immutable event snapshots

`createEventSnapshotCache(adapter)` is the array-input normalization boundary. Stable immutable
array identity reuses the complete snapshot; a new array advances a monotonic version and performs
one pass. Adapter revisions permit structural reuse when application records are recreated without
semantic changes.

Snapshots expose read-only `byId` and normalized event collections plus type-specific timed,
all-day, floating, and resource queries. Query results are stable in input order and cached only in
a bounded LRU. Invalid events report and skip by default or reject the complete build in strict
mode. `CalendarEventSource` is the advanced subscription contract for application stores that
already own versioned client and server snapshots.

## Validation boundary

Canonical variants make time meaning explicit: timed events use instants, all-day events use plain
dates, and floating events use plain date-times. External inputs still require runtime validation:
IDs must be non-empty strings or finite numbers, and every event interval must satisfy `start < end`.
The validation APIs return discriminated results; throwing interval constructors are available only
when rejection is the desired control flow.
