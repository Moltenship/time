# Moltenship Time — Calendar Architecture

Time is a Temporal-native, React 19 calendar system built on five principles: application data remains authoritative; performance comes from indexed projections and bounded rendering rather than later optimization; every interaction is controllable and accessible; consumers own the visual source while upgradeable engines own difficult algorithms; and public contracts stay typed, deterministic, composable, and SSR-safe.

> **Status:** Proposed architecture
> **Repository:** `github.com/Moltenship/time`
> **Primary package:** `@moltenship/calendar`
> **Registry item:** `@moltenship/calendar`
> **Runtime target:** React 19+, modern ESM, native `Temporal`, Node.js 26+, any React-capable SSR framework
> **TypeScript target:** current TypeScript with `compilerOptions.lib: ["ESNext"]`
> **Date policy:** no `Date`, no bundled polyfill, ISO-8601 chronology in v1

This document is the normative architecture contract. The companion `architecture.html` is its visual reading surface. If the two disagree, this file wins.

## 1. Decisions at a glance

| Concern            | Decision                                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Distribution       | Hybrid: versioned headless engines on npm; editable React presentation source through a shadcn registry.                                             |
| Framework          | React 19 web only. Core packages remain framework- and DOM-independent.                                                                              |
| Event ownership    | Events are immutable external snapshots supplied by the application. The calendar never becomes the persistence authority.                           |
| Event typing       | Canonical generic event types plus an accessor-based `EventAdapter<TEvent>` for application-native records.                                          |
| Time model         | Timed events use `Temporal.Instant`; all-day events use `Temporal.PlainDate`; floating events use `Temporal.PlainDateTime`.                          |
| Interval semantics | Every core interval is half-open: `[start, end)`.                                                                                                    |
| Timezones          | Timed events are projected into one display timezone. DST gaps/folds use an explicit, configurable disambiguation policy.                            |
| State              | Per-calendar store; independently controlled/uncontrolled state slices; Jotai is private implementation detail.                                      |
| Views              | Day, week, month, list/agenda, resource columns, and resource timeline ship as explicit view definitions. Custom views use a stable plugin contract. |
| Resources          | An event can have zero-to-many resources. Both day-by-resource columns and horizontal resource timelines are first-class.                            |
| Interaction        | dnd-kit is isolated behind an adapter. Pointer, touch, keyboard, and explicit edit actions produce the same typed transaction.                       |
| Recurrence         | Separate post-foundation package; the base contracts reserve occurrence identity without implementing RRULE expansion in v1.                         |
| Styling            | Tailwind CSS 4 and shadcn tokens in registry source; no Tailwind dependency in headless packages.                                                    |
| SSR                | Full deterministic server markup when environment inputs are provided; no browser globals at module scope.                                           |
| Performance target | 10,000 loaded events, 1,000 visible fragments, and 500 resources with bounded DOM and no React commit on pointer movement.                           |
| Accessibility      | WCAG 2.2 AA is a release gate, including keyboard create/move/resize and screen-reader announcements.                                                |

## 2. Architectural shape

The system is deliberately split into four planes. A plane may depend only on planes above it.

```text
Application plane
  fetched records · persistence · business rules · authorization
                          │
                          ▼
Presentation plane — source installed into the consumer repository
  compound components · default views · Tailwind/shadcn styles · app dialogs
                          │
                          ▼
React integration plane — versioned npm packages
  provider · typed selectors/actions/meta · state bridge · dnd adapter
                          │
                          ▼
Engine plane — versioned, framework-independent npm packages
  Temporal utilities · normalization · interval indexes · projections · layouts
```

The application owns facts. The engine derives render models. React binds those models to fine-grained subscriptions. Registry source decides what the user sees.

### Dependency law

1. Temporal utilities never import React, Jotai, dnd-kit, DOM types, CSS, or application types.
2. Core never imports React, Jotai, dnd-kit, DOM types, or registry source.
3. React bindings may import core and Jotai, but not default view source.
4. The dnd adapter may import the React bindings, core interaction contracts, and dnd-kit.
5. Registry source may import all public packages and ordinary shadcn components.
6. The showcase consumes packages and registry output exactly as an end user would.
7. No package may deep-import another package's `src/` directory.

## 3. Repository and package topology

```text
time/
├── apps/
│   ├── showcase/                 # documentation, examples, stress and DST labs
│   └── ssr-fixture/              # render/hydrate verification in a real SSR boundary
├── packages/
│   ├── calendar-temporal/        # standalone Temporal calendar utilities
│   ├── calendar-core/            # data/index/layout/view/transaction engine
│   ├── calendar-react/           # React provider, store bridge, hooks, primitives
│   ├── calendar-dnd/             # optional dnd-kit interaction adapter
│   ├── calendar/                 # DX-first public facade
│   ├── calendar-testing/         # fixtures, harnesses and semantic test helpers
│   └── calendar-recurrence/      # reserved; implemented after the foundation
├── registry/
│   ├── calendar/                 # root, toolbar, shared renderers
│   ├── month-view/
│   ├── time-grid-view/           # day + week
│   ├── list-view/
│   ├── resource-columns-view/
│   ├── resource-timeline-view/
│   ├── calendar-dnd/
│   ├── calendar-theme/
│   └── calendar-full/            # compositional registry block
├── benchmarks/
│   ├── core/                     # indexes, projection, overlap layout
│   └── react/                    # commits, DOM bounds, pointer and scroll frames
├── docs/
│   ├── adr/                      # one consequential decision per record
│   └── contracts/                # generated API and compatibility tables
├── tools/
│   ├── registry/                 # registry schema/build verification
│   └── fixtures/                 # deterministic event/resource generators
├── architecture.md
└── architecture.html
```

