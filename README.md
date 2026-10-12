# Moltenship Time

A React 19 calendar built on the Temporal API. Time handles dates, time zones, navigation, calendar
state, fast event lookups, and saving changes. Your events stay in the shape your app already uses.
Week, day, month, year, and agenda views come as shadcn/ui-style source that you copy into your app
and own.

**[Documentation](https://moltenship-time.vercel.app/docs)** ·
**[Live demo](https://moltenship-time-demo.vercel.app)**

> **Status: pre-1.0.** The packages aren't published to npm yet, and the API will change before 1.0.

## Install

After the first release:

```bash
pnpm add @moltenship/calendar react react-dom
```

You need React 19, a runtime with `Temporal` (Node.js 26+; a polyfill in browsers without it), and
TypeScript 6+ with `"lib": ["ESNext"]`.

## Example

The smallest calendar, with a hand-written view. The
[Quick start](https://moltenship-time.vercel.app/docs/quick-start) uses the built-in views instead.

```tsx
import {
  createCalendar,
  defineCalendarView,
  defineEventAdapter,
  plainDateInterval,
} from "@moltenship/calendar";

interface Meeting {
  id: string;
  title: string;
  start: Temporal.Instant;
  end: Temporal.Instant;
}

const eventAdapter = defineEventAdapter<Meeting>()({
  getId: (meeting) => meeting.id,
  getTitle: (meeting) => meeting.title,
  getInterval: (meeting) => ({ kind: "timed", start: meeting.start, end: meeting.end }),
  getResourceIds: () => [],
});

// A minimal view: the meetings on the visible day.
const dayView = defineCalendarView({
  name: "day",
  strategy: {
    getRange: (date) => plainDateInterval(date, date.add({ days: 1 })),
    navigate: (date, delta) => date.add({ days: delta }),
    getTitle: (range, { locale }) => range.start.toLocaleString(locale, { dateStyle: "full" }),
    project: ({ snapshot, instantRange }) => snapshot.queryTimed(instantRange),
  },
  Renderer: ({ projection }) => (
    <ul>
      {projection.map((meeting) => (
        <li key={meeting.id}>{meeting.title}</li>
      ))}
    </ul>
  ),
});

const Calendar = createCalendar<Meeting>()({ eventAdapter, views: [dayView] });

export function MeetingCalendar({ meetings }: { meetings: readonly Meeting[] }) {
  return (
    <Calendar.Root
      events={meetings}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="Europe/Berlin"
      locale="en-US"
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <Calendar.PreviousTrigger>Previous</Calendar.PreviousTrigger>
      <Calendar.Title />
      <Calendar.NextTrigger>Next</Calendar.NextTrigger>
      <Calendar.ActiveView />
    </Calendar.Root>
  );
}
```

## Documentation

Read the docs at **[moltenship-time.vercel.app](https://moltenship-time.vercel.app/docs)**. Good
places to start:

- [Quick start](https://moltenship-time.vercel.app/docs/quick-start)
- [Events and adapters](https://moltenship-time.vercel.app/docs/concepts/events)
- [Interactions](https://moltenship-time.vercel.app/docs/interactions)

The [live demo](https://moltenship-time-demo.vercel.app) is a Google Calendar-style app built from
the same views. Its source is in [`apps/demo`](./apps/demo).

To work on the docs, run `vp run dev` and edit the MDX in
[`apps/showcase/content/docs`](./apps/showcase/content/docs). Start the demo with
`vp run demo#dev`.

## Contributing

The repository uses the [Vite+](https://viteplus.dev/guide/) toolchain (`vp`) and Node.js 26.

```bash
vp install         # install dependencies
vp check           # format, lint, and type-check
vp test            # run the tests
vp run ready       # everything CI runs
vp run ready:full  # the release gate
```

- [`architecture.md`](./architecture.md) is the design the project is building toward.
- [`docs/adr`](./docs/adr) records individual design decisions.
- [`docs/internal`](./docs/internal) has contributor notes: quality gates, package layout,
  benchmarks, and verification records.
- Planned work is tracked in [GitHub issues](https://github.com/Moltenship/time/issues).

## License

[MIT](./LICENSE)
