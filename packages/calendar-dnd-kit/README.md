# @moltenship/calendar-dnd-kit

An optional [dnd-kit](https://dndkit.com) adapter for Moltenship Time. Apps that already use
dnd-kit drag their own items into the calendar, such as unscheduled tasks dropped on a time slot,
a day or a resource, and drag calendar events out to their own droppables, such as an
"unscheduled" list. Drops go through the calendar's hit-testing, snapping, policies and
`onEventChange`, like any drag. The calendar's own drags stay on native Pointer Events.

```tsx
import { DragDropProvider, useDraggable } from "@dnd-kit/react";
import { CalendarDndKit, calendarDropData } from "@moltenship/calendar-dnd-kit";

<DragDropProvider>
  <CalendarDndKit />
  <TaskList />
  <Calendar.Root …>…</Calendar.Root>
</DragDropProvider>;

function TaskCard({ task }: { task: Task }) {
  const { ref } = useDraggable({
    id: task.id,
    data: { task, ...calendarDropData({ event: toMeeting(task), duration: { minutes: 30 } }) },
  });
  return <li ref={ref}>{task.title}</li>;
}
```

## Install

```bash
pnpm add @moltenship/calendar @moltenship/calendar-dnd-kit @dnd-kit/react @dnd-kit/dom react react-dom
```

- dnd-kit's `@dnd-kit/react` and `@dnd-kit/dom` 0.5. They are peer dependencies, and still pre-1.0,
  so this package takes 0.5 only.
- React 19. React is a peer dependency.
- A runtime with `Temporal` (Node.js 26 and later include it), or a polyfill that defines
  `globalThis.Temporal`, loaded first.
- TypeScript 6 or later with `"lib": ["DOM", "DOM.Iterable", "ESNext"]`.

`@moltenship/calendar` doesn't re-export this package, so the calendar's install and bundles carry
no dnd-kit.

## Documentation

- [dnd-kit adapter](https://time.molten.sh/docs/api/dnd-kit)
- [Repository](https://github.com/Moltenship/time)

## License

MIT