The existing `apps/website` and `packages/utils` starter directories should be renamed only when implementation begins. This architecture task does not silently repurpose them.

### Published packages

| Package                           | Responsibility                                                                                                                | Runtime dependencies                                                                      | Public stability                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `@moltenship/calendar-temporal`   | Type-specific ranges, grids, timezone projection, slots, rounding, keys, and interval helpers.                                | None                                                                                      | Stable, standalone                                |
| `@moltenship/calendar-core`       | Event adapters, normalized snapshots, interval indexes, view strategies, fragments, layout engines, policies, transactions.   | `calendar-temporal`; provisional `@flatten-js/interval-tree` behind an internal interface | Stable                                            |
| `@moltenship/calendar-react`      | Per-instance provider, controlled state bridge, selectors, actions, meta, headless primitives, custom-view renderer contract. | `calendar-core`, Jotai; React 19 peer                                                     | Stable                                            |
| `@moltenship/calendar-dnd`        | dnd-kit sensors, geometry adapter, overlay, auto-scroll, accessibility announcements.                                         | `calendar-core`, `calendar-react`; dnd-kit peers                                          | Stable adapter; dnd-kit types are not re-exported |
| `@moltenship/calendar`            | The ergonomic entry point used by most consumers. Re-exports supported React and core contracts.                              | `calendar-react`, `calendar-core`                                                         | Stable facade                                     |
| `@moltenship/calendar-testing`    | Deterministic clocks, event builders, keyboard drivers, view harnesses, assertions.                                           | Public calendar packages                                                                  | Stable after v1                                   |
| `@moltenship/calendar-recurrence` | Series/occurrence expansion, exceptions, detached instances, RRULE boundary.                                                  | `calendar-core`, `calendar-temporal`                                                      | Post-foundation                                   |

Package versions move in lockstep until after `1.0`. The repository lockfile pins exact implementation dependencies; published packages expose narrow peer ranges for React and optional adapters.

### External dependency ledger

| Dependency line                       | Used by                            | Why it exists                                                     | Containment rule                                                  |
| ------------------------------------- | ---------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| React 19                              | `calendar-react`, facade, registry | Rendering, context, refs, SSR, external-store subscription        | Peer dependency; absent from core and Temporal utilities          |
| Jotai 2                               | `calendar-react`                   | Per-instance vanilla store and fine-grained derived subscriptions | Private atoms; no Jotai type in the public calendar API           |
| `@dnd-kit/react` + `@dnd-kit/dom` 0.x | `calendar-dnd`                     | Maintained pointer/touch/keyboard and accessibility substrate     | Exact lockfile pin; wrapped behind semantic interaction contracts |
| TanStack Virtual 3                    | List and resource registry views   | Maintained vertical/horizontal windowing and measurement          | Hidden behind view adapters; not required by core                 |
| `@flatten-js/interval-tree` 2         | `calendar-core` provisionally      | Established interval-query baseline                               | Hidden behind `IntervalIndex`; retained only if benchmarks pass   |
| Tailwind CSS 4 + shadcn registry      | Consumer-owned registry source     | Theme-token compatibility and source distribution                 | No runtime import in headless packages                            |
| `fast-check` 4                        | Test workspace                     | Property-based interval, range, and index verification            | Development only                                                  |
| Playwright + axe-core                 | Browser and SSR fixtures           | Browser, hydration, interaction, visual, and accessibility proof  | Development only                                                  |

Exact patch versions are chosen and pinned when implementation begins. The architecture commits to the boundary and major line, not to an untested floating dependency.

### Registry composition

The registry is not a second package manager. It distributes the source users are expected to change.

- `@moltenship/calendar` installs the practical default set.
- Individual view items support smaller installations.
- `calendar-full` depends on the other registry items instead of duplicating their files.
- Registry items declare npm dependencies, registry dependencies, CSS variables, and explicit target paths.
- A registry compatibility field records the minimum compatible runtime package version.
- No custom CLI is introduced in v1; the maintained shadcn CLI is the installer.

## 4. Time and interval model

### 4.1 Native Temporal boundary

The library assumes native `Temporal` exists in every target runtime. It does not:

- import or depend on `@js-temporal/polyfill`;
- mutate `globalThis`;
- feature-detect and conditionally load a polyfill;
- accept legacy `Date` in public core contracts.

An application may install its own global polyfill before importing the calendar. That decision remains outside the library.

TypeScript consumers use the current compiler with `compilerOptions.lib: ["ESNext"]`. Temporal is the
ambient standard global, like other built-in platform APIs; packages use `Temporal.*` directly and
do not depend on or re-export a separate Temporal namespace.

### 4.2 Canonical event shape

```ts
export type EventId = string | number;
export type ResourceId = string | number;

export interface CalendarEventBase<
  TData,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
  id: TEventId;
  title: string;
  resourceIds?: readonly TResourceId[];
  data: TData;
}

export interface TimedCalendarEvent<
  TData = unknown,
  TEventId extends EventId = string,
  TResourceId extends ResourceId = string,
> extends CalendarEventBase<TData, TEventId, TResourceId> {
  kind: "timed";
  start: Temporal.Instant;
  end: Temporal.Instant;
  sourceTimeZone?: string;
}

export interface AllDayCalendarEvent<
  TData = unknown,
  TEventId extends EventId = string,
  TResourceId extends ResourceId = string,
> extends CalendarEventBase<TData, TEventId, TResourceId> {
  kind: "all-day";
  start: Temporal.PlainDate;
  end: Temporal.PlainDate;
}

export interface FloatingCalendarEvent<
  TData = unknown,
  TEventId extends EventId = string,
  TResourceId extends ResourceId = string,
> extends CalendarEventBase<TData, TEventId, TResourceId> {
  kind: "floating";
  start: Temporal.PlainDateTime;
  end: Temporal.PlainDateTime;
}

export type CalendarEvent<TData = unknown> =
  TimedCalendarEvent<TData> | AllDayCalendarEvent<TData> | FloatingCalendarEvent<TData>;
```

