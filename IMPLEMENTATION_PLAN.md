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
| Quality gate   | #47              | The local gate in three tiers, the same tasks CI runs: `vp run ready:quick`, `ready` and `ready:full` (#179); the a11y suite fixed at the causes of CI's flakes, and run at CI's speed in the full gate (#178); the a11y suite and real mouse and keyboard interactions in Firefox and WebKit, WebKit on `temporal-polyfill` (`vp run browsers`, #183) |
| Release audit  | #47 (phase 1)    | `docs/internal/release-audit.md`: each invariant in `architecture.md` linked to its proof, the gaps filed (#180–#182, #184–#192), the open p0 and p1 issues triaged |
| Release tooling | #46             | One version for the seven published packages, `CHANGELOG.md` and `release:version`; size budgets, API reports, publint and are-the-types-wrong checks, an offline clean-consumer install and a dry run that writes a manifest; a manual publish step, local or from a `workflow_dispatch` workflow with provenance, that refuses without a passing dry run. Runbook in `docs/internal/releasing.md`. MIT `LICENSE` in every tarball (#175) |

0.1 — Working calendar, 0.2 — Keyboard & accessibility, 0.3 — Resource views and
0.4 — Availability, layout & scale are closed. Epic #2, recurrence, closes with #155.
`main` deploys automatically through Vercel's GitHub integration. Other branches and PRs don't
deploy (`git.deploymentEnabled` in each app's `vercel.json`), so the Hobby limit of 100 deployments
a day goes to production:

- Demo: https://moltenship-time-demo.vercel.app
- Docs: https://moltenship-time.vercel.app

UI source uses shadcn's default Base UI primitives, not Radix. Dependencies are kept at their
latest releases.

## Next: 1.0 — Public release

The shadcn registry shipped (#43) and `calendar-testing` stays private until after 1.0 (#45). Release
tooling (#46) is done. Next is the second phase of the release audit (#47): the showcase and fixtures on
the packed release artifacts, the full release dry run, the screen-reader passes (#186) and the
release candidate report, with a green CI `browsers` run (#192). The audit's proposed 1.0 blockers:
#185, #186.

## Later

Deferred work. Use the linked open issue where one exists; otherwise open a new issue from the source
issue's "Later" section when work starts.

- Annotations in month, agenda and resource views (#132)
- Cross-browser test matrix: Chromium, Firefox, WebKit (#133); the first Firefox and WebKit run's
  follow-ups: WebKit failures (#181), Playwright's Firefox on macOS 27 (#182)
- Release audit findings for after 1.0 unless the owner says otherwise: an empty week's focus
  target (#180), the store's records (#184), DST shifts (#187), performance benchmarks (#188),
  resource-view parity (#189), the registry's client boundary (#190), transaction docs (#191)
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
- Release follow-ups from #46: changesets or per-package changelogs if versions stop moving
  together, git tags and GitHub releases from the publish step, npm staged publishing, budgets for
  minified bundles with dependencies, the benchmark gate in the release run
- Recurrence follow-ups from the #155 gate: DST folds and cancelled first occurrences in edits, ICS
  bridge quirks, expansion speed-ups (#160)

## How we work

- One issue → one branch → one PR with `Closes #N`. Larger issues may ship in phases, one PR per
  phase; the last one closes the issue.
- The issue's "Done when" list is the acceptance check. There are no separate gate issues and no
  evidence attachments.
- Run the quality gate tier the change needs before pushing (`AGENTS.md`, "Quality gate"):
  `vp run ready:quick` for docs and notes, `vp run ready` for other changes that ship, and
  `vp run ready:full` for package source, public API, dependencies, build config, registry items,
  release tooling, SSR, a11y-relevant UI and CI, before a release candidate or a release, and
  whenever CI and local disagree. Add any focused `vp run` gate the change touches.
- Every PR gets a code review. Fix each finding, or reply with the reason you didn't. While GitHub
  Actions is capped on this account, CI and Pullfrog don't run: run the tier the change needs
  locally and post the result on the PR, and get the review from Claude Opus 5.5 (xhigh) instead of
  Pullfrog.
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
