# ADR 0275: Framework-free calendar primitives on ui-sdk

- Status: Accepted
- Date: 2026-11-24
- Issue: [#275](https://github.com/Moltenship/time/issues/275)
- Amends: [ADR 0001](./0001-hybrid-distribution.md), [ADR 0005](./0005-dependency-law.md) and
  [ADR 0070](./0070-own-react-store.md)

## Context

Through 1.x the calendar is an engine (`calendar-core`, `calendar-temporal`) and one integration,
`calendar-react`. The engine is framework-free. The calendar above it is not: the pipeline that
turns `Root`'s props into the active view's projection (`root.ts`), the state binding, the semantic
actions, the keyboard gestures and roving focus all live in `calendar-react`, as plain functions
wrapped in hooks. Two things the owner wants from version 2.0 don't fit that shape:

- **A second framework.** SolidJS 2.0 is the first target. Today that means writing `Root`'s
  pipeline, the parts and the interaction a second time, and keeping two copies equal.
- **Agents.** An AI agent can operate the calendar only by clicking through the page, or through
  tools each application writes against `actions` itself. The first consuming application, a
  React 19 app, should let agents navigate, find events and propose changes under its own policies.

[ui-sdk](https://ui-sdk.dev) (`@ui-sdk/*`, Apache-2.0) is a headless component kit built that way.
A component's behaviour is one framework-free _primitive_ (`definePrimitive`: options, state, an
api, slots for its parts, a description for agents), and thin adapters render it, React 19 and
Solid 2.0 among them. Its agent bridge (`createAgent`) reads every primitive on a page as a
snapshot, runs their actions behind a permission callback, marks the changes they make with
`source: "agent"`, and registers the same three tools with WebMCP where the browser has it.

It is young. `@ui-sdk/core` was first published on 2026-11-12 and is at `0.1.0-beta.16`
(2026-11-23), its fifteenth beta in twelve days. Its reference says any API can change between
releases before 1.0, and the `agent` key and several helpers this design uses (`dispatch`,
`withSource`) are marked experimental. `@ui-sdk/core` has no dependencies. WebMCP is an
experimental browser API.

The owner decided on 2026-11-24 to build 2.0 on it.

## Decision

1. **The engine stays ours.** Temporal values, time zones, recurrence, normalization, indexes,
   projections, layouts, transactions and policies don't move and don't import ui-sdk. ui-sdk's own
   date strings, Calendar, Timeline and date inputs are not used: no package imports those entries.
   The engine changes in additive ways, all for agents (point 5): the proposal's detail reaches
   policies and `onEventChange` and can carry `fields`, and `proposeNow` returns an outcome known
   at once without waiting.
2. **A primitives plane, `@moltenship/calendar-primitives`,** sits between the engine and the
   framework integrations. It imports core, the Temporal utilities and `@ui-sdk/core`, and no
   framework. It holds:
   - the **calendar runtime**: the derivation `Root` runs with hooks today (event snapshot, pending
     overlay, resources, annotations, availability, ranges, the active view's projection,
     diagnostics), as a synchronous function memoized per root. Each integration calls it in its
     own reactive idiom. It is not ui-sdk state: a primitive's `sync` sees options only, and the
     projection depends on options and state together, so derived data kept in ui-sdk's store
     would lag a render;
   - the **calendar store** of ADR 0070 with its per-root binding, moved from `calendar-react`
     unchanged in contract;
   - the **calendar primitive**, defined inside the typed factory, once per `createCalendar` call,
     since ui-sdk's primitives carry no generics of ours: the six slices as controlled keys, the
     semantic actions as its api, slots for the parts, and the agent description;
   - the framework-free halves of interaction: keyboard gestures, roving focus, gesture drafts,
     the announcer channel and the history binding.
3. **One source of truth for state.** An application owns a controlled slice; the calendar store
   owns an uncontrolled one. The integration merges the two during render, as ADR 0070 describes,
   and passes the result to the primitive, for which all six slices are always controlled. ui-sdk's
   own store is a projection of that merged state for parts and agents and never the owner of a
   slice. This keeps what ui-sdk's change helper alone doesn't give: commands in one handler
   compose against the latest requested value, where a controlled ui-sdk key waits for its owner;
   dates compare by value and resource IDs by elements, where ui-sdk's store compares objects by
   identity; and a caller-owned store outlives its roots. Change handlers also hear ui-sdk's change
   details: the reason, the source and `cancel`.
4. **Thin integrations.** `@moltenship/calendar-react` keeps its factory, hooks and parts, and
   renders the primitive through `@ui-sdk/react`. `@moltenship/calendar-solid` is new, targets
   SolidJS 2.0 and renders it through `@ui-sdk/solid`. Neither imports the other. Each carries the
   primitive's handle in a context of its own, which is how custom views and parts reach the root:
   ui-sdk documents no way for one primitive to read another's state. The pointer layer stays
   `calendar-dnd` on native Pointer Events (ADR 0037) and becomes framework-free: its one React
   hook moves to the React integration, and the Solid integration binds the same function.
5. **Agents.** The primitive describes the calendar to ui-sdk's bridge: its state, the events of
   the visible range as items labelled with their title and ISO dates, and actions that take one
   JSON object each, checked by the calendar itself: describe the calendar, list events, read a
   change, navigate, switch view or zone, select, and create, update, move, resize and delete
   events (`architecture.md` §10). An agent's change is a proposal like any other: same policies,
   same `onEventChange`, attributed with a new `CalendarInputMethod`, `"agent"`. The agent's
   methods pass that input, and the `"agent"` source of the state changes they make, themselves,
   rather than relying on the bridge's ambient source. So that an application can refuse it, the
   proposal's detail reaches policies and `onEventChange`, which only `onEventChangeResult` heard
   in 1.x. The proposal goes through the engine's `proposeNow`, so a refusal known at once fails
   the step by throwing, the policies run once, and `onEventChangeResult` hears each proposal once.
   Actions the root doesn't allow aren't offered: none of the changes on a read-only root, and no
   delete unless `Root` opts in with `allowAgentDelete`. The application creates the bridge and
   registers WebMCP tools, with its own `allow`; the packages never do either.
6. **ui-sdk is a peer dependency, used through public entries only.** `@ui-sdk/core` must be one
   copy shared with the application's bridge, so the primitives and both integrations declare it
   as a peer, and each integration its renderer. The catalog pins one beta for every `@ui-sdk/*`
   package; each peer range is a caret that starts at it; a test keeps them together, and an
   upgrade is one pull request that moves all of them and passes the PR gate. No import reaches
   `internal`, `dist` or `src` paths, or a type that no public entry exports.
7. **The dependency law gains rules 12 to 15,** and rules 1 to 4 and 6 are restated
   (`architecture.md` §2). No rule changes its number.

## Alternatives

- **Stay React-only on the store of ADR 0070.** No new dependency and no beta underneath. The
  semantic actions already exist, so an application could write its own agent tools against them.
  It gives no second framework, and every application would invent its own tool protocol,
  permissions and attribution. Rejected by the owner's decision; the 1.x line remains this shape.
- **Write our own cross-framework primitive layer.** The runtime, the store and the interaction
  logic are ours under either choice. What ui-sdk adds is the part contract, the renderers for each
  framework with server rendering and hydration, and an agent protocol other components on the
  page share. Writing those ourselves is the cost this decision avoids. It is also the fallback
  (below), which is why the runtime and the store don't depend on ui-sdk's store.
- **Adopt ui-sdk's ready-made Calendar and Timeline.** They work on date strings. Our contracts
  are Temporal values in explicit zones and half-open intervals (ADRs 0002 and 0004), and the
  engine already owns projection, layout, recurrence and transactions. Adopting them would replace
  the engine, which this decision is not about.
- **Another headless substrate.** None was evaluated in depth. State-machine libraries with
  adapters per framework exist; we know of none with an agent bridge, which is half the reason for
  this decision.

## Consequences

- Behaviour is written once. The React test suite is the regression harness for the move: the
  guarantees of ADR 0070 and the zero-commit pointer tests must pass unchanged on the primitives.
- `calendar-react` gets runtime peers outside the workspace for the first time since #70:
  `@ui-sdk/core` and `@ui-sdk/react`, which itself needs React DOM. The facade and
  `calendar-testing` bring `calendar-react`, so they declare the same peers. A React application
  installs two more packages.
- Two more packages publish: `calendar-primitives` and `calendar-solid`. Versions stay in lockstep.
- The registry's views stay React and keep importing only the facade. Solid has no views yet; how
  Solid presentation source is distributed is not decided.
- Only ui-sdk components appear in the bridge's snapshot. The registry's stock shadcn (Base UI)
  controls, and dialogs an application opens from `onEventChange`, are invisible to an agent. An
  agent therefore acts through the calendar's own actions, not through the toolbar, and an
  application answers a question such as the recurrence scope for it, or refuses the change.
- Size budgets are measured again once the packages settle; they don't gate 2.0 meanwhile.

## Risks

- **A beta peer.** A caret range admits betas we haven't tested. We test the catalog's version; a
  later beta that breaks the calendar is fixed by an upgrade that raises the floor. The
  experimental APIs we depend on are listed in `architecture.md` §24, so an upgrade knows where to
  look.
- **Solid 2.0 tooling is young.** The Solid integration is written without JSX; only its demo
  compiles JSX.
- **Performance through parts.** Nothing has measured 1,000 fragments rendered as ui-sdk parts.
  Event fragments and cells therefore stay elements the views render, with the data attributes the
  pointer layer reads; only the calendar's structural parts are slots. Pointer movement stays
  outside any framework and any ui-sdk state.
- **Accessibility.** The parts' roles, names and focus order must not change in the move. The
  a11y suite gates it as before.
- **The agent surface rests on experimental API** on both sides: ui-sdk's `agent` key and WebMCP.
  It lands after the kernel, behind feature detection, and can change without the rest moving.

## Reversal trigger

Revisit if any of these holds:

- a ui-sdk release breaks a public entry we use and no fix or replacement lands within two weeks,
  or ui-sdk publishes nothing for three months while still pre-1.0;
- the React integration on the primitives can't pass the tests behind ADR 0070 or the zero-commit
  pointer tests without a change to their assertions;
- a measured regression in the performance contract (`architecture.md` §14) traces to ui-sdk's
  store or parts and can't be removed by keeping that path outside them;
- ui-sdk's licence or governance changes.

The fallback is the second alternative: our own minimal primitive kernel behind the primitives
package's API. The runtime, the store and the interaction logic carry over as they are; the parts'
attributes, the renderers and the agent surface are what would be rewritten. The 1.x line, on the
store of ADR 0070 alone, stays maintainable until 2.0 is released.