Color, permissions, avatars, status, room capacity, and application-specific fields live in `data` or the application event itself. The engine does not grow a universal event schema.

### 4.3 Application-native event records

Fetched JSON usually contains strings and application-specific fields. Consumers should not have to duplicate records merely to render them.

```ts
interface EventAdapter<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  getId(event: TEvent): TEventId;
  getTitle(event: TEvent): string;
  getInterval(event: TEvent): CalendarEventInterval;
  getResourceIds(event: TEvent): readonly TResourceId[];
  isReadOnly?(event: TEvent): boolean;
  getRevision?(event: TEvent): string | number;
}

const eventAdapter = defineEventAdapter<ApiEvent>()({
  getId: (event) => event.id,
  getTitle: (event) => event.summary,
  getInterval: (event) => ({
    kind: "timed",
    start: Temporal.Instant.from(event.startsAt),
    end: Temporal.Instant.from(event.endsAt),
    sourceTimeZone: event.timeZone,
  }),
  getResourceIds: (event) => event.roomIds,
});
```

The default adapter is an identity adapter for `CalendarEvent<TData>`. Normalization occurs once per input snapshot, never inside a cell renderer or pointer frame.

### 4.4 Half-open intervals

Every internal and public interval uses `[start, end)`.

- Adjacent events do not overlap.
- One all-day date is `[2026-08-15, 2026-08-16)`.
- A range query intersects when `event.start < range.end && event.end > range.start`.
- `start === end` is invalid for an event, but may be valid for a cursor or selection anchor type.
- Closed-range iteration, if offered, is named explicitly (`datesInClosedRange`) and is never used for event math.

This replaces the inclusive range behavior of the earlier prototype.

### 4.5 Display timezone and DST

`Calendar.Root` receives one IANA display timezone. Timed events are stored as instants and projected into that zone. `sourceTimeZone` preserves edit context but does not determine display placement.

Day and week views use wall-clock axes. DST behavior is explicit:

- Spring gaps are represented as unavailable wall-time segments.
- Fall folds can represent both offsets; event fragments retain instant identity so the repeated hour is not conflated.
- Creating or moving into a gap uses a configurable `TemporalDisambiguation` policy.
- The default is `"compatible"`, and any automatic shift is included in the transaction and announced to assistive technology.
- Policies may reject the proposal instead.

No helper reads the host machine timezone implicitly. `Temporal.Now` is accessed only through an injected clock/environment boundary.

### 4.6 Calendar scope

V1 promises ISO-8601/Gregorian arithmetic with arbitrary locale, numbering system, display timezone, week start, and RTL layout. Other Temporal calendars are an architectural extension point, not a v1 compatibility promise.

## 5. Standalone Temporal utilities

`@moltenship/calendar-temporal` is calendar-focused, tree-shakeable, and type-specific. It is not a new `date-fns`.

```text
src/
├── intervals/       # compare, intersect, clamp, contains, split
├── plain-date/      # week/month grids, iteration, date keys
├── plain-time/      # slot generation and snapping
├── instant/         # instant ranges and duration-safe comparisons
├── zoned/           # day boundaries, projection, DST gaps/folds
├── grids/           # month/week visible ranges
├── clock/           # deterministic clock interface
└── index.ts         # intentional public exports only
```

Rules:

1. Helpers accept and return one clear Temporal type; no polymorphic `startOf(anything, unit)` API.
2. Formatting delegates to native `Intl.DateTimeFormat`; the package does not invent format tokens.
3. Parsing is limited to Temporal-supported machine formats; no fuzzy natural-language parser.
4. Week functions require explicit week rules or locale-derived rules at the boundary.
5. Iterators are lazy where ranges may be large.
6. Every DST-sensitive helper requires a timezone and disambiguation policy.
7. Each module has property tests for ordering, adjacency, boundaries, and round trips.

Representative API:

```ts
plainDateRange(start, end);
iteratePlainDates(range);
monthGrid(date, { weekStartsOn, fixedWeeks });
weekRange(date, { weekStartsOn });
zonedDayRange(date, timeZone);
splitInstantRangeByZonedDay(range, timeZone);
roundPlainTime(time, { smallestUnit, increment, roundingMode });
slotsInZonedDay(date, timeZone, slotDuration);
plainDateIntervalsIntersect(left, right);
intersectPlainDateIntervals(left, right);
clampPlainDateInterval(interval, bounds);
```

## 6. Event snapshots and indexes

### 6.1 Input forms

The normal React API accepts an immutable array snapshot:

```tsx
<TeamCalendar.Root events={events} eventAdapter={eventAdapter} />
```

For high-frequency external stores, an advanced source avoids rebuilding from full arrays:

```ts
interface CalendarEventSource<TEvent> {
  getSnapshot(): EventSnapshot<TEvent>;
  getServerSnapshot(): EventSnapshot<TEvent>;
  subscribe(listener: () => void): () => void;
}
```

Both forms preserve external ownership. The calendar never fetches data or mutates backend records.

### 6.2 Normalized snapshot

A snapshot contains:

