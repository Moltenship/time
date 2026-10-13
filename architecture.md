# Moltenship Time — Calendar Architecture

Time is a Temporal-native, React 19 calendar system built on five principles: application data remains authoritative; performance comes from indexed projections and bounded rendering rather than later optimization; every interaction is controllable and accessible; consumers own the visual source while upgradeable engines own difficult algorithms; and public contracts stay typed, deterministic, composable, and SSR-safe.

> **Status:** Target design. Parts of it are built; the documentation site (`apps/showcase`) describes only what exists today.
> **Repository:** `github.com/Moltenship/time`
> **Primary package:** `@moltenship/calendar`
> **Registry:** `moltenship-time` (namespace `@moltenship`), served at `/r/<item>.json`; `calendar-full` installs every item
> **Runtime target:** React 19+, modern ESM, native `Temporal`, Node.js 26+, any React-capable SSR framework
> **TypeScript target:** current TypeScript with `compilerOptions.lib: ["ESNext"]`
> **Date policy:** no `Date`, no bundled polyfill, ISO-8601 chronology in v1

This document is the normative architecture contract.

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
| State              | Per-calendar store, the React package's own, read through `useSyncExternalStore`; independently controlled/uncontrolled state slices.                 |
| Views              | Day, week, month, year, list/agenda, resource columns, and resource timeline ship as explicit view definitions. Custom views use a stable plugin contract. |
| Resources          | An event can have zero-to-many resources. Both day-by-resource columns and horizontal resource timelines are first-class.                            |
| Interaction        | Native Pointer Events live behind a semantic adapter (ADR 0037). Pointer, touch, keyboard, and explicit edit actions produce the same typed transaction. |
| Recurrence         | Separate package layered over the base contracts (ADR 0048): occurrences are ordinary events with stable IDs, and base packages stay recurrence-agnostic. |
| iCalendar          | Standalone `@moltenship/ics`: ICS text to typed Temporal values, a Standard Schema parser, no dependencies (ADR 0151).                                |
| Styling            | Tailwind CSS 4 and shadcn tokens in registry source; no Tailwind dependency in headless packages.                                                    |
| SSR                | Full deterministic server markup when environment inputs are provided; no browser globals at module scope.                                           |
| Performance target | 10,000 loaded events, 1,000 visible fragments, and 500 resources with bounded DOM and no React commit on pointer movement.                           |
| Accessibility      | WCAG 2.2 AA is a release gate, including keyboard create/move/resize and screen-reader announcements.                                                |

## 2. Architectural shape

