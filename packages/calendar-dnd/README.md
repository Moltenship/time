# @moltenship/calendar-dnd

The pointer layer of Moltenship Time: drag to move, resize and create events inside a view, on
native Pointer Events. Drags become change proposals for your app to save. `useCalendarPointer`
does this in a view's Renderer, and `attachCalendarPointer` outside a React component.

It also takes drags across the calendar's edge: `startCalendarDrop` drops items dragged in from
the rest of the page, such as unscheduled tasks, into the view under them, and
`monitorCalendarDrags` lets drop zones outside the calendar take events dragged out of it, and
lets an animation follow each drag. A drag library's binding drives them.

It's a layer of `@moltenship/calendar`, which re-exports all of it. Most apps install
`@moltenship/calendar` only and import `useCalendarPointer` from there.

## Install

```bash
pnpm add @moltenship/calendar-dnd react
```

- React 19. React is a peer dependency.
- A runtime with `Temporal` (Node.js 26 and later include it), or a polyfill that defines
  `globalThis.Temporal`, loaded first.
- TypeScript 6 or later with `"lib": ["DOM", "DOM.Iterable", "ESNext"]`. `ESNext` has the
  `Temporal` types.

## Documentation

- [Interactions](https://time.molten.sh/docs/interactions)
- [Repository](https://github.com/Moltenship/time)

## License

MIT