- `byId`: stable identity lookup;
- timed interval index keyed by epoch time;
- all-day interval index keyed by ISO epoch day;
- floating interval index keyed by local ISO fields;
- resource-to-event indexes;
- per-event revision and validation status;
- a monotonic snapshot version;
- memoized query/projection caches bounded by LRU limits.

The interval-tree implementation is wrapped behind an internal `IntervalIndex` interface. Its types never escape the core package, so it can be replaced only after benchmark evidence and an ADR.

### 6.3 Snapshot lifecycle

- Stable `events` and adapter identities reuse the complete snapshot.
- A new array identity triggers one normalization/index pass, not work per rendered component.
- Development diagnostics identify duplicate IDs, invalid intervals, mutable snapshots, and unstable adapters.
- A revision accessor permits structural reuse when event objects are recreated but unchanged.
- Production invalid-event behavior is configurable: report and skip by default; strict mode throws.
- Async/worker indexing can implement the same snapshot interface later without changing view APIs.

### 6.4 Projection pipeline

```text
external events
  → adapter normalization
  → immutable indexed snapshot
  → visible interval/resource query
  → timezone projection
  → event fragments split by day/resource
  → all-day or timed lane layout
  → viewport virtualization
  → stable render models
  → registry components
```

Each stage is a pure function or a versioned cache. A selection change does not rebuild indexes. A pointer move does not rerun projection. A color change does not recalculate layout unless its geometry changes.

## 7. View system

### 7.1 Strategy and renderer are separate

Core defines a framework-independent view strategy:

```ts
interface CalendarViewStrategy<TName extends string, TOptions> {
  name: TName;
  getRange(
    anchor: Temporal.PlainDate,
    environment: CalendarEnvironment,
    options: TOptions,
  ): DateRange;
  navigate(
    anchor: Temporal.PlainDate,
    direction: -1 | 1,
    environment: CalendarEnvironment,
    options: TOptions,
  ): Temporal.PlainDate;
  getTitle(range: DateRange, environment: CalendarEnvironment, options: TOptions): string;
  project(input: ViewProjectionInput, options: TOptions): ViewProjection;
  getSpatialNavigation(input: SpatialNavigationInput): SpatialNavigationResult;
  getInteractionGeometry(input: InteractionGeometryInput): InteractionGeometry;
}
```

React binds a strategy to a renderer:

```ts
interface CalendarViewDefinition<TEvent, TResource, TOptions> {
  strategy: CalendarViewStrategy<string, TOptions>;
  Renderer: React.ComponentType<CalendarViewRendererProps<TEvent, TResource, TOptions>>;
  defaultOptions: TOptions;
}
```

This is a semver-protected plugin contract. Custom views do not import internal atoms or layout files.

### 7.2 Built-in views

| View              | Range/layout                                                     | Virtualization                                                  | Important behavior                                                   |
| ----------------- | ---------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------- |
| Month             | Padded week grid; multi-day segments packed across each week row | Months may virtualize; one month grid remains bounded           | All-day/timed summary, overflow, fixed or natural week count         |
| Week              | 1–7 day time grid plus all-day lanes                             | Event fragments bounded; vertical time canvas may use windowing | Wall-clock slots, overlaps, current-time marker, business hours      |
| Day               | Single-day time grid plus all-day lanes                          | Same projection as week                                         | Full event detail and precise create/resize                          |
| List/agenda       | Chronological grouped occurrences/fragments                      | Vertical TanStack Virtual                                       | Keyboard-first equivalent and dense-data fallback                    |
| Resource columns  | One day with horizontal resource columns and vertical time       | Horizontal resource virtualization                              | Sticky time axis, resource headers, zero-to-many resource projection |
| Resource timeline | Resource rows with horizontal time                               | Composed row/time virtualizers                                  | Sticky resource axis, configurable range and resolution              |

Day and week share the time-grid strategy and primitives; they are explicit view variants, not one component controlled by boolean flags.

### 7.3 Resource model

```ts
interface CalendarResource<TData = unknown, TResourceId extends ResourceId = string> {
  id: TResourceId;
  title: string;
  parentId?: TResourceId;
  data: TData;
}
```

An event with multiple resources creates one render fragment per visible resource while retaining one canonical event identity. Grouping, collapse state, order, and visibility are view state. Capacity and booking rules remain application policies.

## 8. React composition API

### 8.1 Typed factory

The recommended API creates a typed calendar namespace once:

```tsx
import { createCalendar, defineEventAdapter } from "@moltenship/calendar";

const eventAdapter = defineEventAdapter<ApiEvent>()({
  getId: (event) => event.id,
  getTitle: (event) => event.summary,
  getInterval: (event) => toCalendarInterval(event),
  getResourceIds: (event) => event.roomIds,
});

export const TeamCalendar = createCalendar<ApiEvent, Room>({
  eventAdapter,
  views: [monthView, weekView, dayView, listView, resourceColumnsView, resourceTimelineView],
});
```

The factory carries `TEvent` and `TResource` through hooks, callbacks, transactions, renderers, and custom views without repeating generics in JSX.

### 8.2 Compound components

