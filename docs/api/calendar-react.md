# `@moltenship/calendar-react`

`@moltenship/calendar-react` owns the React 19 state bridge, typed factory, compound context, and
custom-view registry for one calendar instance. The supported `@moltenship/calendar` facade
re-exports this surface together with `@moltenship/calendar-core`.

The package entry is a React client boundary, but it is safe to import during server rendering: it
reads no browser global at module scope and every binding reads deterministic input-derived state.

## Typed factory and views

Define an application adapter and bind each pure core strategy to a React renderer. The factory
carries event and resource records, their inferred ID types, the view-name union, selection, and
focus through the complete public context without consumer casts:

```tsx
import {
  createCalendar,
  defineCalendarView,
  defineEventAdapter,
} from "@moltenship/calendar";

type ViewName = "capacity" | "agenda";

const eventAdapter = defineEventAdapter<Meeting>()({
  getId: (event) => event.id,
  getInterval: (event) => ({
    end: event.endsAt,
    kind: "timed",
    start: event.startsAt,
  }),
  getResourceIds: (event) => event.roomIds,
  getTitle: (event) => event.title,
});

const capacityView = defineCalendarView<Meeting, Room>()({
  capabilities: ["view:capacity"],
  defaultOptions: { days: 5 },
  strategy: capacityStrategy,
  Renderer({ calendar, options, strategy }) {
    // Meeting, Room, options, and strategy retain their concrete types.
    return <output>{calendar.meta.events.length * options.days}</output>;
  },
});

export const TeamCalendar = createCalendar<Meeting, Room, ViewName>({
  eventAdapter,
  views: [capacityView],
});
```

`defineCalendarView<TEvent, TResource>()` is the standalone registration helper.
`Calendar.defineView()` provides the same binding after a factory exists. Both keep the pure
`CalendarViewStrategy` separate from its renderer and freeze the resulting registration.

Factory registrations apply to every root. A root may append registrations with its `views` prop;
the last registration with a duplicate name wins and emits a structured warning. The active view
comes from the state slice. An unregistered active name emits an error diagnostic and renders the
`ActiveView` fallback. A root must resolve an initial view from `defaultView`, controlled `view`, or
the first registration.

## Compound context

```tsx
function OutsideFrameControl() {
  const actions = TeamCalendar.useCalendarActions();
  return <button onClick={() => actions.navigateNext()}>Jump forward</button>;
}

<TeamCalendar.Root
  defaultAnchorDate={Temporal.PlainDate.from("2026-08-15")}
  defaultTimeZone="Asia/Tbilisi"
  defaultView="capacity"
  events={events}
  locale="en-GB"
  resources={rooms}
  weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
>
  <OutsideFrameControl />
  <TeamCalendar.Frame ref={frameRef}>
    <TeamCalendar.Toolbar>
      <TeamCalendar.PreviousTrigger>Previous</TeamCalendar.PreviousTrigger>
      <TeamCalendar.Title />
      <TeamCalendar.TodayTrigger>Today</TeamCalendar.TodayTrigger>
      <TeamCalendar.NextTrigger>Next</TeamCalendar.NextTrigger>
      <TeamCalendar.ViewSwitcher getViewLabel={(name) => labels[name]} />
    </TeamCalendar.Toolbar>
    <TeamCalendar.Viewport>
      <TeamCalendar.ActiveView fallback={<p>View unavailable</p>} />
      <TeamCalendar.Event eventId="meeting-1">
        {({ event, normalized }) => <EventCard event={event} interval={normalized.interval} />}
      </TeamCalendar.Event>
    </TeamCalendar.Viewport>
  </TeamCalendar.Frame>
</TeamCalendar.Root>;
```

Every compound primitive reads the factory-private context, so custom controls work anywhere below
`Root`; `Frame` is layout markup, not another provider. `useCalendar()`, `useCalendarState()`,
`useCalendarActions()`, `useCalendarMeta()`, and `useCalendarSelector()` expose semantic public
contracts only. `CustomView` renders an explicit registration, while `ActiveView` renders the
registration selected by state. `Event` performs an indexed event-ID lookup from the normalized
snapshot.

DOM refs are ordinary React 19 props. The same frame, toolbar, title, and viewport nodes are exposed
through `meta.refs`, and their deterministic IDs are exposed through `meta.ids` for custom controls
and accessibility relationships. No `forwardRef` compatibility wrappers are used.

## Capabilities and diagnostics

`meta.capabilities` is an immutable, deduplicated set. It includes the base calendar contracts,
factory capabilities, active-view navigation capabilities, an optional today capability when an
explicit `now` or clock exists, and active-view capabilities. Feature consumers use `has()` rather
than inspecting a view name.

`meta.diagnostics` reports duplicate registrations, an unregistered active view, and normalized
event issues as structured immutable values. `onDiagnosticsChange` observes the same list after a
commit. Diagnostics do not write to the console or create an implicit error channel.

## State contract

One immutable `CalendarPublicState` contains six independently controllable slices:

- `view`;
- `anchorDate` as `Temporal.PlainDate`;
- `selection`;
- `focus`;
- `timeZone`;
- `expandedResourceIds`.

Selection and focus are generic semantic values. The store treats them as opaque immutable values
so later view and interaction contracts can define their exact shape without teaching the state
layer about rendering. `undefined` always means that a slice is uncontrolled; nullable selection
and focus use `null` for an explicitly controlled empty value.

