# @moltenship/calendar-core

The event engine of Moltenship Time: event adapters, validation, snapshots, queries, view
projections, layouts and event changes. It doesn't use React or the DOM, so it also runs on a
server or in a worker.

It's a layer of `@moltenship/calendar`, which re-exports all of it. Most apps install
`@moltenship/calendar` only and import from there. Install this package directly when you want to
validate or query events in code that never loads React. Next to `@moltenship/calendar`, use the
same version of both, so there's one copy of each.

## Install

```bash
pnpm add @moltenship/calendar-core
```

- A runtime with `Temporal` (Node.js 26 and later include it), or a polyfill that defines
  `globalThis.Temporal`, loaded first.
- TypeScript 6 or later with `"lib": ["ESNext"]`, which includes the `Temporal` types.

Import from the package name only. Files inside the package aren't part of the API.

## Documentation

- [API reference](https://moltenship-time.vercel.app/docs/api)
- [Repository](https://github.com/Moltenship/time)

## License

MIT