```tsx
<TeamCalendar.Root
  events={events}
  resources={rooms}
  timeZone="Asia/Tbilisi"
  locale="en-GB"
  view={view}
  onViewChange={setView}
  defaultAnchorDate={Temporal.PlainDate.from("2026-08-15")}
  onEventChange={persistChange}
>
  <TeamCalendar.Frame>
    <TeamCalendar.Toolbar>
      <TeamCalendar.PreviousTrigger />
      <TeamCalendar.Title />
      <TeamCalendar.TodayTrigger />
      <TeamCalendar.NextTrigger />
      <TeamCalendar.ViewSwitcher />
    </TeamCalendar.Toolbar>

    <TeamCalendar.Viewport>
      <TeamCalendar.ActiveView>
        <TeamCalendar.Event>
          {({ event, fragment, interaction }) => (
            <EventCard event={event} fragment={fragment} interaction={interaction} />
          )}
        </TeamCalendar.Event>
      </TeamCalendar.ActiveView>
    </TeamCalendar.Viewport>

    <TeamCalendar.DragOverlay />
    <TeamCalendar.Announcer />
  </TeamCalendar.Frame>
</TeamCalendar.Root>
```

API rules:

1. `Root` receives data, environment, policies, and state control—not visual mode booleans.
2. Structural customization uses children and compound components.
3. Render callbacks exist only when a parent must supply typed event/fragment data.
4. Day, week, month, list, and resource variants are explicit definitions.
5. In React 19, DOM refs are ordinary props; registry source does not add `forwardRef` wrappers.
6. UI components consume a generic `{ state, actions, meta }` context contract. Only the provider knows Jotai exists.
7. Custom controls may live anywhere inside `Root`, not only inside `Frame`.

## 9. State architecture

State is divided by ownership and update frequency.

| Class                 | Examples                                                       | Owner                             | Storage                                                |
| --------------------- | -------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------ |
| External facts        | events, resources, permissions, business policies              | Application                       | Props or `CalendarEventSource`                         |
| Controllable UI       | view, anchor date, selection, focus, timezone, expanded groups | Application or calendar           | Independently controlled slices in per-instance store  |
| Derived               | visible range, queried IDs, fragments, overlap lanes           | Engine                            | Versioned memoized projections                         |
| Ephemeral interaction | pointer coordinates, resize edge, auto-scroll velocity         | Interaction session               | Mutable adapter-local session; never broad React state |
| Pending transaction   | optimistic proposed interval/resource assignment               | Calendar until confirmed/rejected | Small indexed overlay keyed by transaction ID          |

### 9.1 Per-instance store

- Every `Root` creates or receives one calendar store.
- There is no provider-less global state.
- Jotai vanilla stores provide fine-grained subscriptions.
- Atoms are not exported; public hooks select semantic state.
- An advanced `createCalendarStore()` supports external orchestration and testing.
- Components subscribe only to the slices they render.
- Event records are not represented as one atom per event.

### 9.2 Controlled/uncontrolled contract

Each controllable slice follows the same contract:

```ts
view?: ViewName
defaultView?: ViewName
onViewChange?: (next: ViewName, detail: StateChangeDetail) => void
```

The same pattern applies to anchor date, selection, timezone, focus, and resource expansion. Controlled inputs are read through a synchronous state adapter; they are not copied into the store with `useEffect`. Uncontrolled defaults are read exactly once.

`useSyncExternalStore` integration provides cached `getSnapshot` and deterministic `getServerSnapshot`. Hydration receives the exact server snapshot.

### 9.3 Public state interface

```ts
interface CalendarContextValue<TEvent, TResource> {
  state: CalendarPublicState;
  actions: CalendarActions<TEvent, TResource>;
  meta: CalendarMeta<TEvent, TResource>;
}
```

- `state` is immutable and selector-friendly.
- `actions` are stable commands, not setters for derived values.
- `meta` holds adapters, environment, element refs, view registry, and feature capabilities.

## 10. Change transactions and optimistic rendering

All interaction methods produce the same semantic change type:

```ts
interface CalendarEventChange<TEvent, TResourceId extends ResourceId> {
  id: string;
  cause:
    "create" | "move" | "resize-start" | "resize-end" | "resource-change" | "keyboard" | "editor";
  event: TEvent | null;
  original: CalendarEventPlacement | null;
  proposed: CalendarEventPlacement;
  validation: CalendarValidationResult;
  sourceView: string;
}

type EventChangeHandler<TEvent> = (
  change: CalendarEventChange<TEvent, ResourceId>,
) => void | boolean | Promise<void | boolean>;
```

Lifecycle:

1. Interaction session calculates a proposed placement without mutating the external event.
2. Policy pipeline returns valid, invalid, or transformed placement.
3. The view renders a transient preview.
4. Drop/commit emits one typed transaction.
5. Optimistic mode keeps a small patch visible while the handler settles.
6. A matching external snapshot confirms it; rejection or error rolls it back.
7. `onTransactionStateChange` exposes pending/confirmed/rejected state for advanced apps.

The promise return is the DX path. An explicit transaction controller is available for applications whose persistence lifecycle cannot be represented by one promise.

## 11. Drag, resize, selection, and creation

`@moltenship/calendar-dnd` adapts the current `@dnd-kit/react`/`@dnd-kit/dom` line. Core packages know only semantic interaction contracts.

### Performance model

- One geometric droppable surface per view region, not one droppable per time slot.
- Pointer coordinates map through precomputed view geometry to date, time, and resource.
- Drag movement updates a transform/overlay directly; it does not commit React on every pointer event.
- Collision validation reads indexes and policy snapshots prepared before the interaction.
- Auto-scroll is requestAnimationFrame-driven and capped to one geometry read per frame.
- Layout measurement is invalidated only by viewport, zoom/slot size, resource order, or range changes.

### Equivalent input paths

Pointer dragging is never the only path. The same commands are available through:

- keyboard grab/move/resize mode;
- explicit move and resize controls;
- an editable event details surface installed from registry source;
- programmatic `actions.proposeEventChange()`.

