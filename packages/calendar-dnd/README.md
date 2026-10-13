# @moltenship/calendar-dnd

The pointer layer of Moltenship Time: drag to move, resize and create events inside a view, on
native Pointer Events. Drags become change proposals that your `onEventChange` handler saves.
`useCalendarPointer` does this in a view's Renderer, and `attachCalendarPointer` does it without
React.

It's an internal layer of `@moltenship/calendar`, which re-exports all of it. Most apps install
`@moltenship/calendar` only and import `useCalendarPointer` from there.

## Install

```bash
pnpm add @moltenship/calendar-dnd react
```

- React 19. React is a peer dependency.
- A runtime with `Temporal` (Node.js 26 and later include it), or a polyfill that defines
  `globalThis.Temporal`, loaded first.
- TypeScript 6 or later with `"lib": ["ESNext"]`, which includes the `Temporal` types.

## Documentation

- [Interactions](https://moltenship-time.vercel.app/docs/interactions)
- [Repository](https://github.com/Moltenship/time)

## License

MIT
