# @moltenship/calendar-recurrence

Recurring events for Moltenship Time. It expands a series, a master event with an RRULE plus the
events that replace single occurrences, into the occurrences for a range of dates. It turns a change
to one occurrence into what to save for "this event", "this and following events" or "all events".

It's a separate package: `@moltenship/calendar` doesn't re-export it, and the calendar doesn't need
it. Occurrences reach the calendar as ordinary events, through an adapter. It doesn't use React.

## Install

```bash
pnpm add @moltenship/calendar-recurrence
```

You need a runtime with `Temporal` (Node.js 26 and later include it; elsewhere, a polyfill loaded
first) and TypeScript 6 or later with `"lib": ["ESNext"]`.

```ts
import { expandRecurrenceRule } from "@moltenship/calendar-recurrence";

const start = Temporal.ZonedDateTime.from("2026-10-19T09:00[Europe/Berlin]").toInstant();
const { dates } = expandRecurrenceRule(
  { frequency: "WEEKLY", byDay: [{ weekday: "MO" }], count: 3 },
  { kind: "timed", start, end: start.add({ minutes: 30 }), sourceTimeZone: "Europe/Berlin" },
);
// 09:00 in Berlin on 19 and 26 October and 2 November, across the switch to winter time
```

## Documentation

Read the [Recurrence API](https://moltenship-time.vercel.app/docs/api/recurrence). The source is
at [github.com/Moltenship/time](https://github.com/Moltenship/time).

## License

MIT