dnd-kit sensor, collision, and announcement options are configurable through a narrow adapter configuration. Raw dnd-kit event types do not leak into calendar callbacks.

### Policy pipeline

```text
proposed placement
  → bounds and minimum duration
  → snap policy
  → business-hours policy
  → resource availability/capacity policy
  → overlap policy
  → application policy
  → valid | invalid with reasons | transformed proposal
```

Invalid targets remain visible and clearly marked by default. A policy may instead block or clamp them.

## 12. Layout engines

Layout is pure, deterministic, and separately benchmarked.

### Timed overlaps

1. Sort visible fragments by start, then longer duration, then stable ID.
2. Sweep active intervals using half-open comparison.
3. Partition fragments into collision groups.
4. Assign the lowest available lane.
5. Compute group lane count and expansion opportunity.
6. Emit logical coordinates; the renderer converts them to CSS variables.

The policy can render equal columns, compact expansion, or stacked overlap without changing event queries.

### All-day and month segments

- Split multi-day events only at visible week/resource boundaries.
- Pack segments into stable lanes using prior-lane affinity to reduce visual jumping.
- Continuation metadata controls clipped-start/end affordances.
- Overflow is a projection (`visible segments + hidden count`), not DOM measurement.
- Expanding overflow changes only the affected row projection.

### Business hours and backgrounds

Business hours and availability are interval providers, not special events. They create background segments queried for the current view. Multiple rules may coexist per weekday, date, timezone, and resource.

## 13. Virtualization and bounded rendering

TanStack Virtual is the maintained virtualization primitive for list and resource axes. It remains behind calendar view adapters.

- List view uses one vertical virtualizer.
- Resource columns use a horizontal virtualizer with stable resource keys.
- Resource timeline composes vertical resource and horizontal time virtualizers.
- Sticky headers/axes render outside the virtual item container.
- Overscan is velocity-aware within bounded limits.
- SSR supplies deterministic initial rectangles and ranges where practical.
- Direct DOM positioning may be enabled for scroll-only position updates, while semantic range changes still enter React.

Time-grid event rendering is bounded by the queried visible interval and fragment count. The library never creates a droppable DOM node for every possible slot.

## 14. Performance contract

The performance claim is enforced by production-build benchmarks on a recorded reference environment. Thresholds below are initial gates and may become stricter; relaxing one requires an ADR with traces.

| Scenario                   | Required gate                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| Loaded data                | 10,000 events without per-render full-array scans                                          |
| Visible density            | 1,000 render fragments with stable keys and bounded projection                             |
| Resource scale             | 500 resources with virtualized DOM                                                         |
| Warm range query           | p95 under 1 ms for indexed visible-range queries                                           |
| Full 10k snapshot build    | p95 under 25 ms on the reference laptop                                                    |
| 1k-fragment overlap layout | p95 under 8 ms                                                                             |
| Pointer drag               | p95 library scripting under 4 ms/frame; zero React commits caused by pointer movement      |
| Scroll                     | No work proportional to total event/resource count per frame                               |
| Selection change           | Does not rebuild event index or unrelated view fragments                                   |
| Bundle                     | Each package has a checked ESM size budget; optional adapters do not enter the base bundle |

### Required techniques

- Stable normalized IDs and immutable snapshot versions.
- Interval/resource indexes instead of repeated `.filter()` scans.
- Projection caches keyed by snapshot, view range, timezone, resources, and geometry version.
- Selector-level subscriptions; event components subscribe by render-model identity.
- Precomputed slot and hit-test geometry.
- CSS transforms/variables for high-frequency visual updates.
- Virtualization of unbounded axes.
- No layout reads in render and no DOM measurement per event.
- No `useEffect` bridge that renders stale controlled props before synchronizing.

### Development diagnostics

The showcase performance lab reports:

- normalization/index/projection/layout timings;
- React commit count and affected component count;
- rendered DOM node count versus total entities;
- cache hit ratio;
- drag frame duration and dropped-frame count;
- current snapshot and geometry versions.

Diagnostics are tree-shaken from production builds.

## 15. SSR and framework compatibility

SSR-compatible means the calendar can produce useful, deterministic server markup and hydrate without warnings.

### Requirements

1. No `window`, `document`, `ResizeObserver`, or element measurement at module scope.
2. `getServerSnapshot` is stable and serializable enough to reproduce the first client tree.
3. `timeZone`, `locale`, and week rules are explicit environment inputs.
4. `now` is injectable as `Temporal.Instant` or a `CalendarClock`.
5. If `now` is omitted, transient today/current-time decoration appears after hydration rather than risking mismatch.
6. IDs use React `useId` or deterministic entity keys, never random values.
7. The core and Temporal packages are safe in React Server Components.
8. Interactive React/registry entry points declare their client boundary where a framework requires it.
9. Measurements enhance a CSS-valid initial layout; they do not replace it.

The SSR fixture runs render, hydrate, interaction, and unmount tests. A Vite client example and at least one full-stack React SSR example prove packaging boundaries without adding framework-specific runtime code.

## 16. Styling and shadcn contract

Headless packages ship no mandatory stylesheet. Registry source uses Tailwind CSS 4 and consumes standard shadcn semantic tokens:

```text
--background        --foreground
--card              --card-foreground
--popover           --popover-foreground
--primary           --primary-foreground
--secondary         --secondary-foreground
--muted             --muted-foreground
--accent            --accent-foreground
--destructive       --border
--input             --ring
--radius
```

Calendar-specific tokens add semantic structure without hard-coded palettes:

