<h1 align="center">
  <a href="https://time.molten.sh">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="./.github/assets/wordmark-dark.svg">
      <img alt="Moltenship Time" src="./.github/assets/wordmark-light.svg" height="72">
    </picture>
  </a>
</h1>

<p align="center">
  A calendar engine on the Temporal API with exact time zones and recurrence. React views you copy
  and own, a SolidJS 2 preview, and actions an AI agent can call.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@moltenship/calendar"><img alt="npm version" src="https://img.shields.io/npm/v/@moltenship/calendar/next?label=npm&color=f54a00"></a>
  <a href="https://github.com/Moltenship/time/actions/workflows/ci.yml"><img alt="CI status" src="https://github.com/Moltenship/time/actions/workflows/ci.yml/badge.svg?branch=main"></a>
  <a href="./LICENSE"><img alt="MIT license" src="https://img.shields.io/npm/l/@moltenship/calendar?color=737373"></a>
</p>

<p align="center">
  <a href="https://time.molten.sh/docs"><b>Documentation</b></a> ·
  <a href="https://time.molten.sh/docs/react/quick-start">Quick start</a> ·
  <a href="https://moltenship-time-demo.vercel.app">Live demo</a> ·
  <a href="https://github.com/Moltenship/time/releases">Releases</a>
</p>

<p align="center">
  <a href="https://moltenship-time-demo.vercel.app">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="./.github/assets/demo-dark.png">
      <img alt="The live demo's week view, with overlapping events, an all-day row and the current-time line" src="./.github/assets/demo-light.png" width="100%">
    </picture>
  </a>
</p>

