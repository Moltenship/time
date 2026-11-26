# @moltenship/calendar

Moltenship Time for React 19, a headless calendar built on the Temporal API. This is the package a
React app installs and imports. It has the React components and hooks, the event engine, the
Temporal helpers and the pointer interactions. Its parts are [ui-sdk](https://ui-sdk.dev)
components, so an AI agent can read a calendar and act on it once your app creates ui-sdk's agent
bridge. A SolidJS 2 app installs
[`@moltenship/calendar-solid`](https://time.molten.sh/docs/solid) instead.

Coming from 1.x? See [Migrating to 2.0](https://time.molten.sh/docs/react/migrating-to-2).

```ts
import { createCalendar, defineCalendarView, plainDateInterval } from "@moltenship/calendar";
```

It re-exports `@moltenship/calendar-react`, `@moltenship/calendar-dnd`,
`@moltenship/calendar-core` and `@moltenship/calendar-temporal`, which it depends on, so you don't
add them yourself. Recurrence (`@moltenship/calendar-recurrence`) and iCalendar
parsing (`@moltenship/ics`) are separate packages that you add when you need them.

## Install

```bash
pnpm add @moltenship/calendar @ui-sdk/core @ui-sdk/react react react-dom
```

- React 19. React is a peer dependency.
- `@ui-sdk/core` and `@ui-sdk/react` 0.1 beta, peer dependencies since 2.0. `@ui-sdk/react` needs
  React DOM. Keep one copy of `@ui-sdk/core` in your app: the calendar and an agent bridge find
  each other through it.
- A runtime with `Temporal` (Node.js 26 and later include it), or a polyfill that defines
  `globalThis.Temporal`, loaded before the calendar. The package never bundles one.
- TypeScript 6 or later with `"lib": ["DOM", "DOM.Iterable", "ESNext"]`. `ESNext` has the
  `Temporal` types.

The styled views, toolbar and theme aren't in this package. They're source files
that you add to your app with the shadcn CLI and then own; see
[Installation](https://time.molten.sh/docs/react/installation).

## For coding agents

The package ships its docs and a skill, so a coding agent reads the API of the version you
installed:

- `docs/llms.txt` is the index of the docs, and `docs/` has each page as Markdown.
- `skills/moltenship-time` is an [Agent Skill](https://agentskills.io): `SKILL.md` and its
  `references/`. Install it with `npx skills add Moltenship/time --skill moltenship-time`, or copy
  the folder into your agent's skills folder.

See [Build with a coding agent](https://time.molten.sh/docs/react/agents/coding-agents).

## Documentation

- [Docs](https://time.molten.sh/docs), starting with the
  [Quick start](https://time.molten.sh/docs/react/quick-start)
- [Agents](https://time.molten.sh/docs/react/agents)
- [Repository](https://github.com/Moltenship/time)

## License

MIT
