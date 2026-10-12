# Moltenship Time — Implementation Plan

> **Roadmap:** [#1](https://github.com/Moltenship/time/issues/1)
> **Design reference:** [architecture.md](./architecture.md)
> **Live status:** GitHub issues, milestones and "blocked by" links

Time is a Temporal-native React calendar: headless engines published to npm, editable views
shipped as shadcn-style registry source. This file is the short map. Issues hold the details.

## Done

| Area           | Issues           | What exists                                                                                                  |
| -------------- | ---------------- | ------------------------------------------------------------------------------------------------------------ |
| Foundation     | #12–#16, #18–#20 | Package topology, contracts and ADRs, fixtures and benchmark harness, SSR fixture, CI, risk spikes           |
| Engine         | #21–#24          | `calendar-temporal` intervals, zoned days, slots and DST; `calendar-core` snapshots and interval indexes     |
| Headless React | #25–#27          | `calendar-react` per-instance store, controlled state, SSR snapshots, typed factory, custom views            |
| Docs platform  | #68              | Fumadocs + Next.js site in `apps/showcase`                                                                   |
| 0.1 views      | #70, #28–#30, #32, #33 | View pipeline; theme and shell primitives; month, agenda, week and day views in `registry/`            |
| 0.1 editing    | #35, #37         | Transactions with optimistic overlay; native Pointer Events move, resize and create in `calendar-dnd`        |
| 0.1 demo, docs | #71–#73, #100    | Demo app, rewritten docs with live previews and anatomy diagrams, landing page with a live week view         |
| 0.2 keyboard   | #36, #97         | Focus model, spatial navigation, keyboard move/resize/create, announcements; wired into every view and the demo |
| 0.2 a11y       | #98              | axe checks (`vp run a11y`), configured in CI and currently run locally, token contrast test, reduced motion, RTL layout, accessibility docs         |
| 0.3 resources  | #39–#41          | Resource model and hierarchy, multi-resource fragments, resource columns and resource timeline views with virtualization, keyboard and pointer moves across resources |
| 0.4 availability | #129           | Working hours and exceptions, `block`/`warn` availability policy, closed-time shading in the time grid, resource columns, timeline and month, per-resource time zones with local time in headers |
| 0.4 layout     | #130             | `columns`, `equal` and `stack` overlap policies in the time grid and resource columns                        |
| 0.4 agenda     | #131             | Virtualized agenda with sticky date headers and focus kept by key; a scrolling agenda over months or years that lets apps load events by range |
| Scrolling views | #105            | Week, day and month views that scroll without end; `getLoadRange` on strategies and `onVisibleRangeChange` on `Root` |
| Annotations    | #119             | Timeline annotations: core model and snapshot, `annotations` / `annotationSources` on `Root`, a rail in the time grid |
| Year view      | #148             | Twelve month grids with a dot per event colour and a shared popover of a day's events; one tab stop across the year; read-only |
| iCalendar      | #151, #153       | Standalone `@moltenship/ics`: ICS text to typed Temporal values, TZID resolution, a Standard Schema parser with typed extensions; a docs reference with a playground and a guide to showing a feed |
| Time zones     | #165             | Secondary time zones (ADR 0165): `secondaryTimeZones` on `Root`, each hour line read in another zone on its own date (`timeGridZoneAxis`), an hour column per zone in the day, week, scrolling and resource columns views, notes on days a zone shifts, slot names with the time in each zone |
| Recurrence     | #48, #49, #155   | `@moltenship/calendar-recurrence` (ADR 0048), shipped through #156–#159: an RFC 5545 rule engine and RRULE text; range-bounded expansion with stable occurrence IDs, EXDATE, RDATE, overrides and an ICS bridge; "this / following / all" edits and the registry scope dialog. #155 closes epic #2 with the demo and docs, in a PR of their own, and a gate: a DST matrix, Google/Outlook/iCloud interop fixtures and a year-view expansion benchmark (`vp run recurrence:gate`) |
| Theme builder  | #166             | A docs page that edits every token of `calendar-theme.css` live, light and dark apart, over a scoped preview, with presets, contrast checks and CSS to copy; `--calendar-event-padding-x` and `-y` for time-grid events |
| shadcn registry | #43             | Every view, the shared parts, the theme, the recurrence scope dialog and `calendar-full`, built with `shadcn build` and served by the docs site at `/r/<item>.json`; `npx shadcn add <url>` tested in clean Vite and Next.js apps against packed packages (`vp run registry:e2e`); `compatibility.json` lists each item's runtime range for release tooling |
| Next.js recipe | #164             | A live App Router example at `/examples/nextjs` and a guide through its source: the view and date in the URL, a Server Component fetching that range, Server Actions saving changes with `useOptimistic`, a time zone cookie; `withAsciiSpaces`, so ranges formatted in Node hydrate in browsers |

0.1 — Working calendar, 0.2 — Keyboard & accessibility, 0.3 — Resource views and
0.4 — Availability, layout & scale are closed. Epic #2, recurrence, closes with #155.
`main` deploys automatically through Vercel's GitHub integration:

- Demo: https://moltenship-time-demo.vercel.app
- Docs: https://moltenship-time.vercel.app

UI source uses shadcn's default Base UI primitives, not Radix. Dependencies are kept at their
latest releases.

## Next: 1.0 — Public release

On hold until the owner has reviewed 0.1–0.4. The issues (#43, #45–#47) still carry their original
scope and get rescoped to Scope / Done when / Later before work starts.

## Later

Deferred work. Use the linked open issue where one exists; otherwise open a new issue from the source
issue's "Later" section when work starts.

- Annotations in month, agenda and resource views (#132)
- Cross-browser test matrix: Chromium, Firefox, WebKit (#133)
- Agenda follow-ups from #136 (#138)
- Capacity rules, buffers between bookings, free-slot search (#129)
- Per-calendar or per-resource overlap policy overrides (#130)
- Agenda grouping by calendar or resource, search and filter (#131)
- Optional dnd-kit adapter (#37)
- Layout and frame budgets
- Secondary time zone follow-ups from #165: a "swap zones" action, the now-line's time in each zone,
  the resource timeline's time header, and a label for the display zone
- Theme builder follow-ups (#166): shareable URL state, pasting a theme in, adding a palette colour,
  a month row height token
- Next.js example follow-ups (#164): scrolling views with the URL following, an event dialog to
  delete and rename, cached reads with `"use cache"`, revisions to refuse stale writes
- Registry follow-ups from #43: a registry per release (`/r/<version>/…`) so `main` never asks for
  an unpublished runtime, `@moltenship` in shadcn's registry directory, installing from GitHub
- Recurrence follow-ups from the #155 gate: DST folds and cancelled first occurrences in edits, ICS
  bridge quirks, expansion speed-ups (#160)

## How we work

- One issue → one branch → one PR with `Closes #N`. Larger issues may ship in phases, one PR per
  phase; the last one closes the issue.
- The issue's "Done when" list is the acceptance check. There are no separate gate issues and no
  evidence attachments.
- Run `vp check` and `vp test` before pushing, plus any `vp run` gate the change touches.
- Every PR gets a code review. Fix each finding, or reply with the reason you didn't. While GitHub
  Actions is capped on this account, CI and Pullfrog don't run: run `vp run ready` locally and post
  the result on the PR, and get the review from Claude Opus 5.5 (xhigh) instead of Pullfrog.
- Merge with squash once the review has no open blocker or should-fix findings and the checks pass
  (locally while Actions is capped). The Vercel checks don't gate merges. When Vercel's daily deploy
  limit is hit, production catches up with the next deploy after it resets. Rebase on `main` first
  if behind.
- UI changes include screenshots attached with `gh pr create/edit --attach`, as described in
  `AGENTS.md`: a before/after table for fixes, light/dark or demo screenshots for new UI. Docs show
  live, theme-aware UI, not screenshots.
- Keep native "blocked by" links and this file current when scope or order changes.

## Boundaries

- External events stay the source of truth. The calendar proposes changes; the app commits them.
- `calendar-core` and `calendar-temporal` stay free of React and the DOM.
- Native Temporal only, no `Date` fallback.
- Fumadocs and Next.js stay inside `apps/showcase`. `apps/demo` and the docs import only public
  package entry points and `registry/` source.
- If a PR changes a decision recorded in `architecture.md`, update that file in the same PR.

## Decisions changed in 0.1

`architecture.md` is the design reference. Three decisions changed in 0.1 and are reflected there:

- Pointer input uses native Pointer Events ([ADR 0037](./docs/adr/0037-native-pointer-events.md),
  superseding [ADR 0019](./docs/adr/0019-semantic-dnd-kit-adapter.md)). dnd-kit can return later as
  an optional adapter; the #19 spike stays as history.
- Keyboard grab / move / resize shipped in 0.2 (#36, #97) on the same transaction pipeline as
  pointer input.
- Each issue's "Done when" list replaces the "performance, accessibility, and browser evidence"
  invariant.
