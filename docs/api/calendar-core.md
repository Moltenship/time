# `@moltenship/calendar-core`

`@moltenship/calendar-core` is the framework-independent event engine. It accepts application-owned
records through an `EventAdapter`, validates and normalizes them once per immutable array snapshot,
and exposes read-only interval/resource queries. It imports no React or DOM APIs.

## Building and reusing snapshots

Create one cache for each stable adapter identity and reuse it for the lifetime of the calendar
consumer:

```ts
const snapshots = createEventSnapshotCache(eventAdapter, {
  invalidEventPolicy: "report-and-skip",
  queryCacheSize: 128,
});

const snapshot = snapshots.getSnapshot(events);
```

Calling `getSnapshot` again with the same immutable array returns the same `EventSnapshot` object.
A new array is traversed exactly once and advances the cache-local monotonic `version`. The
one-shot `createEventSnapshot(events, adapter, options)` helper is available when cross-call reuse
is not needed.

If an adapter implements `getRevision`, recreated records with the same ID and revision reuse their
normalized structure and indexes. The revision must change whenever any adapter-derived title,
interval, resource assignment, or read-only value changes. The snapshot still exposes the newest
application record through `normalized.event`.

## Query surface

Each time meaning has a separate half-open query:

```ts
snapshot.queryTimed(instantInterval(startInstant, endInstant));
snapshot.queryAllDay(plainDateInterval(startDate, endDate));
snapshot.queryFloating(plainDateTimeInterval(startDateTime, endDateTime));

snapshot.queryTimed(range, { resourceIds: [roomId] });
snapshot.eventsForResource(roomId);
snapshot.get(eventId);
```

Results preserve immutable input order. Resource filters match events assigned to any requested
resource; an empty resource list matches nothing. Exact repeated queries return the same frozen
result while resident in the bounded LRU. `getQueryCacheStatistics()` exposes capacity, size, hit,
miss, and eviction counts for diagnostics.

The timed, all-day, and floating indexes use exact bigint keys derived from native Temporal values.
No value passes through legacy `Date` or lossy numeric milliseconds. The selected interval-tree
package remains an internal implementation detail; neither its classes nor its closed-range
semantics escape this package.

## Invalid records

The default `"report-and-skip"` policy keeps valid events and records immutable issues on
`snapshot.issues`. It covers adapter failures, malformed or duplicate IDs, invalid resource IDs,
invalid revisions, malformed interval variants, and empty/reversed intervals. Applications can
forward the immutable issue list to their diagnostics layer. An accessor that throws is reported
as `adapter-error`; a returned interval with throwing structural properties, the wrong native
Temporal endpoint kind, or a non-string timed `sourceTimeZone` is reported as
`invalid-event-interval`.

Use `invalidEventPolicy: "throw"` to reject the complete input with
`InvalidCalendarEventSnapshotError`. No partially built strict snapshot is published.

## Advanced event sources

High-frequency external stores may provide already-versioned snapshots without handing React a new
full array on every update:

```ts
interface CalendarEventSource<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
  getSnapshot(): EventSnapshot<TEvent, TEventId, TResourceId>;
  getServerSnapshot(): EventSnapshot<TEvent, TEventId, TResourceId>;
  subscribe(listener: () => void): () => void;
}
```

The source owns subscription and server-snapshot identity. The calendar remains a consumer: it
does not fetch, persist, or mutate application events.

## Runtime and package guarantees

- The package compiles against `ESNext` without DOM or ambient package types.
- React, Jotai, dnd-kit, Tailwind, browser globals, and dependency-owned interval-tree types do not
  cross the public entry point.
- Packed declarations are compiled in the engine API matrix through the package export.
- The production ESM entry must remain at or below 72 KiB raw and 18 KiB gzip. The package build
  enforces both budgets against the emitted artifact.
