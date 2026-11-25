# @moltenship/calendar-react

The headless React layer of Moltenship Time: `createCalendar` and its `Root` and components, the
hooks, and the contract for custom views. It renders plain, unstyled elements.

Since 2.0 it renders the calendar's ui-sdk primitive from `@moltenship/calendar-primitives`
through [`@ui-sdk/react`](https://ui-sdk.dev), which is how an AI agent reaches a calendar. The
state store lives in the primitives now, and this package still exports it.

It's a layer of `@moltenship/calendar`, which re-exports everything in it. Install
`@moltenship/calendar` instead: you rarely need this package on its own.

## Install

```bash
pnpm add @moltenship/calendar-react@next @ui-sdk/core @ui-sdk/react react react-dom
```

Time 2.0 is a pre-release on npm's `next` tag, so the command installs `@next`.

- React 19. React is a peer dependency.
- `@ui-sdk/core` and `@ui-sdk/react` 0.1 beta, peer dependencies since 2.0. `@ui-sdk/react` needs
  React DOM.
- A runtime with `Temporal` (Node.js 26 and later include it), or a polyfill that defines
  `globalThis.Temporal`, loaded first.
- TypeScript 6 or later with `"lib": ["DOM", "DOM.Iterable", "ESNext"]`. `ESNext` has the
  `Temporal` types.

## Documentation

- [React components and hooks](https://time.molten.sh/docs/react/api/components)
- [Agents](https://time.molten.sh/docs/react/agents)
- [Repository](https://github.com/Moltenship/time)

## License

MIT