The system is deliberately split into four planes. A plane may depend only on planes below it.

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
3. React bindings may import core, the Temporal utilities and React, but not default view source.
4. The pointer adapter may import core, the Temporal utilities and React, but not the React bindings. It uses native Pointer Events, not a drag-and-drop library (ADR 0037). Of the published packages, only the facade imports it.
5. Registry source imports only the `@moltenship/calendar` facade, other registry items, the npm packages `registry/package.json` declares, and stock shadcn components. It never imports a drag-and-drop library or `calendar-dnd`.
6. The showcase and the demo import packages only through their public entry points, and registry source in place. In the full tier and the release gate, `vp run release:artifacts` runs the SSR fixture's tests and builds and serves the docs site in copies outside the workspace, installed from the dry run's packed tarballs as an end user would, and installs the built registry into clean Vite and Next.js apps on the same tarballs (#203).
7. No package may deep-import another package's `src/` directory.
8. The iCalendar package imports no other workspace, so applications can use it without the calendar (ADR 0151).
9. The recurrence package depends on core, the Temporal utilities and `ics`. No other published package and no registry source imports it (ADR 0048).

## 3. Repository and package topology

```text
time/
├── apps/
│   ├── showcase/                 # Fumadocs documentation, live examples, the Next.js example, the registry at /r
│   │   ├── app/                  # Next.js routes, layouts, static search endpoint
│   │   ├── content/docs/         # authored MDX library documentation
│   │   ├── lib/source.ts         # sole runtime content loader
│   │   └── source.config.ts      # collection schemas and MDX configuration
│   ├── demo/                     # Google Calendar-style demo app (Vite), built from registry source
│   └── ssr-fixture/              # render/hydrate verification in a real SSR boundary
├── packages/
│   ├── calendar-temporal/        # standalone Temporal calendar utilities
│   ├── calendar-core/            # data/index/layout/view/transaction engine
│   ├── calendar-react/           # React provider, store bridge, hooks, primitives
│   ├── calendar-dnd/             # pointer interaction adapter (native Pointer Events)
│   ├── calendar/                 # DX-first public facade
│   ├── calendar-testing/         # empty until #45; private until after 1.0
│   ├── calendar-recurrence/      # range-bounded recurrence (RRULE, exceptions, series edits)
│   └── ics/                      # standalone iCalendar parsing (RFC 5545)
├── registry/
│   ├── calendar/                 # toolbar, view switcher, event chip, mini month, shared renderers
│   ├── month-view/
│   ├── year-view/                # twelve month grids and a day popover
│   ├── time-grid-view/           # day + week
│   ├── list-view/
│   ├── scrolling-*-view/         # week, day, month and agenda that scroll without end
│   ├── resource-columns-view/
│   ├── resource-timeline-view/
│   ├── recurrence-scope-dialog/  # "which events?" for edits to a recurring event
│   ├── calendar-theme/
│   ├── calendar-full/            # installs every item; owns no files
│   └── ui/                       # stock shadcn components (Base UI) the source compiles against
├── benchmarks/
│   ├── core/                     # indexes, projection, overlap layout
│   ├── react/                    # reference render and pointer-frame stages (#188)
│   ├── recurrence/               # series expansion for the year view
│   └── shared/                   # protocol, CLI, reference engine
├── docs/
│   ├── adr/                      # one consequential decision per record
│   └── internal/                 # contributor notes: quality gates, topology, releasing, release audit, benchmarks, evidence
├── tools/
│   ├── registry/                 # shadcn build, registry checks, clean-app install test
│   ├── release/                  # versions, size budgets, API reports, export checks, dry run, artifact runs, publish
│   ├── a11y/                     # axe and real interactions in Chromium, Firefox and WebKit
│   ├── fixtures/                 # deterministic event/resource generators
│   ├── recurrence-oracle/        # RRULE reference fixtures (not a workspace)
│   └── *-spike/                  # dnd-adapter, interval-dst, react-store and resource-virtualization spikes
├── tests/                        # repository contracts: dependency boundaries, package metadata, quality gates
└── architecture.md
```

`apps/showcase` is the only documentation application. It runs on Fumadocs; there is no second docs
content tree. `apps/demo` is a public Google Calendar-style demo built from the registry views; it
carries no documentation.

### Published packages

| Package                           | Responsibility                                                                                                                | Runtime dependencies                                                                      | Public stability                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `@moltenship/calendar-temporal`   | Type-specific ranges, grids, timezone projection, slots, rounding, keys, and interval helpers.                                | None                                                                                      | Stable, standalone                                |
| `@moltenship/calendar-core`       | Event adapters, normalized snapshots, interval indexes, view strategies, fragments, layout engines, policies, transactions.   | `calendar-temporal`; provisional `@flatten-js/interval-tree` behind an internal interface | Stable                                            |
| `@moltenship/calendar-react`      | Per-instance provider, controlled state bridge, selectors, actions, meta, headless primitives, custom-view renderer contract. | `calendar-core`, `calendar-temporal`; React 19 peer                                       | Stable                                            |
| `@moltenship/calendar-dnd`        | Pointer Events sessions, geometry adapter, drag preview, auto-scroll, announcements.                                          | `calendar-core`, `calendar-temporal`; React 19 peer                                       | Stable adapter; no DOM event types in callbacks   |
| `@moltenship/calendar`            | The ergonomic entry point used by most consumers. Re-exports core, the Temporal utilities, the React bindings and the pointer adapter. | `calendar-core`, `calendar-temporal`, `calendar-react`, `calendar-dnd`; React 19 peer | Stable facade                                     |
| `@moltenship/calendar-testing`    | Not built yet (#45): deterministic clocks, event builders, keyboard drivers, view harnesses, assertions. Exports nothing today. | Public calendar packages                                                                  | Private until after 1.0 (#45)                     |
| `@moltenship/calendar-recurrence` | Range-bounded RRULE expansion, occurrence identity, exceptions and overrides, explicit series edits (ADR 0048).            | `calendar-core`, `calendar-temporal`, `ics`                                               | Publishes with 1.0, in lockstep                   |
| `@moltenship/ics`                 | iCalendar syntax tree, typed values and components, TZID resolution, Standard Schema parser. Parses RRULEs; doesn't expand them. | None                                                                                      | Pre-1.0                                           |

All of these publish except `calendar-testing`, which stays private until after 1.0 (#45). Package versions move in lockstep until after `1.0`. The lockfile pins every implementation dependency; the `pnpm-workspace.yaml` catalog sets most exactly and a few as caret ranges. The published packages that use React (`calendar-react`, `calendar-dnd` and `calendar`) declare a `^19.0.0` peer; there are no other peers.

### External dependency ledger

| Dependency line                       | Used by                            | Why it exists                                                     | Containment rule                                                  |
| ------------------------------------- | ---------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| React 19                              | `calendar-react`, `calendar-dnd`, facade, registry | Rendering, context, refs, SSR, external-store subscription | Peer dependency; absent from core, Temporal utilities, recurrence and `ics` |
| Jotai 3                               | `tools/react-store-spike` only     | Spike history (ADR 0018); `calendar-react` dropped it in #70 (#184) | Not a production dependency                                      |
| `@dnd-kit/react` + `@dnd-kit/dom` 0.x | `tools/dnd-adapter-spike` only     | Spike history; not a production dependency since ADR 0037          | Optional future adapter behind the same semantic contracts       |
| TanStack Virtual 3                    | List and resource registry views   | Maintained vertical/horizontal windowing and measurement          | Hidden behind view adapters; not required by core                 |
| `@flatten-js/interval-tree` 2         | `calendar-core` provisionally      | Established interval-query baseline                               | Hidden behind `IntervalIndex`; retained only if benchmarks pass   |
| Tailwind CSS 4 + shadcn registry      | Consumer-owned registry source     | Theme-token compatibility and source distribution                 | No runtime import in headless packages                            |
| `fast-check` 4                        | Test workspace                     | Property-based interval, range, and index verification            | Development only                                                  |
| CLDR `windowsZones` data              | `ics`                              | Windows TZIDs from Outlook and Exchange to IANA time zone ids     | Generated by script; its license comment survives the build       |
| Playwright + axe-core                 | `tools/a11y`                       | axe's WCAG 2.2 A/AA and best-practice rules (serious and critical), and real mouse and keyboard interactions in Chromium, Firefox and WebKit | Development only                                |
| jsdom                                 | Package, registry, demo, showcase and SSR-fixture tests | DOM and hydration tests outside a browser                    | Development only                                                  |
| `@base-ui/react` 1, `lucide-react`, `cn`, `class-variance-authority` | Registry source | shadcn's Base UI primitives, icons, class merging and variants | Installed into the app by `shadcn add`; never imported by packages |
| `temporal-polyfill`                   | `apps/demo`, `apps/showcase`, `tools/a11y` | Browsers without native `Temporal`                        | Installs itself only where `Temporal` is missing; the demo and the docs islands also import it only then, and `tools/a11y` swaps it in for WebKit's; never imported by packages or registry source |
| Next.js 16 + Fumadocs           | `apps/showcase`                    | App Router SSG, typed MDX content, documentation layouts, navigation, and search | Application-only; absent from published package manifests and declarations |

Versions live in the catalog and the lockfile, as above. The architecture commits to the boundary and major line, not to an untested floating dependency.

### Registry composition

The registry is not a second package manager. It distributes the source users are expected to change.

- `calendar-full` installs every item: the theme, the shared `calendar` parts, each view, and the
  recurrence scope dialog. It depends on the other registry items instead of duplicating their files.
- Individual view items support smaller installations; each brings the items it builds on.
- Registry items declare npm dependencies, registry dependencies (stock shadcn components by name,
  our items by URL), the theme's CSS variables and rules, and explicit targets under the consumer's
  `components` alias. Our runtime carries a version range; third-party packages stay bare, as in
  stock shadcn items.
- `meta.compatibility` records the `@moltenship/calendar` range an item's install needs. The build
  takes it from the version the workspace builds and tests with.
- No item depends on a drag-and-drop library. Views edit through the native pointer layer in
  `@moltenship/calendar`, which stays off until the app passes `onEventChange`: without it, `Root`
  passes views `isReadOnly`, so they start no drags or keyboard grabs and draw no resize handles,
  and every change proposed through `actions` is rejected as read-only.
- `shadcn build` builds it, and the docs site serves it at `/r/<item>.json`.
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
  readonly id: TEventId;
  readonly title: string;
  readonly resourceIds?: readonly TResourceId[];
  readonly data: TData;
}

export interface TimedCalendarEventInterval {
  readonly kind: "timed";
  readonly start: Temporal.Instant;
  readonly end: Temporal.Instant;
  readonly sourceTimeZone?: string;
}

export interface AllDayCalendarEventInterval {
  readonly kind: "all-day";
  readonly start: Temporal.PlainDate;
  readonly end: Temporal.PlainDate;
}

export interface FloatingCalendarEventInterval {
  readonly kind: "floating";
  readonly start: Temporal.PlainDateTime;
  readonly end: Temporal.PlainDateTime;
}

export type CalendarEventInterval =
  | TimedCalendarEventInterval
  | AllDayCalendarEventInterval
  | FloatingCalendarEventInterval;

export type TimedCalendarEvent<
  TData = unknown,
  TEventId extends EventId = string,
  TResourceId extends ResourceId = string,
> = CalendarEventBase<TData, TEventId, TResourceId> & TimedCalendarEventInterval;

// AllDayCalendarEvent and FloatingCalendarEvent follow the same pattern.

export type CalendarEvent<
  TData = unknown,
  TEventId extends EventId = string,
  TResourceId extends ResourceId = string,
> =
  | TimedCalendarEvent<TData, TEventId, TResourceId>
  | AllDayCalendarEvent<TData, TEventId, TResourceId>
  | FloatingCalendarEvent<TData, TEventId, TResourceId>;
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
  /** Without it, timed and floating events are busy and all-day ones free. */
  isBusy?(event: TEvent): boolean;
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

There is no default adapter: `createCalendar` requires `eventAdapter`. Records already in the canonical shape use `createCanonicalEventAdapter()`, which reads `CalendarEvent<TData, TEventId, TResourceId>` fields directly. Normalization occurs once per input snapshot, never inside a cell renderer or pointer frame.

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
- The time grid resolves a pointer position by snapping on the wall grid, so a drop or create target is never inside a skipped hour: a snapped time in a gap resolves to the transition instant (ADR 0016).
- Moves apply whole days on the wall clock, then the rest as exact time. A wall time that lands in a gap moves later by the gap's length, as Temporal's `"compatible"` does.
- `Root` takes `disambiguation` (default `"compatible"`) and passes it to views as `environment.disambiguation`, for views and helpers that resolve wall times themselves. The built-in interaction path doesn't read it, and no change carries or announces a shift yet (#187).
- A policy can still reject a change whose time lands in or beside a gap.

`Calendar.Root` can also take `secondaryTimeZones`, other zones time grids label their hours in (ADR 0165). They're an environment input beside `timeZone`, not a display zone: events still project into one zone. Each hour line is read on its own date, in both zones' rules, never through a fixed offset; a skipped wall time has no time in the other zone and a repeated one has both. One gutter serves all columns, so it follows the first visible day on which neither zone changes its clocks; the runs of lines on other days that read differently are listed as shifts.

No helper reads the host machine timezone implicitly. `Temporal.Now` is accessed only through an injected clock/environment boundary.

### 4.6 Calendar scope

V1 promises ISO-8601/Gregorian arithmetic with arbitrary locale, numbering system, display timezone, week start, and RTL layout. Other Temporal calendars are an architectural extension point, not a v1 compatibility promise.

## 5. Standalone Temporal utilities

`@moltenship/calendar-temporal` is calendar-focused, tree-shakeable, and type-specific. It is not a new `date-fns`.

```text
src/
├── intervals/       # half-open constructors, compare, contains, intersect, split
├── plain-date/      # lazy date iteration
├── plain-time/      # PlainTime rounding and wall-grid snapping
├── instant/         # lazy instant iteration and epoch rounding
├── zoned/           # day ranges and splits, wall-time projection, DST gaps/folds,
│                    # slots, zoned snapping, machine keys
├── grids/           # week ranges and month grids
├── clock/           # deterministic clock interface
├── internal/        # shared validation helpers, not exported
└── index.ts         # intentional public exports only
```

Rules:

1. Helpers accept and return one clear Temporal type; no polymorphic `startOf(anything, unit)` API.
2. Formatting delegates to native `Intl.DateTimeFormat`; the package does not invent format tokens.
3. Parsing is limited to Temporal-supported machine formats; no fuzzy natural-language parser.
4. Week functions require explicit week rules or locale-derived rules at the boundary.
5. Iterators are lazy where ranges may be large.
6. Every helper that resolves a nominal wall time requires a timezone and says how gaps and folds
   resolve. `resolveZonedWallTime` and `slotsInZonedDay` take a `disambiguation` policy;
   `snapZonedWallTime` takes a `fold` choice (`"earlier"` by default) and resolves a skipped time to
   the transition instant. Day-boundary and instant-splitting helpers require a timezone and use
   Temporal's unique start-of-day semantics, including the first real instant after a midnight gap.
   Boundary-day ownership remains authoritative when a historical cross-midnight fold projects an
   instant onto an adjacent wall date; slot results expose such physical pieces as explicit
   carryover metadata.
7. Property tests cover interval operations, date and instant iteration, month grids, PlainTime
   and zoned snapping, and zoned slots. Day ranges and splits, wall-time projection, keys and
   instant rounding have example tests; the zoned ones cover DST gaps, folds and midnight
   transitions.

Representative API:

```ts
plainDateInterval(start, end);
iteratePlainDates(range);
monthGrid(date, { weekStartsOn, fixedWeeks });
weekRange(date, { weekStartsOn });
zonedDayRange(date, timeZone);
splitInstantRangeByZonedDay(range, timeZone);
resolveZonedWallTime(wallTime, { timeZone, disambiguation });
roundPlainTime(time, { smallestUnit, increment, roundingMode });
slotsInZonedDay(date, { timeZone, disambiguation, slotDuration });
instantKey(instant);
zonedWallTimeKey(wallTime, timeZone);
plainDateIntervalsIntersect(left, right);
intersectPlainDateIntervals(left, right);
```

## 6. Event snapshots and indexes

### 6.1 Input forms

The normal React API accepts an immutable array snapshot. The adapter is fixed once, on the
factory:

```tsx
const TeamCalendar = createCalendar<ApiEvent, Room>()({ eventAdapter, views });

<TeamCalendar.Root events={events} {...environmentAndState} />
```

For high-frequency external stores, core exports the shape of an advanced source. Nothing accepts
one yet: `Root` takes the array form only (#200).

```ts
interface CalendarEventSource<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  getSnapshot(): EventSnapshot<TEvent, TEventId, TResourceId>;
  getServerSnapshot(): EventSnapshot<TEvent, TEventId, TResourceId>;
  subscribe(listener: () => void): () => void;
}
```

The calendar never fetches data or mutates backend records.

### 6.2 Normalized snapshot

A snapshot contains:

- `byId`: stable identity lookup;
- timed interval index keyed by epoch time;
- all-day interval index keyed by packed ISO year, month and day fields;
- floating interval index keyed by local ISO fields;
- resource-to-event indexes;
- per-event revision;
- `issues`: the records left out as invalid, with their codes;
- a monotonic snapshot version;
- a query cache for range and resource queries, bounded by an LRU limit (`queryCacheSize`, 128 by
  default; `Root` always uses the default). Projections aren't cached in the snapshot; `Root`
  memoizes the active view's projection on its inputs.

The interval-tree implementation is wrapped behind an internal `IntervalIndex` interface. Its types never escape the core package, so it can be replaced only after benchmark evidence and an ADR.

### 6.3 Snapshot lifecycle

- The adapter is fixed when `createCalendar` runs, so it never changes under a `Root`.
- `Root` compares `events` item by item. A new array with the same records reuses the complete
  snapshot.
- A changed array triggers one normalization pass, not work per rendered component. The interval
  indexes are rebuilt only when records were added, removed or reordered, or a record's normalized
  fields changed (with a revision accessor, only when its revision changed).
- Duplicate IDs, invalid intervals, IDs and revisions, and adapter failures are reported in every
  build, as `snapshot.issues` and as `invalid-event` diagnostics through `meta.diagnostics` and
  `onDiagnosticsChange`. Nothing detects a mutated array or record yet.
- A revision accessor permits structural reuse when event objects are recreated but unchanged.
- Invalid-event behavior is set by `invalidEventPolicy` on `createCalendar`: `"report-and-skip"`
  (the default) or `"throw"`, which throws `InvalidCalendarEventSnapshotError` during render.
- Async/worker indexing can implement the same snapshot interface later without changing view APIs.

### 6.4 Projection pipeline

```text
external events
  → adapter normalization
  → immutable indexed snapshot
  → pending-change and keyboard-preview overlay (indexes reused)
  → visible interval/resource query
  → timezone projection
  → event fragments split by day/resource
  → all-day or timed lane layout
  → viewport virtualization
  → stable render models
  → registry components
```

Each stage is a pure function or a versioned cache. A selection change does not rebuild indexes or rerun projection. A pointer move does not rerun projection. A record replaced with the same normalized fields (interval, title, resources, read-only and busy flags, revision), such as a color change in `data` that keeps its revision, reuses its normalized structure and the interval indexes, but the active view's projection and layout run again.

## 7. View system

### 7.1 Strategy and renderer are separate

Core defines a framework-independent view strategy:

```ts
interface CalendarViewStrategy<TProjection, TOptions = undefined, TEvent = unknown> {
  getRange(
    anchor: Temporal.PlainDate,
    environment: CalendarEnvironmentBase,
    options: TOptions,
  ): PlainDateInterval;
  /** Dates projected and loaded around the visible range; defaults to it. */
  getLoadRange?(
    anchor: Temporal.PlainDate,
    environment: CalendarEnvironmentBase,
    options: TOptions,
  ): PlainDateInterval;
  navigate(anchor: Temporal.PlainDate, delta: number, options: TOptions): Temporal.PlainDate;
  getTitle(range: PlainDateInterval, environment: CalendarEnvironmentBase, options: TOptions): string;
  project(input: CalendarViewProjectionInput<TOptions, TEvent>): TProjection;
  /** Where a navigation key moves focus; a view without it has no keyboard navigation. */
  getSpatialNavigation?(
    input: CalendarSpatialNavigationInput<TProjection, TOptions>,
  ): CalendarSpatialNavigation | null;
}
```

The strategy has no name; the view does. Pointer geometry is not part of it: views mark their DOM
(`data-date`, `data-all-day`, `data-event-id`, `data-resize`, `data-resource-id`, and others listed
in the interactions docs) and pass the projection's time `columns` to `useCalendarPointer` in time
grids, resource columns and hour timelines.

React binds a strategy to a renderer:

```ts
interface CalendarView<TName extends string, TProjection, TOptions, TEvent = unknown> {
  name: TName;
  strategy: CalendarViewStrategy<TProjection, TOptions, TEvent>;
  Renderer: React.ComponentType<CalendarViewRendererProps<TProjection, TOptions>>;
  defaultOptions: TOptions;
}
```

`defineCalendarView({ name, strategy, Renderer, defaultOptions })` makes one; `defaultOptions` may
be left out when the options can be `undefined`.

This is a semver-protected plugin contract. Custom views do not import the store's internals or private layout files.

### 7.2 Built-in views

| View              | Range/layout                                                     | Virtualization                                                  | Important behavior                                                   |
| ----------------- | ---------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------- |
| Month             | Padded week grid; multi-day segments packed across each week row | None: one grid of four to six weeks, bounded                    | All-day/timed summary, overflow into "+N more", natural week count (four to six rows) |
| Year              | The anchor's calendar year as twelve month grids, each date once | None: 365 cells, bounded                                        | Event dots per day, a day's events in one shared popover, read-only  |
| Week              | 1–7 day time grid plus all-day lanes                             | Event fragments bounded; no windowing: the 24-hour canvas renders whole, with only the focused slot as an element | Wall-clock slots, overlaps, current-time marker, business hours |
| Day               | Single-day time grid plus all-day lanes                          | Same projection as week                                         | Full event detail and precise create/resize                          |
| List/agenda       | Chronological grouped occurrences/fragments                      | Vertical TanStack Virtual                                       | Keyboard-first equivalent and dense-data fallback                    |
| Resource columns  | One day, or N days per resource, with horizontal resource columns and vertical time | Horizontal resource virtualization                              | Sticky time axis, resource headers, zero-to-many resource projection |
| Resource timeline | Resource rows with horizontal time                               | Composed row/time virtualizers                                  | Sticky resource axis, configurable range and resolution              |
| Scrolling week/day | The anchor's week or 1–7 days from it, swiping sideways by pages | Anchored day axis; a page of days rendered either side          | Snaps a page at a time; anchor follows the scroll; load range for prefetching |
| Scrolling month   | Six to twelve week rows (six by default), from the week of the anchor month's first day | Anchored week axis; a page of weeks rendered either side        | Snaps a month at a time; named by the anchor's month                 |
| Scrolling agenda  | Days with events, `weeks` from the anchor date                   | Vertical TanStack Virtual over a page of weeks either side      | Rests on any day; anchor follows the day on top; load range for prefetching |

Day and week share the time-grid strategy and primitives; they are explicit view variants, not one component controlled by boolean flags.

### 7.2.1 Scrolling views

The scrolling views (#105) are separate view definitions, not a mode of the paged ones. Their
anchor date is the scroll position: the first visible day of a time grid's page, or a day of the
month's month.
A scroll that comes to rest sets `anchorDate`, so title, controlled state and URLs follow it; any
other anchor change scrolls the view there. Only the latest scroll waits for a controlled anchor:
an anchor equal to it is the owner catching up, and any other is navigation. Commands that ask
for the anchor the calendar already has, as Today does after a scroll the owner hasn't taken,
reach views through `useAnchorDateRequests`. Each strategy's `getLoadRange` adds a page on either
side of the visible range. The scrolling agenda (#131) follows the same rules over a list of days:
its range starts at the anchor date, since the list rests on any day; Today and picked dates jump
there at once rather than glide; and keys that page past the range leave the scrolling to focus. `Root` projects the load range, and `onVisibleRangeChange` reports both
ranges after commit, so applications fetch the next page before it scrolls into view; the calendar
still never fetches.

The registry renders them on an axis of numbered days or weeks thousands of items long
(`useScrollingAxis`). The time grid swipes a page at a time through CSS scroll snapping, with snap
points a whole page apart from the range's start, so a week stays a calendar week and a 3-day view
moves three days; the month's snap points sit at the week holding each month's first day, four or
five weeks apart. The view tells the axis where its pages start, and mid-swipe commits and settling
round to those pages too. Scroll offsets stay out of React state: the view re-renders only when the
anchor moves, at rest or halfway to another page during a long swipe. Server markup
places the visible range at the axis start, and the axis extends before it in a layout effect.

### 7.3 Resource model

```ts
interface CalendarResource<TData = unknown, TResourceId extends ResourceId = string> {
  readonly id: TResourceId;
  readonly title: string;
  readonly parentId?: TResourceId;
  readonly data: TData;
  /** The IANA time zone the resource keeps; its working hours follow it. */
  readonly timeZone?: string;
  /** When it can be booked; the calendar's `availability` by default. */
  readonly availability?: ResourceAvailability;
}
```

An event with multiple resources creates one render fragment per visible resource while retaining one canonical event identity. Grouping follows `parentId` and order follows the `resources` array, both the application's. Which groups are open is the controllable `expandedResourceIds` slice; a view's `unassigned` option shows events without resources in a bucket. Capacity and booking rules remain application policies.

### 7.4 Annotations

Annotations are time-based information shown beside events without being events: listening sessions, sleep, workouts, focus blocks (#119).

```ts
interface CalendarAnnotation<TData = unknown, TResourceId extends ResourceId = never> {
  readonly id: AnnotationId;
  readonly sourceId: string;
  readonly start: Temporal.Instant;
  readonly end: Temporal.Instant;
  readonly title: string;
  readonly resourceIds?: readonly TResourceId[];
  readonly data?: TData;
}

interface CalendarAnnotationSource {
  readonly id: string;
  readonly label: string;
  readonly mergeGap?: Temporal.Duration;
}
```

- **Separate from events.** `Root` takes `annotations` and `annotationSources` next to `events`. Annotations get their own validated snapshot and interval index, and never enter the event snapshot, overlap layout, policies or transactions. Changing them never reruns event projection.
- **Sibling projection.** `projectTimeGridAnnotations` lays annotations out per column, in rail lanes of their own. It merges a source's items by its `mergeGap` and by drawn size, so short marks never touch. Like events, items land on the dates their wall clock reads, one UTC offset at a time, so a fold that crosses midnight follows the wall clock. Views take only the numbers the layout needs (minimum height, gap, lanes).
- **Sources are app-defined.** The library knows no source kinds. Leaving a source out of `annotationSources` hides its annotations.
- **Read-only and accessible.** Marks are not focus targets. Screen readers get per-day summaries (`summarizeAnnotationMarks`), and a focused slot names the annotations that cover it.
- **Presentation lives in the registry** as composable parts.

## 8. React composition API

### 8.1 Typed factory

The recommended API creates a typed calendar namespace once:

```tsx
import { createCalendar, defineEventAdapter } from "@moltenship/calendar";
// View factories are registry source, installed with `shadcn add`.
import { createMonthView } from "@/components/calendar/month-view/month-view";

const eventAdapter = defineEventAdapter<ApiEvent>()({
  getId: (event) => event.id,
  getTitle: (event) => event.summary,
  getInterval: (event) => toCalendarInterval(event),
  getResourceIds: (event) => event.roomIds,
});

export const TeamCalendar = createCalendar<ApiEvent, Room>()({
  eventAdapter,
  views: [
    createMonthView<ApiEvent>(),
    createWeekView<ApiEvent>(),
    createDayView<ApiEvent>(),
    createAgendaView<ApiEvent>(),
    createResourceColumnsView<ApiEvent>(),
    createTimelineWeekView<ApiEvent>(),
  ],
});
```

The first call fixes the record, resource, selection and focus types; the second infers the
view-name union and ID types from `views` and `eventAdapter`. Duplicate view names throw.

The factory carries those types through hooks, `Root`'s props and callbacks, and event changes,
without repeating generics in JSX. Renderers stay view-agnostic: they get
`CalendarViewRendererProps<TProjection, TOptions>`, whose events are `unknown` records and whose
`actions.setView` takes any name, so one view definition fits any calendar. A view's literal
`name` is distinct from the runtime union; an unregistered active view surfaces as an
`unregistered-active-view` diagnostic. A view that reads its own record fields types its `project`
input as `CalendarViewProjectionInput<TOptions, TEvent>`.

### 8.2 Compound components

```tsx
<TeamCalendar.Root
  events={events}
  resources={rooms}
  timeZone="Asia/Tbilisi"
  locale="en-GB"
  weekRules={weekRules}
  view={view}
  onViewChange={setView}
  defaultAnchorDate={Temporal.PlainDate.from("2026-08-15")}
  onEventChange={persistChange}
>
  <TeamCalendar.Frame>
    <TeamCalendar.Toolbar>
      <TeamCalendar.PreviousTrigger aria-label="Previous" />
      <TeamCalendar.Title />
      <TeamCalendar.TodayTrigger>Today</TeamCalendar.TodayTrigger>
      <TeamCalendar.NextTrigger aria-label="Next" />
      <TeamCalendar.ViewSwitcher getViewLabel={(name) => viewLabels[name]} />
    </TeamCalendar.Toolbar>

    <TeamCalendar.Viewport>
      <TeamCalendar.ActiveView />
    </TeamCalendar.Viewport>

    <TeamCalendar.Announcer messages={calendarAnnouncements} />
  </TeamCalendar.Frame>
</TeamCalendar.Root>
```

Each view's Renderer draws its events. The month, time-grid and resource views, and the scrolling
week, day and month, attach the pointer layer, which draws drag previews itself; the year view and
both agendas don't. `TeamCalendar.Event eventId={id}` looks up one event anywhere inside `Root` and
calls its children with `{ event, normalized }`.

API rules:

1. `Root` receives data, environment, policies, and state control—not visual mode booleans.
2. Structural customization uses children and compound components.
3. Render callbacks exist only when a parent must supply typed event data.
4. Day, week, month, year, list, and resource variants are explicit definitions.
5. In React 19, DOM refs are ordinary props; composed callbacks preserve returned detach cleanup
   functions, and registry source does not add `forwardRef` wrappers.
6. UI components read the calendar through the factory's hooks: `TeamCalendar.useCalendar()` returns a generic `{ state, actions, meta }`, and parts subscribe to the slices they need. Only `Root` knows how the store works.
7. Custom controls may live anywhere inside `Root`, not only inside `Frame`.
8. `Root.id` is the authoritative instance/part ID seed. Individual identified primitives do not
   accept an `id` override, so `meta.ids` and default ARIA relationships cannot diverge from the DOM.

## 9. State architecture

State is divided by ownership and update frequency.

| Class                 | Examples                                                       | Owner                             | Storage                                                |
| --------------------- | -------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------ |
| External facts        | events, resources, permissions, business policies              | Application                       | Props (`events`, `resources`, `policies`, `availability`, `annotations`) |
| Controllable UI       | view, anchor date, selection, focus, timezone, expanded groups | Application or calendar           | Independently controlled slices in per-instance store  |
| Derived               | visible range, queried IDs, fragments, overlap lanes           | Engine                            | Versioned memoized projections                         |
| Ephemeral interaction | pointer coordinates, resize edge, auto-scroll velocity         | Interaction session               | Mutable adapter-local session for pointer gestures, never React state; a keyboard gesture's preview is a small store `Root` reads |
| Pending change        | optimistic proposed interval/resource assignment               | Calendar until confirmed/rejected | Small overlay of proposed placements keyed by event ID; the newest change per event wins |

### 9.1 Per-instance store

- Every `Root` creates or receives one calendar store. `Root` creates it on its first render, from
  the `default*` props (or the controlled value, or the first registered view). Pass `store` to
  use one made with `createCalendarStore()`, for external orchestration and testing.
- There is no provider-less global state. Each factory (`createCalendar<…>()({…})`) makes its own
  React contexts, so a calendar inside another reads its own root. Module-level hooks such as
  `useCalendarFocus`, `useCalendarKeyboard` and `useNow` read the nearest root of any factory.
- The store is the React package's own (`store.ts`): a frozen snapshot of the six slices (only
  uncontrolled ones change), a listener set, `getSnapshot()`, `subscribe()`, and six `set*` actions.
  It has no runtime dependency. `calendar-react` dropped Jotai in #70 (#184).
- `Root` reads state through `useSyncExternalStore`. `useCalendarStateBinding` (`state-binding.ts`)
  overlays the controlled props on the store's snapshot during render and caches the merged object
  per snapshot.
- Each mounted `Root` binds to the store with its controlled props and handlers. It publishes them
  in an insertion effect, so commands, which run only after a commit, see the latest.
  `store.actions` go through the most recently mounted root.
- Stable semantic actions read the last commit's inputs (view options, environment, event snapshot,
  policies, handlers) and the latest requested state: the committed state plus requests made since,
  so commands in one handler compose. Both are published in insertion effects, before descendant
  layout effects run.
- The store's internals are not exported; public hooks select semantic state.
- `useCalendarSelector`, `useCalendarFocus` and `useCalendarSelection` re-render a component only
  when its selection changes. A change to a controlled prop replaces the state source, so each of
  them renders once then. `useCalendarState()` and `useCalendar()` re-render on any state change.
- Event records live in the event snapshot, not in the store.

### 9.2 Controlled/uncontrolled contract

Each controllable slice follows the same contract:

```ts
view?: ViewName
defaultView?: ViewName
onViewChange?: (next: ViewName, detail: CalendarStateChangeDetail<ViewName, "view">) => void
// detail: { previous, controlled, slice }
```

The same pattern applies to anchor date, selection, timezone, focus, and resource expansion. `anchorDate` or `defaultAnchorDate`, and `timeZone` or `defaultTimeZone`, are required, one of each. `useCalendarStateBinding` keeps controlled props stable while they stay equal (dates by value, resource IDs by elements, selection and focus by identity) and overlays them on the store's snapshot during render, so a controlled value is current in the first render that receives it. A command for a controlled slice records a pending request, so the next command in the same handler builds on it, and calls the handler; the store itself changes only for uncontrolled slices. Controlled inputs are not copied into the store with `useEffect`. Uncontrolled defaults are read exactly once. A command asking for a controlled slice's current value still reaches its handler while the owner holds another change it was told about and hasn't committed, so a deferring owner can drop that change.

`useSyncExternalStore` owns subscription cleanup, for unmount and for React `Activity` hide and reveal. A root's binding attaches in an insertion effect and detaches when the root unmounts. There is no store destruction: a store `Root` created is dropped with it, and a caller-owned store keeps its state and stays usable after its roots unmount. `useStateSelector` keeps a selector's previous result while `isEqual` (`Object.is` by default) says it is unchanged, so a state change it doesn't select doesn't re-render that component (`Root` itself renders on every state change). `CalendarStore` has `getSnapshot` and `subscribe` and no `getServerSnapshot`; its `getSnapshot` returns the store's six values, in which a controlled slice keeps its initial value, since the current one lives in the application's state. Inside `Root`, server and client read the same merged getter, and explicit defaults and controlled inputs make server and first-client output deterministic.

### 9.3 Public state interface

```ts
interface CalendarContextValue<
  TEvent,
  TResource,
  TViewDef extends AnyCalendarView = AnyCalendarView,
  TSelection = CalendarSelection,
  TFocus = CalendarFocus,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
> {
  state: CalendarPublicState<TViewDef["name"], TSelection, TFocus, TResourceId>;
  actions: CalendarSemanticActions<TViewDef["name"], TSelection, TFocus, TResourceId, TEvent, TEventId>;
  meta: CalendarMeta<TEvent, TResource, TViewDef, TEventId, TResourceId>;
}
```

- `state` holds the six slices, frozen, and is selector-friendly.
- `actions` are stable commands: the six setters, `navigatePrevious`, `navigateNext`,
  `navigateToday`, `proposeEventChange` and `checkEventChange`; not setters for derived values.
- `meta` holds the event snapshot with pending changes and a keyboard preview applied, resources, the environment, the
  active view's definition and the registered views, diagnostics, and the part IDs and refs
  (`ids`, `refs`, `instanceId`).

## 10. Change transactions and optimistic rendering

Every way of changing an event makes a proposal, and the engine turns it into one change type
(`calendar-core/src/transactions/types.ts`):

```ts
type CalendarChangeCause = "create" | "move" | "resize-start" | "resize-end" | "update" | "delete";

type CalendarEventPlacement<TResourceId extends ResourceId> = CalendarEventInterval & {
  resourceIds: readonly TResourceId[];
};

type CalendarEventProposal<TEventId extends EventId, TResourceId extends ResourceId> =
  | { cause: "create"; proposed: CalendarEventPlacementInput<TResourceId> }
  | {
      cause: "move" | "resize-start" | "resize-end" | "update";
      eventId: TEventId;
      proposed: CalendarEventPlacementInput<TResourceId>; // omitted resourceIds are kept
    }
  | { cause: "delete"; eventId: TEventId };

type CalendarEventChange<TEvent, TEventId extends EventId, TResourceId extends ResourceId> =
  | {
      cause: "create";
      id: string;
      eventId: null;
      event: null;
      original: null;
      proposed: CalendarEventPlacement<TResourceId>;
      warnings?: readonly string[];
    }
  | {
      cause: "move" | "resize-start" | "resize-end" | "update";
      id: string;
      eventId: TEventId;
      event: TEvent;
      original: CalendarEventPlacement<TResourceId>; // as the user saw it, pending change included
      proposed: CalendarEventPlacement<TResourceId>;
      warnings?: readonly string[];
    }
  | {
      cause: "delete";
      id: string;
      eventId: TEventId;
      event: TEvent;
      original: CalendarEventPlacement<TResourceId>;
      proposed: null;
      warnings?: readonly string[];
    };

type CalendarEventChangeHandler<TEvent, TEventId extends EventId, TResourceId extends ResourceId> = (
  change: CalendarEventChange<TEvent, TEventId, TResourceId>,
) => void | Promise<void>;

type CalendarTransactionResult<TEvent, TEventId extends EventId, TResourceId extends ResourceId> =
  | { status: "committed"; change: CalendarEventChange<TEvent, TEventId, TResourceId> }
  | {
      status: "rejected";
      reason: string;
      change?: CalendarEventChange<TEvent, TEventId, TResourceId>;
      error?: unknown;
    };
```

Pointer and keyboard gestures make `create`, `move`, `resize-start` and `resize-end`. A move to
another resource is a `move` with new `resourceIds`. `update` and `delete` come only from
`actions.proposeEventChange()`, as an event form sends them. The change doesn't say which input
made it; gestures tell only the announcer (`input: "pointer" | "keyboard"`). `id` names the change
within one calendar, such as `change-3`. `warnings` holds the reasons policies flagged the change
with while letting it through. There are no recurrence fields: `resolveRecurrenceEdit` in
`@moltenship/calendar-recurrence` turns a change to an occurrence into a this, following or all
edit.

Lifecycle:

1. A gesture works out a proposal without touching the application's event. The pointer preview is
   fixed-position segments moved by transforms: a copy of the event for a move or resize on a time
   axis, range boxes otherwise. A keyboard gesture previews through the overlay pending changes
   use.
2. Each time the target changes, the preview asks `actions.checkEventChange()`. It runs the
   policies without showing or saving anything, and the preview gets `data-invalid` or
   `data-warning`. An async policy can't answer a preview.
3. A drop, a keyboard commit, or `actions.proposeEventChange()` proposes once. The engine builds the
   change against the events the user sees, pending changes included.
4. Policies run in order: `readOnlyPolicy`, then the root's `policies`. Each one accepts, adjusts,
   rejects, or warns. A rejection, a policy that throws, or an empty placement ends the change
   before the handler runs. While async policies decide, a change to an existing event already
   shows as pending.
5. `onEventChange` gets the accepted change. A handler that returns nothing has already updated
   `events`, so the change commits at once and nothing stays pending.
6. A handler that returns a promise keeps an update shown, and a delete hidden, at least until the
   promise settles (step 7). Those events carry `isPending: true`. Creates get no overlay; they
   appear when `events` include them.
7. When the promise resolves, the overlay goes if `events` already reflect the change: the event's
   `revision` changed, its placement matches, or it is gone. Otherwise the next new `events` decide,
   whether they include the change or not. New `events` that arrive while the handler still runs
   don't end it.
8. A rejection or a throw rolls the change back. The latest proposal for an event wins: an older one
   still in validation resolves as rejected with the reason `superseded`, a late result from an
   older one leaves the newer change alone, and a synchronous commit replaces an older change still
   saving.
9. `proposeEventChange` resolves with the result and never rejects. The built-in views announce a
   gesture's outcome through the root's `Announcer`; the registry's messages read an `AbortError`
   from the handler as a cancel, not a failed save. Proposals from application code aren't
   announced.

Optimistic rendering is not a mode: the handler's return value decides it. A handler can't refuse a
change by returning `false`; it throws or rejects. The engine is `createEventTransactions()` in
`calendar-core`, with `propose`, `check`, `reconcile`, `getPending` and `subscribe`, for use outside
React. `Root` keeps one per calendar and doesn't expose it. Pending changes are keyed by event ID,
so an event has at most one. In React, pending state shows per event (`isPending`) and per proposal
(the promise). There is no calendar-wide pending reader, no `onTransactionStateChange` and no
transaction controller. #199 proposes a public outcome callback and a pending-changes hook. A
keyboard gesture's preview also marks the grabbed event `isPending` (#198).

## 11. Drag, resize, selection, and creation

`@moltenship/calendar-dnd` uses native Pointer Events ([ADR 0037](./docs/adr/0037-native-pointer-events.md)). Core packages know only semantic interaction contracts. A dnd-kit adapter can return later as an option behind the same contracts.

### Performance model

- One geometric droppable surface per view region, not one droppable per time slot.
- Each pointer move hit-tests the DOM (`elementsFromPoint`) for a day cell or time column. The
  cell's `data-date` gives the date and its `data-resource-id` the resource. A time column maps the
  position along its rectangle to a snapped time through the projection's column model.
- Drag movement updates a transform/overlay directly; it does not commit React on every pointer event.
- Previews run the root's policies once per new placement (`actions.checkEventChange`), against the
  event snapshot's indexes and the root's availability schedules, both built before the gesture.
- Auto-scroll runs in a requestAnimationFrame loop while a gesture is active. It reads the
  scroller's rectangle each frame and re-reads target and preview geometry only in frames where it
  scrolled.
- Nothing is measured ahead of a gesture, so there is no measurement cache to invalidate. A gesture
  caches each cell's clipping ancestors, reads preview rectangles once per new placement, and picks
  up new day columns when a scrolling view renders more days.

### Equivalent input paths

Pointer dragging is never the only path. The same commands are available through:

- keyboard grab mode for move, resize, and create (#36);
- an application's own form or dialog: it can check a change with `actions.checkEventChange()`
  and save it itself, as the demo's event dialog does, or propose it through
  `actions.proposeEventChange()`, as the demo's delete does;
- programmatic `actions.proposeEventChange()`.

Explicit move and resize buttons and an event details surface in the registry are not built yet.

`useCalendarPointer` takes the rendered `events`, `onPropose` and `timeZone`, and optionally `snap`
(15 minutes by default), `announcer`, `check`, `columns`, `scrollContainer` (the nearest scrollable
ancestor by default), `onPreview`, `disabled` (views pass their `isReadOnly` prop) and
`ghostClassName`. Activation is fixed: more than 4 px of travel for mouse and pen; for touch, a
250 ms press that moves no more than 8 px. DOM event types do not leak into calendar callbacks.

### Policy pipeline

```text
proposal (a pointer or keyboard gesture snaps it to the view's slots; an app's own arrives as given)
  → readOnlyPolicy (Root runs it first; without onEventChange everything is rejected)
  → the root's `policies`, in the order given
  → accepted (perhaps adjusted, perhaps with `warnings`) | rejected with one `reason`
```

Each policy accepts, adjusts, rejects, or warns. The built-in ones are `boundsPolicy`,
`minimumDurationPolicy`, `snapPolicy`, `availabilityPolicy`, `conflictPolicy`, `readOnlyPolicy` and
`readOnlyResourcesPolicy`. `conflictPolicy` checks only resources the event books. Capacity rules
aren't built yet (#146).

Previews follow the raw target. One the policies would reject is marked `data-invalid`, and a drop
there is rejected; one they would flag is marked `data-warning`, and a drop there saves with the
warning. An async policy leaves the preview unmarked. `availabilityPolicy` and `conflictPolicy` take
`mode`: `"block"` (reject, the default) or `"warn"` (save with a warning). An adjusting policy
changes what is saved, not the preview.

## 12. Layout engines

Layout is pure and deterministic. The benchmark's layout stage still times a reference implementation (#188).

### Timed overlaps

1. Sort visible fragments by start, then longer duration, then stable ID.
2. Sweep active intervals using half-open comparison.
3. Partition fragments into collision groups.
4. Assign the lowest available lane.
5. Compute group lane count and expansion opportunity.
6. Emit fractions of the column (top, height, inline start, width); the renderer sets them as inline percentage styles.

The `overlapLayout` option of the time-grid and resource-columns views chooses `"columns"` (the default: lanes, each event widening into free lanes beside it), `"equal"` (equal-width lanes), or `"stack"` (each event indented by `stackIndent` past the deepest earlier event it overlaps, with the indent capped in deep stacks). Event queries stay the same.

### All-day and month segments

- Split multi-day events at row boundaries (a week, the visible range, or a resource's row), and at
  any date the event skips in the display time zone.
- Pack each row's segments into the lowest free lane in a fixed order: earlier column, longer span,
  then day display order. Lanes depend only on the row's own events.
- Continuation metadata controls clipped-start/end affordances.
- Overflow is a projection from a lane limit: visible `segments` plus per-day `hiddenCounts`. Month
  views measure the limit from the row height; events are never measured. The time grid's all-day
  row shows three lanes.
- In month views a day's "+N more" opens a popover of its events; in the time grid it expands the
  all-day rows. Keyboard focus on a hidden event shows every
  lane of its week. The time grid's all-day rows expand together.

### Business hours and backgrounds

Business hours are availability data, not events: weekly rules and dated exceptions for the calendar and each resource, each on one time zone. A schedule answers open and closed intervals for a range, and views shade the closed parts they show. A weekday can have several rules; a date has at most one exception. A resource's own weekly hours replace the calendar's; its exceptions add to them.

## 13. Virtualization and bounded rendering

TanStack Virtual is the maintained virtualization primitive for list and resource axes. It remains behind calendar view adapters.

- List view uses one vertical virtualizer over measured day rows. Rows that load in above or below
  keep the day on top where it is (TanStack's key anchoring), and the focused day stays rendered
  while focus is in the list.
- Resource columns use a horizontal virtualizer with stable resource keys.
- Resource timeline composes vertical resource and horizontal time virtualizers.
- Resource columns render their headers, all-day row and hour gutter outside the scrolling body
  and move them by transform. The timeline and the agenda use `position: sticky` inside the
  scroller.
- Overscan is a small fixed count per axis: 3 agenda rows, 2 resource columns, 4 timeline rows and
  2 timeline slots.
- SSR supplies deterministic initial rectangles and ranges where practical.
- Virtual items render in React; TanStack Virtual re-renders when the rendered range, a
  measurement, or the scrolling state changes, not on every scroll offset.
- Scrolling views follow the same rule: scroll offsets never enter React. The scrolling week and
  month move the anchor date, and with it the projected load range, a page at a time, once a
  scroll passes halfway. The scrolling agenda moves it to the day on top when a scroll comes to
  rest, and during a scroll whenever that day is half the range away.

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

Measured now, by hand on reference hardware (`vp run engine:gate`, `vp run recurrence:gate`), not in
CI: the 10k snapshot build, the warm queries and the recurrence year view. The layout and
pointer-frame rows still time reference code, and nothing measures scrolling yet (#188). Zero React
commits on pointer moves, the 500-resource DOM bound and the 10,000-event agenda are tests in
`vp test` and the a11y suite. The bundle budgets run in `vp run release:check`.

### Required techniques

- Stable normalized IDs and immutable snapshot versions.
- Interval/resource indexes instead of repeated `.filter()` scans.
- Projection memoized on the event snapshot (pending changes and a keyboard preview applied), the visible and load ranges, view options, resources and expanded IDs, the environment (time zone, secondary zones, locale, week rules, direction, disambiguation) and today's date; snapshot queries cached in a bounded LRU.
- Selector-level subscriptions; event components subscribe by render-model identity.
- Slot geometry from the projection's column model; hit-testing reads the DOM once per pointer move.
- CSS transforms/variables for high-frequency visual updates.
- Virtualization of unbounded axes.
- No layout reads in render and no DOM measurement per event.
- No `useEffect` bridge that renders stale controlled props before synchronizing.

### Development diagnostics (not built yet)

A showcase performance lab is planned (§20). It would report:

- normalization/index/projection/layout timings;
- React commit count and affected component count;
- rendered DOM node count versus total entities;
- cache hit ratio;
- drag frame duration and dropped-frame count;
- current snapshot and geometry versions.

None of it exists yet, and lab-only counters must not enter production bundles. Today
`onDiagnosticsChange` reports invalid events, annotations, availability and secondary zones and an
unregistered view, in production too, and `snapshot.getQueryCacheStatistics()` gives the query
cache's hits and misses.

## 15. SSR and framework compatibility

SSR-compatible means the calendar can produce useful, deterministic server markup and hydrate without warnings.

### Requirements

1. No `window`, `document`, `ResizeObserver`, or element measurement at module scope.
2. Inside `Root`, the server and the first client render read the same merged state getter, stable enough to reproduce the first client tree.
3. `timeZone`, `secondaryTimeZones`, `locale`, and week rules are explicit environment inputs.
4. `Root` takes `now` (a `Temporal.Instant`) or `clock` (a `CalendarClock`); the types allow one, and `now` wins if both arrive.
5. If `now` is omitted, transient today/current-time decoration appears after hydration rather than risking mismatch.
6. IDs use React `useId` or deterministic entity keys, never random values.
7. The core and Temporal packages are safe in React Server Components.
8. Interactive React/registry entry points declare their client boundary where a framework requires it. `calendar-react` and `calendar-dnd` do, and so does every registry component file that calls hooks, creates a context or sets event handlers: `registry:smoke` checks the built registry for it, and the install test's Next.js page imports each item from a Server Component (#190).
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
--calendar-surface
--calendar-grid
--calendar-axis
--calendar-today              --calendar-today-foreground
--calendar-now
--calendar-selection
--calendar-weekend
--calendar-unavailable        --calendar-closed
--calendar-busy               --calendar-free
--calendar-invalid            --calendar-warning
--calendar-event              --calendar-event-foreground
--calendar-event-border
--calendar-hour-height
--calendar-event-padding-x    --calendar-event-padding-y
```

Closed time is `--calendar-unavailable`, closed days `--calendar-closed`. A `data-color` palette
sets `--calendar-event-hue` and `--calendar-event-chroma`, and the three event tokens derive from
them. Drag previews read `--calendar-ghost-background`, `--calendar-ghost-radius`,
`--calendar-ghost-shadow`, `--calendar-ghost-opacity` and `--calendar-ghost-z-index`, with
fallbacks, in `calendar-dnd`.

Rules:

- CSS variables are the theme API; class names are implementation details in copied source.
- Event-specific colors come from typed consumer data and the event renderer.
- `data-calendar-part` on the React parts, `data-slot` on registry parts, `data-interaction` on a view during a pointer gesture, and state attributes such as `data-today`, `data-color`, `data-pending`, `data-dragging`, `data-invalid` and `data-closed` support plain CSS customization.
- No runtime Tailwind import enters npm engine packages.
- Motion respects `prefers-reduced-motion` and never obscures state changes.
- Default source follows shadcn's existing token names instead of introducing a parallel design system.

## 17. Accessibility contract

WCAG 2.2 AA is a release gate, not an example-app enhancement.

### Semantic model

- Month uses a labeled grid with deterministic row/column meaning. Year is one labeled grid per
  month, with a single tab stop across the twelve.
- Time grids expose day/resource headers and event relationships without announcing every decorative slot.
- Hour labels, including secondary time zones' (ADR 0165), are decoration; a focused slot names its time in every zone.
- List view is the dense-data and virtualization-friendly semantic equivalent.
- Roving focus keeps one meaningful tab stop per active region.
- Virtualized views retain logical position metadata (`aria-rowindex`, counts, labels).

### Keyboard model

- Arrow keys move spatial focus.
- Home/End and Page Up/Page Down move within the active view strategy.
- Enter/Space activates or begins a move mode where appropriate.
- Escape cancels a preview or interaction.
- Space picks up the focused event to move it, or the focused cell to create one; Shift+Space picks up an event's end to resize it, and again switches to its start. Navigation keys then step the gesture, by a slot (`useCalendarKeyboard({ snap })`) or a day. Enter or Space commits it; Escape, Tab or leaving the view cancels it. The keys are fixed.
- An app's own edit controls, through `actions.proposeEventChange()`, cover cases where spatial dragging is unsuitable; the registry has none yet.

### Announcements

The announcer describes event title, proposed start and end (the registry's messages name each end's zone when their offsets differ), resource, validation result, commit, and rollback. Applications localize or replace the builders: `CalendarAnnouncementMessages`, passed to `Announcer`'s `messages`. Announcing a DST shift waits on #187.
A rollback carries what `onEventChange` threw: the registry's English messages read an `AbortError`
as the user cancelling, as when they dismiss the recurrence scope question, not as a failed save.

Automated axe checks, keyboard integration tests, reduced-motion tests, and manual VoiceOver/NVDA scenarios are required before release. The manual passes haven't run yet (#186).

## 18. Internationalization

- Announcements come from the typed `CalendarAnnouncementMessages`. The packages emit no text of their own: labels are props (`aria-label`, `getViewLabel`) or registry source, which the app owns and edits to localize.
- Defaults use `Intl.DateTimeFormat`, `Intl.Locale`, and supplied locale/timezone.
- Week start and weekend rules are explicit (`Root`'s required `weekRules`), then frozen in the environment snapshot. Deriving them from the locale isn't built yet (#202).
- RTL takes two settings that must agree: `dir="rtl"` on an ancestor flips logical axes, drag geometry, sticky positioning and continuation indicators; `direction="rtl"` on `Root` flips keyboard direction. The registry's resource timeline and scrolling time grid also set `dir` from it, and the resource views' horizontal virtualizers read it.
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
- Keyboard/pointer parity for the month and time grid; the resource views have none yet (#189), and touch is covered only by the long-press start.
- Optimistic confirm/reject races.
- Custom view installed without internal imports.

### Browser verification

- Chromium on every PR (`vp run a11y`); Firefox and WebKit in `vp run browsers` (the full gate, and
  CI on demand), WebKit on `temporal-polyfill`. The suites run source through Vite, not production
  builds.
- Vitest browser-mode tests on Playwright: real mouse and keyboard interactions, and layout checked
  by measured boxes. No screenshot comparisons.
- Accessibility scans; the manual screen-reader scripts are #186.
- RTL and reduced-motion scenarios (reduced motion in Chromium only). On macOS 27, `browsers` runs
  WebKit alone (#182). Not built yet: zoom, high-DPI, ResizeObserver and touch
  scenarios, and frame timing (there is no performance lab).

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

### Documentation platform boundary

Phase 3 establishes this surface with the standard Next.js integration of `fumadocs-core`,
`fumadocs-mdx`, and `fumadocs-ui`. Fumadocs is Next.js-first; using its documented App Router path
avoids maintaining a local Vite/React Router adapter for content loading, layouts, search, and static
generation. This choice applies only to the private showcase application. The published calendar
remains compatible with any React-capable SSR framework and continues to be proved separately in
`apps/ssr-fixture`.

The content path is static-first and deterministic:

```text
content/docs/**/*.mdx
  → source.config.ts schemas and MDX options
  → generated Fumadocs source
  → lib/source.ts loader
  → app/docs/[[...slug]] page + generated navigation
  → pre-rendered pages and static-compatible search index
```

Authored MDX and colocated example components are source. Generated Fumadocs artifacts are build
inputs, never a second hand-edited content model. Direct docs URLs are pre-rendered, unknown slugs
use the framework not-found boundary, and search requires no content database or hosted search
service. The exact compatible Fumadocs, Next.js 16, and Tailwind CSS 4 patch versions are pinned by
#68.

One application owns both explanation and proof:

- Phase 3 creates the overview, installation, architecture, and initial package/API navigation.
- Each later feature issue adds its public-import example and documentation to that same content
  tree when the contract becomes observable.
- Phase 7 completes the full catalog, labs, ownership/upgrade guidance, and evidence links; it does
  not replace or migrate the documentation platform.
- Live examples import public package roots or installed registry source only. Fumadocs, Next.js,
  generated source modules, and showcase helpers never enter published declarations.

| Area              | Purpose                                                                     |
| ----------------- | --------------------------------------------------------------------------- |
| Overview          | Principles, quick install, package/registry choice                          |
| View gallery      | Day, week, month, year, list, resource columns, resource timeline           |
| Composition lab   | Replace toolbar, event, header, overflow, and empty-state source            |
| Custom view lab   | Build a five-day workweek and a domain-specific view from public APIs       |
| Event lab         | Timed, all-day, floating, multi-day, overlapping, read-only, multi-resource |
| Timezone/DST lab  | Switch display zones and inspect gaps, folds, midnight crossing             |
| Interaction lab   | Pointer, touch, keyboard, resize, create, reject, optimistic rollback       |
| Performance lab   | 10k events, 1k fragments, 500 resources, live timing and DOM counters       |
| Accessibility lab | Keyboard map, announcements, list equivalent, reduced motion                |
| SSR lab           | Server snapshot, hydration identity, client enhancement                     |
| Registry/source   | Install commands, generated file list, ownership and upgrade story          |

Built so far: the overview, the view gallery, custom views, the theme builder and registry/source;
the accessibility page has the keyboard map and live announcements. Not built yet: the composition,
event, timezone/DST, interaction, performance and SSR labs (phase 7).

Examples import the public facade or install registry source. They may not reach into workspace internals.

## 21. File and module discipline

No view is implemented as a god file. Each view splits engine from rendering; the time grid:

```text
packages/calendar-core/src/views/time-grid/
├── range.ts              # visible range, navigation and title
├── projection.ts         # events → fragments
├── layout.ts             # fragments → logical geometry
├── geometry.ts           # pointer/keyboard coordinate conversion
└── columns.ts, zones.ts, scrolling.ts
packages/calendar-core/src/navigation/time-grid.ts   # spatial keyboard navigation
registry/time-grid-view/
├── time-grid-view.tsx    # view definition and Renderer
├── time-grid-event.tsx   # default event source component
├── time-grid-header.tsx, time-grid-body.tsx, time-grid-column.tsx, time-grid-all-day.tsx
├── time-grid-zones.tsx   # hour axes
└── time-grid-annotations.tsx, time-grid-availability.tsx, annotation-label.ts
```

Tests live in each package's `tests/` directory.

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
- an isolated per-instance store and independent controlled slices (Jotai at first; `calendar-react` dropped it in #70);
- SSR snapshots;
- view registry, selector hooks, and an internal render/hydrate test harness (the public `calendar-testing` package follows after 1.0, #45).

Gate: two calendars remain isolated; controlled values never lag a render; a third-party test view uses public contracts only.

### Phase 3 — month and list views

Deliver:

- Fumadocs content, navigation, static search, and production-build foundation;
- initial overview, installation, architecture, and stable package/API pages;
- month grid, multi-day lanes, overflow;
- virtualized list/agenda;
- registry source and initial shadcn token layer;
- keyboard and screen-reader baseline.

Gate: the Fumadocs production site and search build from a clean checkout; month/list public examples,
all-day/multi-day/overflow golden fixtures, RTL, SSR, and accessibility tests pass.

### Phase 4 — day/week time grid

Deliver:

- wall-clock slots and timezone projection;
- timed overlap layouts;
- business hours, availability, current-time marker;
- DST gap/fold rendering.

Gate: DST matrix, 1k-fragment layout budget, responsive layout, and hydration tests pass.

### Phase 5 — semantic interaction and native pointer input

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

- complete Fumadocs content and showcase labs on the phase 3 platform;
- granular/full registry items;
- migration/diff and ownership workflows (the testing package follows after 1.0, #45);
- browser compatibility and package-size reports.

Gate: every public claim links to a passing automated or recorded manual check; navigation, search,
and direct docs URLs pass in the production build; no showcase-only internal APIs.

### Phase 8 — recurrence package

Deliver only after the base transaction, timezone, and occurrence identity contracts are stable:

- series and occurrence identity;
- RRULE expansion boundary;
- exceptions and detached occurrences;
- bounded expansion by queried range;
- drag/edit choice between occurrence and series.

Gate: timezone/DST recurrence matrix and interop fixtures pass without changing base event semantics.

Shipped: #48 and #49 through #156 (contracts and ADR 0048), #159 (the RFC 5545 rule engine and
RRULE text, checked against 315 python-dateutil and ical.js fixtures), #157 (`createOccurrenceExpander`
over `loadRange`, `createOccurrenceAdapter` and the `recurringEventsFromIcs` bridge) and #158 (`"this"`,
`"following"` and `"all"` edits through `resolveRecurrenceEdit`, and the registry's
`recurrence-scope-dialog`). #155 closed epic #2 with the demo and docs (#162) and the gate
(#161):

- a DST matrix through core's view projections: series in Berlin, New York, Lord Howe, Santiago and
  Sydney, shown in each of those zones and in Kolkata, with positions, counts and occurrence IDs
  pinned across every change week, and IDs stable across ranges and display zones;
- Google Calendar, Outlook/Exchange and iCloud interop fixtures, parsed, bridged and expanded;
- a year-view expansion benchmark: 200 series, about 10,000 occurrences, gated at 50 ms p95
  (`vp run recurrence:gate`);
- the scope dialog's focus and announcements in the a11y suite.

Base event and transaction semantics are unchanged: occurrences reach the calendar through an
ordinary `EventAdapter`. The one change to a base package is additive: reject announcements carry
what `onEventChange` threw, so a cancelled scope question isn't announced as a failed save. Limits
left open are in #160.

## 23. Prototype risks to retire early

1. **React controlled bridge:** prove synchronous controlled state plus fine-grained selector subscriptions under SSR/Strict Mode. Retired by the #18 spike (ADR 0018) and `vp run react:gate`; the store is `calendar-react`'s own since #70.
2. **dnd-kit adapter:** pin the current 0.x line in the lockfile and prove pointer, touch, keyboard, auto-scroll, and announcements behind semantic types. Superseded in 0.1 by native Pointer Events (ADR 0037).
3. **Two-axis resource timeline:** prove TanStack Virtual composition, sticky axes, focus retention, and SSR initial geometry. Retired by the #20 spike (ADR 0020).
4. **DST wall-time geometry:** prove gaps and folds in day/week drag, resize, slots, and announcements. Retired by the #16 spike (ADR 0016) and the DST parity tests; announcing a shift is #187.
5. **Index implementation:** compare the selected interval-tree adapter with a simple reference and retain it only if build/query/memory budgets pass. Retired by #16 (ADR 0016) and the #24 engine gate.
6. **Typed calendar factory:** prove generics flow through compound components and custom views without casts in consumer code. Retired by the #18 spike and #26 (`vp run react:factory`).

None of these risks waits until the final polishing phase.

## 24. Versioning and upgrade story

- Packages follow semantic versioning and lockstep releases through 1.0.
- Public package exports, event semantics, view strategies, transactions, and CSS variable names are compatibility contracts.
- The React store's internals, interval-tree types, layout caches, and DOM structure are not contracts. The data attributes the pointer layer reads (`data-event-id`, `data-date`, `data-resize`, …) are.
- Registry source is user-owned after installation. Running `shadcn add` again asks before it replaces a file; `--overwrite` replaces them all. The theme's CSS block is written again on each add, so apps change tokens in their own rules.
- The registry isn't versioned on its own: the docs site serves it from `main`. Each item's `meta.compatibility`, and `compatibility.json`, record the `@moltenship/calendar` range it needs.
- Deprecations include codemod or mechanical migration guidance where feasible.
- Release checks run from the monorepo (`release:check`, `release:dry-run`). PRs that change a published package add a line to `CHANGELOG.md`; `release:version` sets the shared version and dates those lines. Publishing is an explicit, guarded maintainer step (`release:publish`); it adds npm provenance when it runs in the release workflow.

## 25. Explicit non-goals for v1

- React Native.
- Legacy browsers or legacy `Date` support.
- Shipping or selecting a Temporal polyfill.
- Owning event fetching, persistence, authentication, or authorization.
- Becoming a full date utility replacement.
- Non-Gregorian layout guarantees.
- Recurrence in the base packages: it's a separate layer, and series expand only inside a date range (ADR 0048).
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
- [ ] Pointer interaction has explicit-action and keyboard equivalents (#36).
- [ ] Controlled state is not mirrored through an effect.
- [ ] A custom view can use the capability without internal imports.
- [ ] Registry source uses semantic tokens and remains editable.
- [ ] SSR markup is deterministic or the client-only enhancement is intentional.
- [ ] The issue's "Done when" list is met, with tests for each behavioural claim.
- [ ] No new boolean-prop matrix or god file was introduced.