```text
--calendar-grid
--calendar-axis
--calendar-today
--calendar-now
--calendar-selection
--calendar-business-hours
--calendar-non-business-hours
--calendar-event
--calendar-event-foreground
--calendar-event-border
--calendar-invalid
```

Rules:

- CSS variables are the theme API; class names are implementation details in copied source.
- Event-specific colors come from typed consumer data and the event renderer.
- `data-slot`, `data-view`, `data-state`, `data-kind`, and `data-interaction` attributes support plain CSS customization.
- No runtime Tailwind import enters npm engine packages.
- Motion respects `prefers-reduced-motion` and never obscures state changes.
- Default source follows shadcn's existing token names instead of introducing a parallel design system.

## 17. Accessibility contract

WCAG 2.2 AA is a release gate, not an example-app enhancement.

### Semantic model

- Month uses a labeled grid with deterministic row/column meaning.
- Time grids expose day/resource headers and event relationships without announcing every decorative slot.
- List view is the dense-data and virtualization-friendly semantic equivalent.
- Roving focus keeps one meaningful tab stop per active region.
- Virtualized views retain logical position metadata (`aria-rowindex`, counts, labels).

### Keyboard model

- Arrow keys move spatial focus.
- Home/End and Page Up/Page Down move within the active view strategy.
- Enter/Space activates or begins a move mode where appropriate.
- Escape cancels a preview or interaction.
- Configurable shortcuts move and resize by the current snap duration.
- Explicit edit controls remain available when spatial dragging is unsuitable.

### Announcements

The announcer describes event title, proposed start/end, timezone, resource, validation result, DST adjustment, commit, and rollback. Applications may localize or replace message builders.

Automated axe checks, keyboard integration tests, reduced-motion tests, and manual VoiceOver/NVDA scenarios are required before release.

## 18. Internationalization

- All labels and announcements come from a typed messages contract.
- Defaults use `Intl.DateTimeFormat`, `Intl.Locale`, and supplied locale/timezone.
- Week start and weekend rules are explicit or locale-derived, then frozen in the environment snapshot.
- RTL changes logical axes, keyboard direction, drag geometry, sticky positioning, and continuation indicators together.
- No English text is emitted by core.
- Message interpolation receives Temporal values and semantic fields, not preformatted concatenated strings.

## 19. Testing and verification

### Pure-engine tests

- Unit tests for each type-specific Temporal helper.
- Property-based interval tests with `fast-check`.
- DST matrix covering gaps, folds, unusual offsets, midnight transitions, and date-line changes.
- Golden layout fixtures for overlap and multi-day packing.
- Randomized index query comparison against a simple reference implementation.
- View navigation/range algebra tests.

### React tests

- Controlled and uncontrolled slice contract tests.
- Multiple isolated calendar instances.
- Strict Mode and concurrent rendering.
- SSR render/hydrate equality.
- Selector invalidation and React commit budgets.
- Keyboard/pointer/touch parity.
- Optimistic confirm/reject races.
- Custom view installed without internal imports.

### Browser verification

- Chromium, Firefox, and WebKit production builds.
- Playwright visual and interaction tests.
- Accessibility scans plus manual screen-reader scripts.
- ResizeObserver, zoom, high-DPI, RTL, reduced motion, and touch scenarios.
- Long task and frame timing captured in the performance lab.

### Repository checks

Implementation work follows the Vite+ contract:

```sh
vp install
vp check
vp test
vp run -r build
```

Focused benchmark, SSR, registry-schema, and browser tasks become first-class Vite+ tasks rather than ad hoc shell scripts.

## 20. Showcase application

`apps/showcase` is both the product vitrine and the architectural proving ground.

| Area              | Purpose                                                                     |
| ----------------- | --------------------------------------------------------------------------- |
| Overview          | Principles, quick install, package/registry choice                          |
| View gallery      | Day, week, month, list, resource columns, resource timeline                 |
| Composition lab   | Replace toolbar, event, header, overflow, and empty-state source            |
| Custom view lab   | Build a five-day workweek and a domain-specific view from public APIs       |
| Event lab         | Timed, all-day, floating, multi-day, overlapping, read-only, multi-resource |
| Timezone/DST lab  | Switch display zones and inspect gaps, folds, midnight crossing             |
| Interaction lab   | Pointer, touch, keyboard, resize, create, reject, optimistic rollback       |
| Performance lab   | 10k events, 1k fragments, 500 resources, live timing and DOM counters       |
| Accessibility lab | Keyboard map, announcements, list equivalent, reduced motion                |
| SSR lab           | Server snapshot, hydration identity, client enhancement                     |
| Registry/source   | Install commands, generated file list, ownership and upgrade story          |

Examples import the public facade or install registry source. They may not reach into workspace internals.

## 21. File and module discipline

No view is implemented as a god file. Each view follows the same seams:

```text
views/time-grid/
├── strategy.ts          # range/navigation and public definition
├── projection.ts        # events → fragments
├── layout.ts            # fragments → logical geometry
├── geometry.ts          # pointer/keyboard coordinate conversion
├── model.ts             # stable render-model types
├── renderer.tsx         # composition of source-owned primitives
├── event.tsx            # default event source component
├── axis.tsx             # time/day/resource axes
├── accessibility.ts     # labels and spatial semantics
└── *.test.ts(x)
```

Rules:

- One file owns one reason to change.
- Pure projection/layout does not sit inside React components.
- Shared code is promoted only after two real callers demonstrate the same contract.
- View-specific options stay with that view instead of expanding `Root`.
- Public exports are curated through package entry points.
- Consequential exceptions require an ADR.

## 22. Implementation plan and gates

### Phase 0 — contracts and performance harness

Deliver:

