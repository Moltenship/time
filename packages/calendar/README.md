# @moltenship/calendar

A React 19 calendar built on the Temporal API. This is the package you install and import: it
includes the React components and hooks, the event engine, the Temporal helpers and the pointer
interactions, so one import line covers the calendar.

```ts
import { createCalendar, defineCalendarView, plainDateInterval } from "@moltenship/calendar";
```

It re-exports `@moltenship/calendar-react`, `@moltenship/calendar-dnd`,
`@moltenship/calendar-core` and `@moltenship/calendar-temporal`, and installs them for you. You
don't need to add them yourself. Recurrence (`@moltenship/calendar-recurrence`) and iCalendar
parsing (`@moltenship/ics`) are separate packages that you add when you need them.

## Install

```bash
pnpm add @moltenship/calendar react react-dom
```

- React 19. React is a peer dependency.
- A runtime with `Temporal` (Node.js 26 and later include it), or a polyfill that defines
  `globalThis.Temporal`, loaded before the calendar. The package never bundles one.
- TypeScript 6 or later with `"lib": ["ESNext"]`, which includes the `Temporal` types.

The styled week, day, month, year and agenda views aren't in this package. They're source files
that you add to your app with the shadcn CLI and then own; see
[Installation](https://moltenship-time.vercel.app/docs/installation).

## Documentation

- [Docs](https://moltenship-time.vercel.app/docs), starting with the
  [Quick start](https://moltenship-time.vercel.app/docs/quick-start)
- [Repository](https://github.com/Moltenship/time)

## License

MIT
