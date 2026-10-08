# Moltenship Time

A headless calendar for React 19, built on the Temporal API. Time handles dates, time zones,
navigation, calendar state, and fast event lookups. You render the calendar with your own components,
and your events stay in the shape your app already uses.

> **Status: pre-1.0.** The packages aren't published to npm yet, and the API will change before 1.0.
> Built-in month, week, day, and agenda views are in progress; today you write your own views.

## Install

After the first release:

```bash
pnpm add @moltenship/calendar react react-dom
```

You need React 19, a runtime with `Temporal` (Node.js 26+; a polyfill in browsers without it), and
TypeScript 6+ with `"lib": ["ESNext"]`.

## Example

```tsx
import {
  createCalendar,
  defineEventAdapter,
  type CalendarViewRegistration,
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

// A minimal view: the meetings that start on the visible day.
const dayView: CalendarViewRegistration<Meeting, never> = {
  name: "day",
  capabilities: [],
  getTitle: (date, { locale }) => date.toLocaleString(locale, { dateStyle: "full" }),
  navigate: (date, direction) => date.add({ days: direction }),
  render: ({ state, meta }) => (
    <ul>
      {meta.eventSnapshot.events
        .filter((event) => event.kind === "timed")
        .filter((event) =>
          event.start.toZonedDateTimeISO(state.timeZone).toPlainDate().equals(state.anchorDate),
        )
        .map((event) => (
          <li key={event.id}>{event.title}</li>
        ))}
    </ul>
  ),
};

const Calendar = createCalendar({ eventAdapter, views: [dayView] });
const weekRules = { firstDay: 1, minimalDays: 4, weekend: [6, 7] } as const;

export function MeetingCalendar({ meetings }: { meetings: readonly Meeting[] }) {
  return (
    <Calendar.Root
      events={meetings}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="Europe/Berlin"
      locale="en-US"
      weekRules={weekRules}
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

The documentation site lives in [`apps/showcase`](./apps/showcase). It isn't hosted yet, so run it
locally with `vp run dev`, or read the pages as MDX in
[`apps/showcase/content/docs`](./apps/showcase/content/docs). Good places to start:

- [Quick start](./apps/showcase/content/docs/quick-start.mdx)
- [Events and adapters](./apps/showcase/content/docs/concepts/events.mdx)
- [Time and time zones](./apps/showcase/content/docs/concepts/time.mdx)

## Contributing

The repository uses the [Vite+](https://viteplus.dev/guide/) toolchain (`vp`) and Node.js 26.

```bash
vp install       # install dependencies
vp check         # format, lint, and type-check
vp test          # run the tests
vp run ready     # everything CI runs
```

- [`architecture.md`](./architecture.md) is the design the project is building toward.
- [`docs/adr`](./docs/adr) records individual design decisions.
- [`docs/internal`](./docs/internal) has contributor notes: quality gates, package layout,
  benchmarks, and verification records.
- Planned work is tracked in [GitHub issues](https://github.com/Moltenship/time/issues).
