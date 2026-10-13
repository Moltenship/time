# @moltenship/calendar

A React 19 calendar built on the Temporal API. This is the package you install and import. It
has the React components and hooks, the event engine, the Temporal helpers and the pointer
interactions.

```ts
import { createCalendar, defineCalendarView, plainDateInterval } from "@moltenship/calendar";
```

It re-exports `@moltenship/calendar-react`, `@moltenship/calendar-dnd`,
`@moltenship/calendar-core` and `@moltenship/calendar-temporal`, which it depends on, so you don't
add them yourself. Recurrence (`@moltenship/calendar-recurrence`) and iCalendar
parsing (`@moltenship/ics`) are separate packages that you add when you need them.

## Install

```bash
pnpm add @moltenship/calendar react react-dom
```

- React 19. React is a peer dependency.
- A runtime with `Temporal` (Node.js 26 and later include it), or a polyfill that defines
  `globalThis.Temporal`, loaded before the calendar. The package never bundles one.
- TypeScript 6 or later with `"lib": ["DOM", "DOM.Iterable", "ESNext"]`. `ESNext` has the
  `Temporal` types.

The styled views, toolbar and theme aren't in this package. They're source files
that you add to your app with the shadcn CLI and then own; see
[Installation](https://moltenship-time.vercel.app/docs/installation).

## Documentation

- [Docs](https://moltenship-time.vercel.app/docs), starting with the
  [Quick start](https://moltenship-time.vercel.app/docs/quick-start)
- [Repository](https://github.com/Moltenship/time)

## License

MIT
