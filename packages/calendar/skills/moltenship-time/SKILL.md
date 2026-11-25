---
name: moltenship-time
description: Builds calendars with Moltenship Time (@moltenship/calendar), a headless calendar on the Temporal API, built on ui-sdk, with a complete React integration and a SolidJS 2 preview. Covers composing week, day, month, year, agenda and resource views from the registry, controlling view, date and time zone, saving moved, resized, created and deleted events, policies and undo, making the calendar usable by AI agents through the ui-sdk agent bridge and WebMCP, and testing with @moltenship/calendar-testing. Use whenever a project has @moltenship/calendar or @moltenship/calendar-solid installed, or the user mentions Moltenship Time.
---

# Build with Moltenship Time

Moltenship Time is a headless calendar. The npm packages hold the behaviour: state, dates and time zones, layout, drag and keyboard editing, recurrence. The views (week, month, agenda and the rest) are source files the app owns, added with the shadcn CLI. Since 2.0 the calendar's parts are [ui-sdk](https://ui-sdk.dev) components, so an AI agent can read the calendar and act on it once the app creates ui-sdk's agent bridge.

The engine and the calendar's state import no UI framework. The React integration is complete, and the registry's views are React source. The SolidJS 2 integration is a preview with the same hooks, keyboard navigation and dragging included. Its registry has fewer views: the week and day, the month, the year, the agenda, and the scrolling month and agenda. This file describes React unless it says otherwise.

## Read first

The docs for the installed version ship in the package, as Markdown:

- `node_modules/@moltenship/calendar/docs/llms.txt` is the index. Read it first.
- Then read only the pages the task needs, such as `docs/interactions.md` or `docs/agents/connect.md`. Links between pages are relative paths.
- The API is those docs and the `.d.ts` types. Don't read compiled JavaScript in `dist`. When the docs and types don't answer, write a small test that tries it (see [references/testing.md](references/testing.md)).

The same docs are online at https://time.molten.sh/docs, with `https://time.molten.sh/llms.txt` as the index and `.md` after any page's address for its Markdown. Prefer the installed copy: it matches the version in the project.

If the package isn't installed yet, in a React app:

```bash
pnpm add @moltenship/calendar@next @ui-sdk/core @ui-sdk/react react react-dom
```

Time 2.0 is a pre-release on npm's `next` tag, so the command installs `@next`.

`@ui-sdk/core` and `@ui-sdk/react` are peer dependencies since 2.0. Use the project's package manager. The runtime needs `Temporal`: Node.js 26 has it, and a browser without it needs a polyfill loaded before the calendar (`docs/installation.md`). A SolidJS 2 app installs other packages, which [references/solid.md](references/solid.md) lists.

## How it fits together

```text
your records ──adapter──▶ createCalendar({ eventAdapter, views }) ──▶ Calendar
                                                                        │
<Calendar.Root events=… onEventChange=…>      state, saving, policies   │
  <Calendar.Frame>                            the element agents find   │
    <CalendarToolbar calendar={Calendar} />   registry source, yours    │
    <Calendar.Viewport>
      <Calendar.ActiveView />                 the active view's Renderer
```

- **The app owns the events.** The calendar never stores or edits them. It proposes a change, and `onEventChange` saves it and updates the `events` you pass.
- **An adapter reads your records.** `defineEventAdapter<Meeting>()({ getId, getTitle, getInterval, getResourceIds })`. You don't convert records to a library shape.
- **`createCalendar` returns a typed `Calendar`**: its parts (`Calendar.Root`, `Calendar.Frame`, …) and hooks (`Calendar.useCalendarActions()`, …). Create it once, at module scope.
- **Views are source in the app**, usually `components/calendar/`. Edit them there.
- **Six state values**: `view`, `anchorDate`, `timeZone`, `selection`, `focus`, `expandedResourceIds`. Each is uncontrolled (`defaultView`) or controlled (`view` + `onViewChange`).

## Pick your path

1. **Put a calendar on a page, or add a view**: [references/compose.md](references/compose.md).
2. **Read or control the view, date, time zone or selection**: [references/state.md](references/state.md).
3. **Save changes, restrict them, undo them**: [references/changes.md](references/changes.md).
4. **Let an AI agent use the calendar**: [references/agent-ready.md](references/agent-ready.md).
5. **Test it**: [references/testing.md](references/testing.md).
6. **SolidJS**: [references/solid.md](references/solid.md). It's a preview with fewer views and no testing package; read that file before promising anything.

Before you finish, check your work against [references/mistakes.md](references/mistakes.md).

## Rules for every path

- **`Temporal`, never `Date`.** A timed event's `start` and `end` are `Temporal.Instant`, an all-day event's are `Temporal.PlainDate`, a floating one's `Temporal.PlainDateTime`. `anchorDate` is a `Temporal.PlainDate`. Convert at the edge of the app: `Temporal.Instant.from(record.startsAt)`.
- **Ends are exclusive.** An all-day event on October 8 has `end` October 9. A range is never empty or reversed.
- **Time zones are explicit.** `Root` needs `defaultTimeZone` or `timeZone` (an IANA name), `locale` and `weekRules`. Nothing reads the system zone for you.
- **Import from `@moltenship/calendar`.** It re-exports the React integration, the engine and the Temporal helpers. Add `@moltenship/calendar-recurrence`, `@moltenship/ics` or `@moltenship/calendar-dnd-kit` only for those features. Don't import `@moltenship/calendar-core`, `-react`, `-primitives`, `-temporal` or `-dnd` in an app.
- **Use the hooks on your `Calendar`**, such as `Calendar.useCalendarActions()`, inside its `Root`. They carry your event and view types. Outside `Root` they throw `calendar-hook-outside-root`.
- **Without `onEventChange` the calendar is read-only**, for people and agents alike.
- **Give the frame a height.** The views fill `Calendar.Frame` and scroll inside it.
- **Calendar modules are Client Components** in the Next.js App Router: start the file with `"use client"`.
- **Keep one copy of `@ui-sdk/core`.** Every `@ui-sdk/*` package on the same version. With two copies an agent sees no calendar.
- **Don't invent API.** If a name isn't in the docs or the types, it doesn't exist. `Root` has no `onEventClick`, the views have no `onEventClick` option, and an agent's actions are the fifteen in agent-ready.md and no others. What a view does on a click is in its source, which the app owns.

## When you're done

1. **Typecheck** with the project's own command.
2. **Run the tests**, and add one for what you built. A calendar that agents use gets a test that runs a step through the bridge (testing.md has it).
3. **Look at it in a browser** when you changed what people see. jsdom lays nothing out, so sizes, scrolling and pointer drags aren't checked there.
4. **Report** each command you ran with its exit code, what you couldn't check, and anything the docs or types got wrong.
