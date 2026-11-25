# Mistakes agents make with this library

These are the mistakes this library's shape makes easy: the ones a coding agent makes when it guesses from other calendar libraries, or from the 1.x API. Check your work against the list before you finish.

## Dates and times

| Mistake                                                        | Fix                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `new Date()` or an ISO string as an event's `start`            | `Temporal.Instant.from("2026-10-08T07:00:00Z")` for timed events. Convert where data enters the app |
| An all-day event that ends on its last day                     | The end is exclusive: one day on October 8 is `start: 2026-10-08`, `end: 2026-10-09`        |
| `Temporal.PlainDate` in a `kind: "timed"` interval             | Timed takes instants, all-day takes plain dates, floating takes plain date-times             |
| No time zone on `Root`, expecting the browser's                | Pass `defaultTimeZone`. For the person's zone: `Temporal.Now.timeZoneId()`, read in the browser |
| `Temporal.Now` during server rendering                         | Pass `now` from the server and a fixed `defaultAnchorDate`, or hydration mismatches          |
| Assuming `Temporal` exists everywhere                          | Load a polyfill before any calendar import where it's missing (`docs/installation.md`)       |
| Adding hours to move an event across a DST change              | Use the placement helpers (`moveEventPlacement`) or wall-clock arithmetic on a `ZonedDateTime` |

## Structure

| Mistake                                                        | Fix                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `createCalendar` inside a component                            | Module scope. A new `Calendar` each render remounts everything                               |
| `createCalendar<Meeting>({ … })` or `defineEventAdapter<Meeting>({ … })` | Both are called twice: `createCalendar<Meeting>()({ … })`                         |
| Importing a view from `@moltenship/calendar`                   | Views are source in the app: `@/components/calendar/…`. Add them with `shadcn add`           |
| Looking for a view's code in `node_modules`                    | It's in `components/calendar/`. Edit it there                                                |
| Importing `useCalendarActions` from the package                | Use `Calendar.useCalendarActions()`, from the calendar you created, so the types are yours   |
| A hook or part outside `Root`                                  | Move it inside. It throws `calendar-hook-outside-root`                                       |
| A calendar with no height                                      | Give `Calendar.Frame` a height; `Viewport` takes `min-h-0 flex-1`                            |
| Missing `"use client"` in the App Router                       | Calendar modules are Client Components                                                       |
| Wrapping the calendar in a context "provider" you invented     | `Root` is the provider. There is no other                                                    |
| `shadcn add` into an app whose style isn't `base-*`            | The views need Base UI primitives. Check `components.json` first                             |
| Installing only `@moltenship/calendar` on 2.0                  | Also `@ui-sdk/core` and `@ui-sdk/react`, on the calendar's version                           |
| No `@layer ui-sdk;` before `@import "tailwindcss"`             | ui-sdk's popover CSS wins over Tailwind: the view select's list loses its look               |
| Selecting `[data-slot="calendar"]` to find a shadcn date picker | In 2.0 `Calendar.Frame` renders it too. Scope the selector, or use `data-calendar-part="frame"` for the scheduler |
| `useCalendarPointer` from `@moltenship/calendar-dnd` on 2.0     | 2.0 moved it to the React integration. Import it from `@moltenship/calendar`                 |

## State

| Mistake                                                        | Fix                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `view={view}` without `onViewChange`                           | A controlled value never changes on its own. Add the handler, or use `defaultView`           |
| Both `view` and `defaultView`                                  | One or the other                                                                             |
| `selection={undefined}` to clear a controlled selection        | `undefined` means uncontrolled. Pass `null`                                                  |
| Reading state with `useCalendarState()` for one value          | `useCalendarSelector((state) => state.view)` re-renders less                                 |
| A new `clock`, or a new `selection` object, each render        | Those are compared by identity. Keep them in state or at module scope                        |

## Changes

