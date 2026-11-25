# @moltenship/calendar-solid

> **2.0 preview.** This package is new and its API isn't settled. It can change in any release
> before 2.0. The Solid registry has one ready-made view so far, the agenda
> (`npx shadcn@latest add https://time.molten.sh/r/solid/list-view.json`). For the others you
> define a view with `defineCalendarView`, over the engine's projections, and bind keyboard
> navigation, dragging, drafts and undo to it with this package's hooks.

The headless [SolidJS](https://www.solidjs.com) 2 layer of Moltenship Time. It renders the
calendar primitive from `@moltenship/calendar-primitives` with
[ui-sdk](https://ui-sdk.dev)'s Solid adapter, the way `@moltenship/calendar-react` does for React,
so both frameworks share one implementation of the calendar's state, actions and event changes.
It renders plain, unstyled elements: `createCalendar` gives a `Root`, the structural parts (frame,
toolbar, title, viewport, view switcher, the previous, next and today triggers, the active view,
`Event` and `Announcer`) and hooks that return accessors where React's return values. A view binds
keyboard navigation with `useCalendarKeyboard` and `useRovingFocus`, pointer dragging, resizing
and creating with `useCalendarPointer` over `@moltenship/calendar-dnd`, and undo with
`useCalendarHistory`. Agents drive the calendar through ui-sdk's bridge, which the application
creates.

## Install

```bash
pnpm add @moltenship/calendar-solid@next solid-js @solidjs/web @ui-sdk/core @ui-sdk/solid
```

Time 2.0 is a pre-release on npm's `next` tag, so the command installs `@next`.

- It re-exports `@moltenship/calendar-core` and `@moltenship/calendar-temporal`, as
  `@moltenship/calendar` does for React, so the event adapter, the views' projections and the
  Temporal helpers import from it.
- Solid 2: `solid-js` and `@solidjs/web` are peer dependencies.
- ui-sdk's `@ui-sdk/core` and `@ui-sdk/solid` 0.1 beta. They are peer dependencies, and still
  pre-1.0, so this package takes the beta the calendar was tested with and the ones after it in
  the same 0.1 line.
- A runtime with `Temporal` (Node.js 26 and later include it), or a polyfill that defines
  `globalThis.Temporal`, loaded first.
- TypeScript 6 or later with `"lib": ["DOM", "DOM.Iterable", "ESNext"]`.

This package doesn't use React, and `@moltenship/calendar` (the React facade) doesn't re-export
it.

## Documentation

- [Solid](https://time.molten.sh/docs/solid)
- [Repository](https://github.com/Moltenship/time)

## License

MIT