Time handles dates, time zones, navigation, calendar state, fast event lookups, and saving changes.
Your events stay in the shape your app already uses, and Time reads them through a small adapter.
The engine imports no UI framework. React renders it, and SolidJS 2 renders it as a preview. The
screenshot is the [live demo](https://moltenship-time-demo.vercel.app), a Google Calendar-style
React app built from the same views. Its source is in [`apps/demo`](./apps/demo).

> [!NOTE]
> Time 2.0 is a pre-release. It rebuilds the calendar's parts on [ui-sdk](https://ui-sdk.dev),
> which is itself in beta, so the API can still change before 2.0.0. Coming from 1.x? See
> [Migrating to 2.0](https://time.molten.sh/docs/react/migrating-to-2).

## Features

- **Temporal, not `Date`.** Timed events use `Temporal.Instant`, all-day events use
  `Temporal.PlainDate`, and floating events use `Temporal.PlainDateTime`.
- **Time zones and daylight saving time.** Time lays out days that are 23 or 25 hours long, and
  hours that a clock change skips or repeats.
- **Your event shape.** An adapter tells Time how to read an ID, a title and a time range from your
  records. TypeScript keeps your record and ID types.
- **Views you own.** Week, day, month, year, agenda, resource columns and resource timeline are
  React source files built on shadcn/ui. The shadcn CLI copies them into your app, in Tailwind CSS
  or StyleX.
- **Headless underneath.** The packages ship no styles, and the registry's views are one UI on top
  of them. Restyle it with tokens, edit the files, swap its controls, or build your own UI with
  MUI or any other library. See [Customization](https://time.molten.sh/docs/react/customization).
- **Editing.** In React, people drag, resize and create events with a mouse, a pen or touch. Each
  edit arrives as a change for you to save. It shows as pending while it saves and rolls back if
  saving fails.
- **Controlled or uncontrolled state.** The calendar or your app can own the visible date, the
  view, the time zone, the selection and the focus.
- **Server rendering.** During server rendering, Time doesn't read the clock, the host time zone or
  `window`, so the server and the browser render the same markup from the same props.
- **Recurrence and iCalendar.** Separate packages expand RRULE series inside the visible range and
  parse ICS feeds.
- **Agents.** The calendar's parts are ui-sdk components, so an AI agent can list a calendar's
  events, navigate, switch views, and create, rename, move, resize and delete events. An agent
  reaches a calendar only after your app creates ui-sdk's agent bridge, and deleting is off until
  you turn it on. Your app decides what an agent may do and saves every change itself. See
  [Agents](https://time.molten.sh/docs/react/agents).
- **React and Solid.** One package holds the calendar's state and actions, and it imports no
  framework. The React integration is complete. The
  [SolidJS 2](https://time.molten.sh/docs/solid) integration is a preview. It has the same parts
  and hooks, keyboard navigation, dragging and undo, and no ready-made views yet, so you write each
  view as a Solid component. [React and Solid](https://time.molten.sh/docs/react/frameworks) lists
  what the two share.

[Comparison](https://time.molten.sh/docs/react/comparison) sets Time beside FullCalendar and
react-big-calendar, including where they're ahead.

## Install

In a React app:

```bash
pnpm add @moltenship/calendar@next @ui-sdk/core @ui-sdk/react react react-dom
```

In a SolidJS 2 app:

```bash
pnpm add @moltenship/calendar-solid@next @moltenship/calendar-core@next solid-js @solidjs/web @ui-sdk/core @ui-sdk/solid
```

Time 2.0 is a pre-release on npm's `next` tag, so both commands install `@next`.

Time needs:

- React 19, or SolidJS 2.0 for the preview.
- `@ui-sdk/core`, with `@ui-sdk/react` or `@ui-sdk/solid` beside it. They are peer dependencies
  since 2.0.
- A runtime with `Temporal`. Node.js 26 and later include it. In a browser without it, load a
  polyfill before the calendar. Time never bundles one.
- TypeScript 6 or later with `"lib": ["DOM", "DOM.Iterable", "ESNext"]`.

[Installation](https://time.molten.sh/docs/react/installation) covers the polyfill, the TypeScript setup
and the Solid compiler.

## Quick start

The smallest React calendar, with a hand-written view:

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

In a Solid app the adapter and the view's strategy are the same, `createCalendar` comes from
`@moltenship/calendar-solid`, and the `Renderer` is a Solid component.
[Solid](https://time.molten.sh/docs/solid/quick-start) has that calendar.

### Add the built-in views

The styled views aren't in the npm package. They are React source files. Add the week and day,
month, and agenda views with the shadcn CLI:

```bash
npx shadcn@latest add \
  https://time.molten.sh/r/time-grid-view.json \
  https://time.molten.sh/r/month-view.json \
  https://time.molten.sh/r/list-view.json
```

The files land in `components/calendar/`, along with the theme, the toolbar and the view switcher.
The [Quick start](https://time.molten.sh/docs/react/quick-start) wires them into `createCalendar`.

## Packages

A React app imports `@moltenship/calendar` alone. It re-exports the React, pointer-interaction,
core and Temporal packages. A Solid app imports `@moltenship/calendar-solid` and
`@moltenship/calendar-core`.

| Package | What it does |
| --- | --- |
| [`@moltenship/calendar`](./packages/calendar) | The package a React app installs: React components and hooks, the event engine, Temporal helpers and pointer interactions. |
| [`@moltenship/calendar-solid`](./packages/calendar-solid) | The SolidJS 2 integration, a preview: the parts, the hooks, keyboard navigation, dragging and undo, without ready-made views. |
| [`@moltenship/calendar-recurrence`](./packages/calendar-recurrence) | RRULE expansion inside a range, exceptions and series edits. |
| [`@moltenship/ics`](./packages/ics) | Typed iCalendar (RFC 5545) parsing into Temporal values, with Standard Schema support. |
| [`@moltenship/calendar-dnd-kit`](./packages/calendar-dnd-kit) | A dnd-kit adapter: drag your own items into the calendar and events out. |
| [`@moltenship/calendar-testing`](./packages/calendar-testing) | Test helpers: a deterministic environment, builders and fixtures, a render harness, and keyboard and pointer drivers. |
| [`@moltenship/calendar-react`](./packages/calendar-react) | The headless React components and hooks. |
| [`@moltenship/calendar-primitives`](./packages/calendar-primitives) | The calendar's state and actions, and the actions an agent can call, written once on ui-sdk for both integrations. |
| [`@moltenship/calendar-dnd`](./packages/calendar-dnd) | Pointer drag, resize and create interactions for views. |
| [`@moltenship/calendar-core`](./packages/calendar-core) | The framework-independent engine: event data, projection, layout and interactions. |
| [`@moltenship/calendar-temporal`](./packages/calendar-temporal) | Framework-independent Temporal utilities. |

## Documentation

The docs are at **[time.molten.sh](https://time.molten.sh/docs)**. Good places to start:

- [Quick start](https://time.molten.sh/docs/react/quick-start)
- [React and Solid](https://time.molten.sh/docs/react/frameworks)
- [Events and adapters](https://time.molten.sh/docs/react/concepts/events)
- [Interactions](https://time.molten.sh/docs/react/interactions)
- [Theming](https://time.molten.sh/docs/react/theming)
- [Agents](https://time.molten.sh/docs/react/agents)

### For coding agents

The docs are written to be read by a coding agent too:

- [`/llms.txt`](https://time.molten.sh/llms.txt) is the index, and every page has a Markdown
  version: add `.md` to its address. [`/llms-full.txt`](https://time.molten.sh/llms-full.txt) is
  every page in one file.
- `@moltenship/calendar@next` ships the same docs, for the version you installed, in
  `node_modules/@moltenship/calendar/docs`.
- An [Agent Skill](https://agentskills.io) teaches an agent the library:

  ```bash
  npx skills add Moltenship/time --skill moltenship-time
  ```

  Its source is in [`packages/calendar/skills`](./packages/calendar/skills/moltenship-time), and it
  ships in the package beside the docs.

See [Build with a coding agent](https://time.molten.sh/docs/react/agents/coding-agents).

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
- [`docs/internal`](./docs/internal) has contributor notes: quality gates, package layout and
  releasing.
- Planned work is tracked in [GitHub issues](https://github.com/Moltenship/time/issues).
- Each release's notes are on [GitHub Releases](https://github.com/Moltenship/time/releases);
  [`CHANGELOG.md`](./CHANGELOG.md) has `1.0.0-rc.1`'s.

## License

[MIT](./LICENSE). `@moltenship/ics` also bundles Unicode CLDR data under the Unicode License v3, so
it's `MIT AND Unicode-3.0`; see its
[THIRD-PARTY-NOTICES.md](./packages/ics/THIRD-PARTY-NOTICES.md).