- package skeletons and dependency rules;
- canonical intervals/events/adapters/environment;
- benchmark fixtures and reference hardware record;
- SSR and registry schema smoke tasks;
- ADRs for interval semantics, distribution, and state ownership.

Gate: types compile without React in core; benchmark and SSR harnesses run before feature code.

### Phase 1 — Temporal utilities and indexed snapshots

Deliver:

- `calendar-temporal` public surface;
- normalization, validation, interval/resource indexes;
- array snapshot and advanced event-source contracts;
- DST/property/index correctness suites.

Gate: 10k build/query budgets pass; randomized indexed queries equal the reference implementation.

### Phase 2 — React provider and custom-view spine

Deliver:

- typed factory and `{ state, actions, meta }` context;
- isolated Jotai store and independent controlled slices;
- SSR snapshots;
- view registry, selector hooks, and testing harness.

Gate: two calendars remain isolated; controlled values never lag a render; a third-party test view uses public contracts only.

### Phase 3 — month and list views

Deliver:

- month grid, multi-day lanes, overflow;
- virtualized list/agenda;
- registry source and initial shadcn token layer;
- keyboard and screen-reader baseline.

Gate: all-day/multi-day/overflow golden fixtures, RTL, SSR, and accessibility tests pass.

### Phase 4 — day/week time grid

Deliver:

- wall-clock slots and timezone projection;
- timed overlap layouts;
- business hours, availability, current-time marker;
- DST gap/fold rendering.

Gate: DST matrix, 1k-fragment layout budget, responsive layout, and hydration tests pass.

### Phase 5 — semantic interaction and dnd-kit adapter

Deliver:

- selection/create/move/resize command model;
- pointer, touch, and keyboard drivers;
- optimistic transactions, policy pipeline, announcements, auto-scroll.

Gate: no pointer-move React commits; keyboard parity; async reject/rollback race suite; invalid-target behavior verified.

### Phase 6 — both resource views

Deliver:

- resource columns and resource timeline;
- grouped resources, zero-to-many projection;
- one- and two-axis virtualization;
- sticky synchronized axes.

Gate: 500-resource benchmark, multi-resource transactions, RTL, keyboard navigation, and sticky-axis browser suite pass.

### Phase 7 — showcase, registry, and 1.0 hardening

Deliver:

- complete showcase labs;
- granular/full registry items;
- docs, migration/diff workflow, testing package;
- browser compatibility and package-size reports.

Gate: every public claim links to a passing automated or recorded manual check; no showcase-only internal APIs.

### Phase 8 — recurrence package

Deliver only after the base transaction, timezone, and occurrence identity contracts are stable:

- series and occurrence identity;
- RRULE expansion boundary;
- exceptions and detached occurrences;
- bounded expansion by queried range;
- drag/edit choice between occurrence and series.

Gate: timezone/DST recurrence matrix and interop fixtures pass without changing base event semantics.

## 23. Prototype risks to retire early

1. **React controlled bridge:** prove synchronous controlled state plus fine-grained Jotai subscriptions under SSR/Strict Mode.
2. **dnd-kit adapter:** pin the current 0.x line in the lockfile and prove pointer, touch, keyboard, auto-scroll, and announcements behind semantic types.
3. **Two-axis resource timeline:** prove TanStack Virtual composition, sticky axes, focus retention, and SSR initial geometry.
4. **DST wall-time geometry:** prove gaps and folds in day/week drag, resize, slots, and announcements.
5. **Index implementation:** compare the selected interval-tree adapter with a simple reference and retain it only if build/query/memory budgets pass.
6. **Typed calendar factory:** prove generics flow through compound components and custom views without casts in consumer code.

None of these risks waits until the final polishing phase.

## 24. Versioning and upgrade story

- Packages follow semantic versioning and lockstep releases through 1.0.
- Public package exports, event semantics, view strategies, transactions, and CSS variable names are compatibility contracts.
- Internal Jotai atoms, dnd-kit types, interval-tree types, layout caches, and DOM structure are not contracts.
- Registry source is user-owned after installation. Updates are explicit diffs, never silent overwrites.
- Each registry release declares compatible runtime package ranges.
- Deprecations include codemod or mechanical migration guidance where feasible.
- Package provenance, changelog, and release checks are generated from the monorepo; publishing remains an explicit maintainer action.

## 25. Explicit non-goals for v1

- React Native.
- Legacy browsers or legacy `Date` support.
- Shipping or selecting a Temporal polyfill.
- Owning event fetching, persistence, authentication, or authorization.
- Becoming a full date utility replacement.
- Non-Gregorian layout guarantees.
- Recurrence expansion in the foundational release.
- Built-in application-specific event editors or dialogs in headless packages.
- A custom installer when the shadcn registry already supplies one.
- Private or undocumented framework hooks.

## 26. Architecture invariants

Before merging any feature, verify:

- [ ] External events remain authoritative.
- [ ] Every interval is explicitly typed and half-open.
- [ ] No host timezone or current time is read implicitly during render.
- [ ] Core imports no React, DOM, Jotai, dnd-kit, Tailwind, or application code.
- [ ] The change does not add work proportional to all events/resources inside a render or frame.
- [ ] Pointer interaction has keyboard and explicit-action equivalents.
- [ ] Controlled state is not mirrored through an effect.
- [ ] A custom view can use the capability without internal imports.
- [ ] Registry source uses semantic tokens and remains editable.
- [ ] SSR markup is deterministic or the client-only enhancement is intentional.
- [ ] Performance, accessibility, and browser evidence matches the claim.
- [ ] No new boolean-prop matrix or god file was introduced.
