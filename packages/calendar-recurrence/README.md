# @moltenship/calendar-recurrence

Recurring events for Moltenship Time. A series is a master event with an RRULE, plus the events
that replace single occurrences. This package expands a series into its occurrences for a range of
dates. It also turns a change to one occurrence into what to save for "this event", "this and
following events" or "all events".

It's a separate package: `@moltenship/calendar` doesn't re-export it, and the calendar doesn't need
it. Occurrences reach the calendar as ordinary events, through an adapter. It doesn't use React.
Use the same version as `@moltenship/calendar`, so they share one copy of the engine.

## Install

```bash
pnpm add @moltenship/calendar-recurrence
```

- A runtime with `Temporal` (Node.js 26 and later include it), or a polyfill that defines
  `globalThis.Temporal`, loaded first.
- TypeScript 6 or later with `"lib": ["ESNext"]`, which includes the `Temporal` types.

## Example

```ts
import { expandRecurrenceRule } from "@moltenship/calendar-recurrence";

const start = Temporal.ZonedDateTime.from("2026-10-19T09:00[Europe/Berlin]").toInstant();
const { dates } = expandRecurrenceRule(
  { frequency: "WEEKLY", byDay: [{ weekday: "MO" }], count: 3 },
  { kind: "timed", start, end: start.add({ minutes: 30 }), sourceTimeZone: "Europe/Berlin" },
);
// Three instants: 09:00 in Berlin on 19 and 26 October and 2 November, across the switch to
// winter time (07:00Z, then 08:00Z).
```

## Documentation

- [Recurrence API](https://moltenship-time.vercel.app/docs/api/recurrence)
- [Repository](https://github.com/Moltenship/time)

## License

MIT
