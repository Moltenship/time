# @moltenship/calendar-react

The headless React layer of Moltenship Time: `createCalendar` and its `Root` and components, the
state store, the hooks, and the contract for custom views. It renders plain, unstyled elements.

It's a layer of `@moltenship/calendar`, which re-exports everything in it. Install
`@moltenship/calendar` instead: you rarely need this package on its own.

## Install

```bash
pnpm add @moltenship/calendar-react react
```

- React 19. React is a peer dependency.
- A runtime with `Temporal` (Node.js 26 and later include it), or a polyfill that defines
  `globalThis.Temporal`, loaded first.
- TypeScript 6 or later with `"lib": ["DOM", "DOM.Iterable", "ESNext"]`. `ESNext` has the
  `Temporal` types.

## Documentation

- [React components and hooks](https://moltenship-time.vercel.app/docs/api/react)
- [Repository](https://github.com/Moltenship/time)

## License

MIT
