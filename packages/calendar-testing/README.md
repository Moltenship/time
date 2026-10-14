# @moltenship/calendar-testing

Test helpers for apps built on Moltenship Time: test the calendar you built, with your copies of
the registry views, your policies and your save logic.

- **A deterministic environment.** `createTestEnvironment()` fixes `now`, the time zone, the locale,
  the week rules and the direction, and passes them to `Root` as props. The calendar reads the
  current time only from `now` or `clock`, so nothing global is patched.
- **Builders and fixtures.** `buildEvent`, `buildAllDayEvent`, `buildResource`,
  `buildRecurringEvent` and `buildAvailability` make typed records with defaults you override.
  `denseDayFixture`, `dstWeekFixture`, `multiZoneSeriesFixture` and `resourceDayFixture` are ready
  datasets for contract tests.
- **A render harness.** `renderCalendar(Calendar, options)` renders your calendar's `Root` with
  controlled events inside React's `act`, applies the changes it saves, and records every
  `onEventChange` and `onEventChangeResult` call. `hydrateCalendar` renders on the server first and
  fails on a hydration mismatch.
- **Queries and drivers.** Find events by title, ID or start, and day cells, time columns and
  resources by the attributes views carry for the pointer layer. `calendar.keyboard` grabs, steps,
  resizes, creates, drops and cancels through the keyboard grab mode; `calendar.pointer` drags with
  a mouse, a pen or a finger where the page is laid out.
- **Assertions.** `settled()` waits for pending changes; `announcements()` and `lastAnnouncement()`
  read the `Announcer`; `placementOf(event)` says where an event shows, as comparable text.

It uses only the public API of `@moltenship/calendar` and `@moltenship/calendar-recurrence`, and
depends on no test runner: it works in Vitest with jsdom or happy-dom, and in Vitest's browser
mode, which the pointer drivers need: jsdom and happy-dom don't lay pages out.

```tsx
import { buildEvent, cleanup, renderCalendar } from "@moltenship/calendar-testing";
import { afterEach, expect, test } from "vitest";

import { Calendar } from "./calendar";

afterEach(cleanup);

test("a saved move reaches onEventChange", async () => {
  const calendar = await renderCalendar(Calendar, {
    events: [buildEvent({ title: "Standup", start: "2026-10-08T09:00" })],
  });

  // Focus the event, Space, four slots down, Enter.
  await calendar.keyboard.moveEvent("Standup", { down: 4 });
  await calendar.settled();

  expect(calendar.changes.map((change) => change.cause)).toEqual(["move"]);
  expect(calendar.placementOf("Standup").range).toBe("2026-10-08T10:00:00Z/2026-10-08T11:00:00Z");
});
```

## Install

```bash
pnpm add -D @moltenship/calendar-testing
```

- React 19 and React DOM 19, peer dependencies.
- A runtime with `Temporal` (Node.js 26 and later include it). Elsewhere, add
  `if (!("Temporal" in globalThis)) await import("temporal-polyfill/global");` to your test setup
  file; the package never installs a polyfill itself.
- TypeScript 6 or later with `"lib": ["DOM", "DOM.Iterable", "ESNext"]`.

## Documentation

- [Testing](https://time.molten.sh/docs/testing)
- [Repository](https://github.com/Moltenship/time)

## License

MIT
