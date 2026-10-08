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

0.1 — Working calendar is closed. Deployed from `main`:

- Demo: https://moltenship-time-demo.vercel.app
- Docs: https://moltenship-time.vercel.app

UI source uses shadcn's default Base UI primitives, not Radix. Dependencies are kept at their
latest releases.

## Next: 0.2 — Keyboard & accessibility

Planned and rescoped, not started. Milestone:
[0.2 — Keyboard & accessibility](https://github.com/Moltenship/time/milestone/2).

| Issue | Scope                                                                                                         |
| ----- | ------------------------------------------------------------------------------------------------------------- |
| #36   | Keyboard engine: typed focus model, spatial navigation per view, keyboard transactions, announcement builders |
| #97   | Keyboard and ARIA in the registry views and the demo, built on #36                                            |
| #98   | Accessibility quality: axe checks in CI, token contrast, reduced motion, RTL layout, accessibility docs       |

#36 comes first. #97 can start with ARIA semantics and focus styling, then wires keyboard
behaviour once #36's API lands. #98 starts with axe and contrast and writes the keyboard docs
after #36 and #97 merge.

After 0.2 comes 0.3 — Resource views (#39–#42): resource hierarchy and projections first, then
resource columns and the resource timeline in parallel.

## Later

Deferred work. Each item is listed under "Later" in the issue it came from; open a new issue when
one is picked up.

- List virtualization for large ranges (#30)
- Business hours and availability (#32)
- Equal, compact and stacked overlap policies (#33)
- Optional dnd-kit adapter (#37)
- Layout and frame budgets, browser matrix
- RTL key mapping (#36)

Later milestones:

| Milestone                      | Issues          | Scope                                                                         |
| ------------------------------ | --------------- | ----------------------------------------------------------------------------- |
| 0.3 — Resource views           | #39–#42         | Resource hierarchy and projections, resource columns, resource timeline       |
| 1.0 — Public release           | #43, #45–#47    | shadcn registry distribution, testing package, release automation, audit      |
| Post-1.0 — Recurrence          | #48, #49        | Range-bounded recurrence, exceptions, detached occurrences                    |

Issues in these milestones still carry their original, heavier scope. Rescope each one to
Scope / Done when / Later before starting it.

## How we work

- One issue → one branch → one PR with `Closes #N`. Larger issues may ship in phases, one PR per
  phase; the last one closes the issue.
- The issue's "Done when" list is the acceptance check. There are no separate gate issues and no
  evidence attachments.
- Run `vp check` and `vp test` before pushing, plus any `vp run` gate the change touches.
- Pullfrog reviews every PR. Fix each comment, or reply in its thread with the reason you didn't.
- Merge with squash once Pullfrog approves and CI is green. Rebase on `main` first if behind.
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
- Keyboard grab / move / resize comes in 0.2 (#36). Until then, pointer changes have equivalents
  through the transaction API (#35) and the demo's event dialog (#71).
- Each issue's "Done when" list replaces the "performance, accessibility, and browser evidence"
  invariant.