| Mistake                                                        | Fix                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Expecting the calendar to move the event itself                | It proposes. `onEventChange` must update the `events` you pass                               |
| No `onEventChange`, then wondering why nothing drags           | Without it the calendar is read-only                                                         |
| Mutating a record in `onEventChange`                           | Return new records. Untouched ones stay the same objects                                     |
| Reading `change.proposed.start` on a delete                    | `proposed` is `null` for a delete. Check `cause` first                                       |
| Treating `change.id` as the event's ID                         | It's the change's ID. The event's is `change.eventId`, `null` for a create                   |
| A create handler that forgets to make an ID and a title        | A create brings a placement and no record                                                    |
| Validation by throwing in `onEventChange`                      | Write a policy. Its `reason` reaches people and agents; a thrown error reads `handler-error` |
| Side effects in a policy                                       | Policies also run for previews, where nothing is saved                                       |
| `await proposeEventChange(…)` in a `try`/`catch`               | It never rejects. Read `result.status`                                                       |
| Applying a slow save's result over a newer edit                | Number changes as they start (`docs/interactions.md#pending-changes`)                        |
| An exhaustive `switch` on `detail.input` with three cases      | 2.0 adds `"agent"`: four values                                                              |
| `onEventChange={save}` where `save` has its own second parameter | 2.0 passes the detail second. Wrap it: `onEventChange={(change) => save(change)}`          |
| An `onEventChange` that starts a save and returns nothing      | The change counts as saved at once. Return the promise, so it shows as pending until it lands |

## Agents

| Mistake                                                        | Fix                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| No `label` on `Root`                                           | The agent's name for the calendar becomes its title, which changes on every navigation       |
| No `Calendar.Frame`                                            | The calendar isn't listed for agents                                                         |
| A bridge per component, or created in render                   | One `createAgent()` for the app, in its own module                                           |
| `createAgent()` with no `allow` in production                  | Without `allow` every step runs. List what's permitted                                       |
| `allowAgentDelete` with `allow: () => true`                    | A delete needs a person's yes: return a promise from `allow` (`docs/agents/deleting.md`)     |
| An `allow` that asks only for `deleteEvent`, with a ui-sdk delete button on the page | An agent's `press` on that button deletes as the agent. Ask for it too, or hide the button with `data-agent-hidden` |
| Passing `{ input: "api" }` from a button to keep a change from counting as the agent's | What an agent's step causes is `"agent"`, whatever the code passes |
| Importing `@ui-sdk/react/agent` in a Next.js route handler     | On the server, `agentTools` comes from `@ui-sdk/core/agent`                                  |
| Calling a model from the browser                               | The key stays on the server. The page only runs tool calls                                   |
| Positional arguments: `args: ["review", "2026-10-09T10:00"]`   | Every action takes one object: `args: [{ eventId: "review", start: "2026-10-09T10:00" }]`    |
| An `onEventChange` that ignores `detail`                       | An agent's title arrives as `detail.fields.title`. Store it, or the event is saved unnamed   |
| Storing `detail.fields` as it came                             | Nothing inside it is checked. Take the fields the app knows, and check each one's type      |
| Listing events right after a `createEvent` that's `"saving"`    | The new event is listed once the app's `events` has it. Read `getChange` first             |
| An allow-list without `describeCalendar`, `listEvents`, `getChange` | Reading is made of steps. Without them the agent can't learn an event's ID              |
| Reading `status: "saving"` or `"validating"` as saved          | It isn't done. `getChange({ changeId })` says how it ended                                   |
| Telling the model about an action that isn't there             | The fifteen actions are in `agent-ready.md`. There's no dry run and no bulk action           |
| Listing each action's arguments in the system prompt           | Send the model to `describeCalendar`, which returns them for the version installed           |
| A system prompt with today's date pasted in                    | `describeCalendar` returns `today` and `now` in the calendar's time zone                     |
| Expecting `deleteEvent` to fail with a calendar error          | Without `allowAgentDelete` the action isn't there: the bridge says the calendar doesn't take it |
| Catching exceptions around `agent.act`                         | A failed step resolves with `ok: false`. Send the message back to the model as a result      |
| Two versions of `@ui-sdk/core`                                 | The agent sees `[]`. Keep every `@ui-sdk/*` package on one version                           |
| A model ID from memory                                         | Use a current one, such as `claude-opus-5-5`, `claude-sonnet-5-5` or `claude-haiku-5-5`      |

## Tests

| Mistake                                                        | Fix                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Fake timers or a patched `Temporal.Now` to fix the date        | `createTestEnvironment()` fixes it through props                                             |
| Pointer drags in jsdom                                         | jsdom has no layout. Use the keyboard drivers there, and browser mode for pointers           |
| Asserting right after a driver                                 | `await calendar.settled()` first                                                             |
| Finding an event by its rendered text                          | `calendar.getEvent("Standup")`: by ID or title, whatever the locale                          |
| Asserting `detail.source === "mouse"` after a scripted click   | A script's click reads `"programmatic"`                                                      |
| Mocking `@moltenship/calendar`                                 | Render the real calendar with `renderCalendar`                                               |
