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

0.1 — Working calendar, 0.2 — Keyboard & accessibility and 0.3 — Resource views are closed.
`main` deploys automatically through Vercel's GitHub integration:

- Demo: https://moltenship-time-demo.vercel.app
- Docs: https://moltenship-time.vercel.app

UI source uses shadcn's default Base UI primitives, not Radix. Dependencies are kept at their
latest releases.

## In flight outside the milestones

- #105 scrolling views: week, day and month that scroll without end and snap to days or weeks,
  as separate registry views, with `getLoadRange` on strategies and `onVisibleRangeChange` on
  `Root` for loading events ahead of the scroll.

- #119 timeline annotations (Amie-style rail in the time grid), approved by the owner and being
  implemented in two phases: the core/React model in #124, then the registry parts, demo and docs.
  Draft #122 is the prototype and won't be merged.

## Next: 1.0 — Public release

On hold until the owner has reviewed 0.1–0.3. The issues (#43, #45–#47) still carry their original
scope and get rescoped to Scope / Done when / Later before work starts.

## Later

Deferred work. Each item is listed under "Later" in the issue it came from; open a new issue when
one is picked up.

- List virtualization for large ranges (#30)
- Business hours and availability (#32)
- Equal, compact and stacked overlap policies (#33)
- Optional dnd-kit adapter (#37)
- Layout and frame budgets, browser matrix

Later milestones:

| Milestone                      | Issues          | Scope                                                                         |
| ------------------------------ | --------------- | ----------------------------------------------------------------------------- |
| Post-1.0 — Recurrence          | #48, #49        | Range-bounded recurrence, exceptions, detached occurrences                    |

Issues in these milestones still carry their original, heavier scope. Rescope each one to
Scope / Done when / Later before starting it.

## How we work

- One issue → one branch → one PR with `Closes #N`. Larger issues may ship in phases, one PR per
  phase; the last one closes the issue.
- The issue's "Done when" list is the acceptance check. There are no separate gate issues and no
  evidence attachments.
- Run `vp check` and `vp test` before pushing, plus any `vp run` gate the change touches.
- Every PR gets a code review. Fix each finding, or reply with the reason you didn't. While GitHub
  Actions is capped on this account, CI and Pullfrog don't run: run `vp run ready` locally and post
  the result on the PR, and get the review from GPT-6.1-Sol (high) instead of Pullfrog.
- Merge with squash once the review has no open blocker or should-fix findings, the checks pass
  (locally while Actions is capped) and the Vercel previews are green. If Vercel rate-limits
  deployments, retry after the limit resets. Rebase on `main` first if behind.
- UI changes include light and dark screenshots. Docs show live, theme-aware UI, not screenshots.
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
