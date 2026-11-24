# Test a calendar

`@moltenship/calendar-testing` renders your real `Calendar`, fixes the clock and the zone, and gives you queries and keyboard and pointer drivers. It depends on no test runner; the examples use Vitest with jsdom. The full page is `docs/testing.md`.

```bash
pnpm add -D @moltenship/calendar-testing vitest jsdom
```

Its peers are `react`, `react-dom`, `@ui-sdk/core` and `@ui-sdk/react`, which a 2.0 app already has.

```ts title="vitest.config.ts"
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "jsdom", setupFiles: ["./tests/setup.ts"] },
});
```

```ts title="tests/setup.ts"
// Only on a runtime without Temporal. Node.js 26 has it.
if (!("Temporal" in globalThis)) await import("temporal-polyfill/global");
```

## A test

```tsx title="calendar.test.tsx"
import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
} from "@moltenship/calendar";
import {
  buildEvent,
  cleanup,
  createTestEnvironment,
  renderCalendar,
} from "@moltenship/calendar-testing";
import { afterEach, expect, test } from "vitest";

import { createWeekView } from "@/components/calendar/time-grid-view/time-grid-view";

type Meeting = CalendarEvent<null>;

const Calendar = createCalendar<Meeting>()({
  eventAdapter: createCanonicalEventAdapter<null>(),
  views: [createWeekView<Meeting>()],
});

afterEach(cleanup);

// Thursday, 8 October 2026 at noon UTC unless you say otherwise.
const environment = createTestEnvironment({ timeZone: "Europe/Berlin" });
const standup = buildEvent({ title: "Standup", start: environment.at("09:00") });

test("a saved move reaches onEventChange and the events", async () => {
  const calendar = await renderCalendar(Calendar, { environment, events: [standup] });

  await calendar.propose({
    cause: "move",
    eventId: "Standup",
    proposed: {
      kind: "timed",
      start: environment.at("10:00"),
      end: environment.at("10:30"),
    },
  });

  expect(calendar.changes.map((change) => change.cause)).toEqual(["move"]);
  expect(calendar.results[0]?.result.status).toBe("committed");
  expect(String(calendar.events()[0]?.start)).toBe("2026-10-08T08:00:00Z");
});
```

Test the app's own `Calendar` where you can: import it from the app instead of creating one in the test, and pass `applyChange` and `createEvent` to the harness for the app's record shape. The default `applyCanonicalChange` only knows canonical events.

## What you get

| Piece                                  | Use                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| `createTestEnvironment(options?)`      | A fixed `now`, time zone, locale and week rules. `environment.at("09:00")` is an instant on its date |
| `buildEvent`, `buildAllDayEvent`, `buildResource`, `buildRecurringEvent`, `buildAvailability` | Canonical records with defaults. An event's ID defaults to its title |
| `renderCalendar(Calendar, options)`    | Renders `Root` inside `act` and returns the harness. It owns the events and applies saved changes |
| `hydrateCalendar(Calendar, options)`   | Renders on the server, hydrates, and throws on a mismatch                              |
| `calendar.changes`, `calendar.results` | Every `onEventChange` change, and every `onEventChangeResult` call as `{ result, detail }` |
| `calendar.events()`, `state()`, `meta()`, `pendingChanges()` | What the calendar has now                                         |
| `calendar.act(callback)`               | Calls the actions inside `act`: `await calendar.act((actions) => actions.setView("day"))` |
| `calendar.propose(proposal)`           | `proposeEventChange` inside `act`, resolved once it settles                            |
| `calendar.settled()`                   | Waits until no change is pending                                                       |
| `calendar.getEvent`, `queryEvent`, `getDayCell`, `getTimeColumn`, `placementOf` | Queries by ID, title or start, not by rendered text      |
| `calendar.keyboard`                    | `moveEvent`, `resizeEvent`, `createEvent`, `focusEvent`, `focusCell`, `press`           |
| `calendar.pointer`                     | Real Pointer Event drags. Browser only                                                 |
| `calendar.lastAnnouncement()`          | What the `Announcer` said. Pass `messages` to render one                               |
| Fixtures, such as `dstWeekFixture()`   | Ready datasets for hard cases: DST weeks, many zones, series                           |

Other `Root` props go through `rootProps`: `rootProps: { policies: [timedOnly], label: "Team calendar" }`. What `Root` renders goes through `children`; it's `<Calendar.ActiveView />` by default.

## Keyboard

```tsx
// Focus the event, Space, two slots down and a day across, then Enter.
await calendar.keyboard.moveEvent("Standup", { across: 1, down: 2 });
await calendar.settled();

expect(calendar.placementOf("Standup").wallRange).toBe("2026-10-09T09:30/2026-10-09T10:30");
expect(calendar.results[0]?.detail.input).toBe("keyboard");
```

Drivers return once their keys are handled, not when the change is saved. Call `settled()` before asserting on a save.

## An agent's change

No model is involved: a step is a plain object, run through the real bridge.

```tsx title="calendar.test.tsx"
import { createAgent } from "@ui-sdk/react/agent";

test("an agent's move is saved like a person's, and says who asked", async () => {
  const agent = createAgent();
  const calendar = await renderCalendar(Calendar, {
    environment,
    events: [standup],
    // An agent finds a calendar by its name, on the frame.
    rootProps: { label: "Team calendar" },
    children: (
      <Calendar.Frame>
        <Calendar.ActiveView />
      </Calendar.Frame>
    ),
  });

  const outcome = await calendar.act(() =>
    agent.act({
      steps: [
        {
          ref: "Team calendar",
          action: "moveEvent",
          // Every action takes one object.
          args: [{ eventId: "Standup", start: "2026-10-08T11:00" }],
        },
      ],
    }),
  );
  await calendar.settled();

  expect(outcome.ok).toBe(true);
  // The step's result is the change, with how it ended.
  expect(outcome.steps[0]?.result).toMatchObject({ cause: "move", status: "saved" });
  expect(calendar.results[0]?.detail.input).toBe("agent");
  expect(calendar.placementOf("Standup").wallRange).toBe("2026-10-08T11:00/2026-10-08T12:00");
});
```

Three things make it work: the frame as `children` (the harness renders no frame by default), the agent's call inside `calendar.act`, and `settled()` before reading `results`.

Test the app's own bridge too: import it, run a step its `allow` should refuse, and expect `ok: false` with `The app refused …` in `error.message`. Test a policy's refusal the same way, expecting its reason in the message.

Without the harness, in your own render: wrap `agent.act` in React's `act`, and stub `ResizeObserver` and `matchMedia` in jsdom if the views need them.

## What jsdom can't do

jsdom and happy-dom lay nothing out: every element is an empty box at the top left, and nothing scrolls.

- The pointer drivers throw `PointerLayoutError`. Run pointer tests in Vitest's browser mode (`docs/testing.md#pointer-and-touch`), and give the calendar a height there.
- Sizes, scrolling, virtualization and what's visible aren't there to test.
- CSS doesn't apply.
- A script's click reads `source: "programmatic"` in a state handler, not `"mouse"`.

Queries, the keyboard drivers, saves, announcements, hydration and agent steps work in jsdom.

## Rules

- **Fix time through props, not fake timers.** The environment sets `now`, the zone, the locale and the week rules. Don't patch `Temporal.Now` or `Date`.
- **Find events with the queries**, not by text: a view formats times by locale.
- **Assert with `placementOf(event).range` or `.wallRange`.** They're text, and read plainly when they fail.
- **`afterEach(cleanup)`**, or calendars pile up in the document.
- **Don't mock the calendar.** Render the real one; that's what the package is for.