Resource expansion is represented as an immutable ordered ID array. Inputs are copied, deduplicated,
and frozen, so consumer mutation cannot change a cached snapshot.

## Creating a store

```ts
import { createCalendarStore } from "@moltenship/calendar-react";

const store = createCalendarStore<"month" | "week", string, string, string>({
  defaultView: "month",
  defaultAnchorDate: Temporal.PlainDate.from("2026-08-15"),
  defaultTimeZone: "Asia/Tbilisi",
  defaultSelection: null,
  defaultFocus: null,
  defaultExpandedResourceIds: ["team-a"],
});

store.actions.setView("week");
store.getSnapshot().view; // "week"
```

`createCalendarStore()` creates one Jotai vanilla store, but no atom, Jotai store, or Jotai type is
public. The returned calendar store exposes only cached state readers, semantic actions, lifecycle
metadata, and `destroy()`.

Defaults are captured once when the store is created. Equal actions are no-ops. Plain dates use
Temporal equality, resource expansions use ordered structural equality, and opaque selection/focus
values use identity equality.

## Controlled readers and actions

`createStateSource()` closes over controlled values synchronously. It never copies them through an
effect:

```ts
const source = store.createStateSource({
  view: applicationView,
  selection: applicationSelection,
});

const actions = store.createActions(source, {
  onViewChange(next, detail) {
    // detail.previous is the value from this reader.
    // detail.controlled is true, so the store did not mirror `next` internally.
    setApplicationView(next);
  },
});
```

Every slice follows the same controlled/uncontrolled behavior. An action against an uncontrolled
slice updates only that instance and then calls its handler. An action against a controlled slice
calls the handler without changing the underlying default. `CalendarStateChangeDetail` records the
slice, previous value, source, and ownership mode.

Each reader is a Jotai derived atom. Its controlled branches return props directly, while its
uncontrolled branches read the corresponding primitive atoms. Jotai therefore tracks only the
backing slices the reader actually uses: updating a controlled slice's backing atom does not
invalidate that reader's cached snapshot.

## React binding and injection

```tsx
function CalendarStateBridge({ injectedStore }: { injectedStore?: typeof store }) {
  const currentStore = useCalendarStore(
    {
      defaultView: "month",
      defaultAnchorDate: Temporal.PlainDate.from("2026-08-15"),
      defaultTimeZone: "Asia/Tbilisi",
    },
    injectedStore,
  );
  const calendar = useCalendarStoreBinding(currentStore, {
    controlled: { view: applicationView },
    handlers: { onViewChange: setApplicationView },
  });

  return <button onClick={() => calendar.actions.setView("week")}>{calendar.state.view}</button>;
}
```

`useCalendarStore()` creates a store once when no injected store is supplied; an injected store
remains owned by its caller. Jotai's React bindings disconnect and recreate subscriptions across
unmount and React `Activity` hide/reveal cycles. The hook does not call irreversible `destroy()` from
an Effect cleanup because a hidden Activity preserves the store ref for a later reveal. After final
unmount, an internally created pure store becomes garbage-collectable with the hook state.

`useCalendarStoreBinding()` returns `{ state, actions, meta }`. Controlled props are visible in the
same render. The action object is stable for the life of a store and dispatches through the latest
committed reader and handlers.

## Selector subscriptions

```tsx
const selectView = (state: CalendarPublicState) => state.view;

function ViewLabel() {
  const view = useCalendarStoreSelector(source, selectView);
  return <output>{view}</output>;
}
```

The hook builds a private Jotai `selectAtom` from the reader atom. Jotai caches the selector result,
and React does not commit when the selected value is equal. Pass `isEqual` for selectors that
intentionally return fresh structural values; callers do not maintain a separate dependency list.
As with `selectAtom` itself, keep the selector reference stable by defining it at module scope or
using `useCallback` when it closes over component inputs.

## SSR and hydration

Each state source exposes its derived atom's cached value through both `getSnapshot()` and
`getServerSnapshot()`. The React binding reads that same atom with `useAtomValue`. Explicit defaults
and controlled values reproduce the first client tree exactly. `Root` derives deterministic part
IDs from React `useId`; consumers provide the same `identifierPrefix` to server and hydration roots
when multiple roots need a coordinated prefix. The package reads no host timezone, current time,
`window`, `document`, or layout measurement while creating a store or snapshot.

## Lifecycle boundary

`store.destroy()` is an explicit orchestration action: it is idempotent and commands reject after
destruction. React never calls it implicitly. Reversible subscription cleanup is delegated to
Jotai, and injected stores are never destroyed by the binding. `store.meta.destroyed` is the only
public lifecycle diagnostic; neither listeners nor the private Jotai store leak through the package
contract.

## Runtime and package guarantees

- Packed declarations expose no Jotai atom/store type and no private source path.
- The emitted runtime preserves the React client boundary, uses `useId`, and contains no
  `forwardRef` wrapper.
- Local source imports use emitted-JavaScript `.js` specifiers; TypeScript extensions do not leak
  into ESM imports.
- The production ESM entry must remain at or below 28 KiB raw and 6.25 KiB gzip. The package build
  enforces both budgets against the emitted artifact.
