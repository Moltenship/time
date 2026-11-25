# @moltenship/calendar-primitives

> **2.0 preview.** This package is new and its API isn't settled. It can change in any release
> before 2.0. Most apps should keep using `@moltenship/calendar`.

The framework-free layer of Moltenship Time 2.0, written on
[ui-sdk](https://ui-sdk.dev). It holds the calendar runtime, the pipeline `Root` runs: event
snapshots, transactions, the active view's projection, the visible range and diagnostics. It also
defines the calendar as a ui-sdk primitive, with controlled state slices, semantic actions and
slots for its parts. Thin framework integrations render it: `@moltenship/calendar-react` for
React and `@moltenship/calendar-solid` for Solid.

The primitive is also how AI agents operate a calendar in the page, through ui-sdk's agent bridge
and WebMCP where the browser has it. It describes the calendar to the bridge: its state, the events
in view, and fifteen actions to read the calendar and its events, navigate, switch view, and
create, update, move, resize and delete events. Each action takes one JSON object, and an event
action returns the change with how it ended. An agent's change says it came from an agent
(`input: "agent"`) and goes through the same policies and `onEventChange` as any other, so the app
can refuse it. The app creates the bridge; this package never does. See
[Agents](https://time.molten.sh/docs/agents).

The dates, time zones, recurrence, layouts and policies stay in the calendar's own engine
(`@moltenship/calendar-core` and `@moltenship/calendar-temporal`). This package imports no UI
framework.

## Install

You rarely install it yourself: the framework integrations depend on it.

```bash
pnpm add @moltenship/calendar-primitives@next @ui-sdk/core
```

Time 2.0 is a pre-release on npm's `next` tag, so the command installs `@next`.

- `@ui-sdk/core` 0.1 beta. It is a peer dependency, and still pre-1.0, so this package takes the
  beta the calendar was tested with and the ones after it in the same 0.1 line.
- A runtime with `Temporal` (Node.js 26 and later include it), or a polyfill that defines
  `globalThis.Temporal`, loaded first.
- TypeScript 6 or later with `"lib": ["DOM", "DOM.Iterable", "ESNext"]`.

## Documentation

- [Primitives](https://time.molten.sh/docs/api/primitives)
- [Agent reference](https://time.molten.sh/docs/agents/reference)
- [Repository](https://github.com/Moltenship/time)

## License

MIT
