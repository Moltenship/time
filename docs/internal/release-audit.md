# Release audit

The evidence index for 1.0 (#47): each invariant and decision in
[`architecture.md`](../../architecture.md), the test, gate or ADR that proves it, and the gaps.
Phase 1, 12 October 2026, on `main` after #176 (the shadcn registry), #178 (the a11y flakes) and
#179 (the quality gate tiers), with #183 (Firefox and WebKit). Phase 2, 13 October 2026, after
#177 (release tooling), #195 (the gate under load), #196 (READMEs and the `ics` license), #203
(the release artifacts), #204 (waits on conditions), #205 (the docs match the code) and #206 (the
gate policy and the release job).

How to read a row:

- **Proof** names the test file, and the test where a file holds several claims, or the gate or ADR.
  A claim in a doc is not proof, and neither is a test that no task runs.
- **Runs in** says where: `ci:test` is the root `vp test`, which picks up every `*.test.ts(x)` in the
  repo; `a11y` is `tools/a11y/tests/*.a11y.tsx` in Chromium. Both run in CI and in `vp run ready`.
  Steps only in the full tier (`vp run ready:full`, and `release:gate` in `vp run release`), or run
  by hand, say so.
- **Verdict:** proven; partial, with the rest listed as a gap; or a gap.

## Invariants

The checklist in `architecture.md` §26.

| Invariant | Proof | Runs in | Verdict |
| --- | --- | --- | --- |
| **External events stay authoritative** (ADR 0003). | `calendar-core/tests/event-transactions.test.ts`: pending until the handler settles, confirmed by revision, rolled back on a reject or a throw, the latest proposal wins, a late rejection is ignored. `event-overlay.test.ts`: the overlay never rebuilds the base indexes. `event-snapshots.test.ts`: the external-store contract. `calendar-react/tests/event-changes.test.tsx`. | `ci:test` | Proven |
| **Every interval is typed and half-open** (ADR 0002). | `calendar-temporal/tests/half-open.test.ts`; fast-check properties in `interval-operations.test.ts`, `iteration.property.test.ts` and the zoned slot and rounding tests; `calendar-core/tests/event-snapshots.test.ts`, "matches a simple reference for randomized half-open queries"; `timed-overlap.test.ts`. | `ci:test`, `engine:gate` | Proven |
| **No host time zone or current time is read implicitly during render** (ADR 0004). | `tests/temporal-utilities-boundary.test.ts`: only `calendar-temporal`'s system clock reads the time, and no package or registry view uses `Date`, across every package's source (new in this audit). `tests/ics-boundary.test.ts`. `calendar-react/tests/use-now.test.tsx`: no now on the server, the injected clock after. The DST matrix across `calendar-core/tests`. | `ci:test`, `a11y` | Proven; DST claim: gap 2 |
| **Core imports no React, DOM, Jotai, dnd-kit, Tailwind or app code.** The dependency law, §2 (ADR 0005). | `dependency-cruiser.config.ts`, run by `tests/dependency-boundaries.test.ts`: production source obeys the rules; known-bad deep imports fail statically and against the packed tarball; the manifest matrix; core, temporal and ics compile with `types: []` and no DOM. `tools/a11y`, `tools/release` and the spike folders sit outside the matrix (gap 15). | `package:graph`, `react:gate`, `ci:test` | Proven |
| **No work proportional to all events or resources inside a render or frame.** The §14 contract. | `benchmark#core` in `vp run engine:gate`: the 10k snapshot build and warm queries (`docs/internal/evidence/issue-24-engine-gate.md`). `vp run recurrence:gate`: 200 series in under 40 ms p95. Bounded DOM: `registry/tests/resource-timeline-view.test.tsx` (500 resources), `agenda-view.test.tsx` and `tools/a11y/tests/long-agenda.a11y.tsx` (10,000 events). No commits on pointer moves: `calendar-dnd/tests/use-calendar-pointer.test.tsx`. | Benchmarks by hand, on reference hardware; the rest `ci:test`, `a11y` | Partial: gap 3 |
| **Pointer interaction has keyboard and explicit-action equivalents.** | `packages/calendar/tests/month-parity.test.tsx` and `time-grid-parity.test.tsx`: the same changes and the same spoken text from pointer and keyboard, for move, both resizes and create, across DST and between the all-day row and the grid. `registry/tests/*-keyboard.test.tsx`; `proposeEventChange` in `event-changes.test.tsx`. Real mouse and keys in Chromium, Firefox and WebKit: `tools/a11y/tests/interactions.a11y.tsx`. Touch: `calendar-dnd/tests/attach-calendar-pointer.test.ts` (the long-press, a held page, a second finger), and `tools/a11y/tests/touch.a11y.tsx`: touch pointer events in every engine, real touches through CDP in Chromium (#217); iOS Safari itself is #220. No touch-versus-keyboard comparison. | `ci:test`, `a11y`, `browsers` | Partial: gap 4 |
| **Controlled state isn't mirrored through an effect** (ADR 0018, ADR 0070). | `calendar-react/tests/react-gate.test.tsx`: under Strict Mode the controlled-state matrix never renders a stale value, a Suspense transition rebases, selectors don't commit unrelated components. `store.test.ts`, `regressions.test.tsx`. | `react:gate`, `ci:test` | Proven |
| **A custom view needs no internal imports.** | `packages/calendar/tests/public-custom-view.test.tsx` imports only `@moltenship/calendar` and type-checks without casts; `react-gate.test.tsx`. | `react:factory`, `ci:test` | Proven |
| **Registry source uses semantic tokens and stays editable.** | `tools/registry`, through `registry:smoke` and `tools/registry/tests/*`: targets, dependencies, CSS variables (shadcn or `calendar-*`), compatibility ranges, a known-bad fixture. `vp run registry:e2e` installs `calendar-full` into clean Vite and Next.js apps and builds them. `registry/tests/theme-contrast.test.ts`. | `registry:smoke`, `ci:test`; `registry:e2e` on the dry run's tarballs, through `release:artifacts` in `ready:full` | Partial: gap 6 |
| **SSR markup is deterministic, or the client-only part is intentional.** | `apps/ssr-fixture/tests/ssr-fixture.test.ts`: render, hydrate, interact, unmount; its known-bad cases (a hydration mismatch, `window` at module scope) must fail. `calendar-react/tests/ssr-hydration.test.tsx`. `verify-public-api.mjs` fails the build without `"use client"`. Hydration tests for the time grid's zones, the resource timeline and the scrolling agenda, and the Next.js example's. The fixture's tests again on the packed tarballs, and the docs site built and its routes rendered on them (`release:artifacts`). Registry components that call hooks, create a context or set event handlers start with `"use client"`: `registry:smoke` checks the built registry, and `registry:e2e`'s Next.js page imports every item from a Server Component (#190). | `ssr:smoke`, `ci:test`, `ci:build`, `registry:smoke`; `release:artifacts` in `ready:full` | Proven |
| **The issue's "Done when" list is met, with tests for each claim.** | `IMPLEMENTATION_PLAN.md`, "How we work"; a review on every PR. | Review | Process |
| **No new boolean-prop matrix or god file.** | None automated. `Root` takes no mode booleans (`calendar-react/src/calendar-types.ts`). | Review | Gap 8 |

Other decisions, from §1 and the sections behind it:

| Decision | Proof | Runs in | Verdict |
| --- | --- | --- | --- |
| **Canonical event types and an `EventAdapter<TEvent>` for app-native records** (§4.2–§4.3). | `calendar-core/tests/contracts.test.ts`: "preserves application-native event and resource generics", "provides an identity adapter for every canonical event variant". `event-snapshots.test.ts`: a stable adapter reuses the snapshot; adapter failures stay inside the invalid-data policy. | `ci:test` | Proven |
| **Recurrence is a layer; the base packages stay recurrence-agnostic** (ADR 0048). | The manifest matrix in `tests/dependency-boundaries.test.ts`: no base package depends on `calendar-recurrence`. `packages/calendar-recurrence/tests`; the DST matrix, interop fixtures and benchmark in `vp run recurrence:gate`. | `ci:test`; `recurrence:gate` by hand | Proven |
| **iCalendar stands alone** (ADR 0151). | `tests/ics-boundary.test.ts`: no dependencies, self-contained declarations, no clock, host zone, `Date` or polyfill. The `ics` rules in `dependency-cruiser.config.ts`. | `ci:test`, `package:graph` | Proven |
| **An event has zero to many resources.** | `calendar-core/tests/resource-columns-projection.test.ts`: "keeps one canonical event behind every resource's fragment", "hides events without resources unless they get a bucket". `resources.test.ts` (the hierarchy), `resource-interactions.test.ts`. | `ci:test` | Proven |
| **WCAG 2.2 AA is a release gate.** | axe with the WCAG 2.2 A and AA and best-practice tags over every registry view, light and dark, the demo, popovers, dialogs, RTL and reduced motion; hovered controls on purpose (`tools/a11y`). Token contrast: `registry/tests/theme-contrast.test.ts`. Announcements: `registry/tests/announcements.test.ts`. The suite at CI's speed. | `a11y`, `ci:test`; `a11y:ci-speed` in `ready:full` | Partial: gaps 9, 10, 11 |
| **Modern browsers, with native Temporal or an app-installed polyfill.** | `vp run browsers`: the a11y suite and `interactions.a11y.tsx` in Firefox and WebKit, WebKit on `temporal-polyfill` installed by the test page as an app would, checked by a test. CI's `browsers` job passed seven dispatched runs in a row since #204's first version, [38358295207](https://github.com/Moltenship/time/actions/runs/38358295207) to [38367732111](https://github.com/Moltenship/time/actions/runs/38367732111) on `main` (#192, closed). Results below. | `browsers` in the full tier and the release; CI on demand, which `vp run release` waits for on macOS 27 | Partial: gaps 10, 12 |
| **Curated exports; a size budget per package.** | Every package exports `.` and `./package.json`, with `dist` through `publishConfig`. Packed-tarball checks for `calendar-temporal`, `calendar-core` and `calendar-react` (`tests/dependency-boundaries.test.ts`), a README and the LICENSE in each tarball, and `ics`'s Unicode-3.0 notice in its tarball and its built code (`tests/package-metadata.test.ts`, `tests/ics-boundary.test.ts`, #196). An ESM budget for every published entry point in `tools/release/src/config.ts`, a committed API report per package, publint and are-the-types-wrong on every tarball (`release:check`, #46). | `ci:build`, `release:check`, `ci:test` | Proven; `CalendarEventSource`, which nothing accepted, is built (gap 17, #200) |
| **The upgrade story** (§24): semver and lockstep versions, explicit registry diffs, a generated changelog and release checks, publishing as an explicit step. | The MIT LICENSE and package links (#175). Registry compatibility ranges and `compatibility.json` (#176). One version for the published packages; the release checks and a dry run that checks the registry against the packed version (#46). Releasing is one explicit command, `vp run release`: the bump in a release commit, the full gate on it, a staged publish of the gate's tarballs approved with one 2FA, guarded by `publishProblems`, then the npm check (integrity, dist-tag, approver), release notes generated from the Conventional Commits, and an install from npm (`docs/internal/releasing.md`). `tools/release/tests/release.test.ts`, `publish.test.ts`, `published.test.ts`, `github-release.test.ts`, `version.test.ts`. | `registry:smoke`, `release:check`, `ci:test`; the dry run in `ready:full`; the whole release up to the publish rehearsed by `vp run release --dry-run` | Partial: staging, the approval and a resume haven't run against npm yet; the first release with the command proves them |
| **The docs and fixtures run on what we publish** (§15, §20; #47, #203). | `vp run release:artifacts` (`tools/release/src/artifacts.ts`), after the dry run, on its tarballs and registry with their hashes checked: the SSR fixture's tests, and the docs site's production build, every route through `next start` and its example tests, each in a copy outside the workspace installed from the pnpm store, its lockfile checked against the tarballs' hashes and the workspace's third-party versions; #43's `shadcn add` into clean Vite and Next.js apps, typechecked and built, with the hashes it served checked against the dry run's. `tools/release/tests/manifest.test.ts`, `isolated.test.ts`, `artifacts.test.ts`; `tools/registry/tests/lockfile.test.ts`. | `ready:full`, `release:gate` | Proven |
| **No English from core** (§18). | Core formats through `Intl` with the environment's locale. Announcements go through the typed `CalendarAnnouncementMessages`, with English defaults in registry source. Since #205, §18 says labels are props, or registry source the app owns and edits to localize. | `ci:test` | Proven; gap 14 for the owner to confirm |

## The gate

Properties of the quality gate itself, from #47, not decisions in `architecture.md`.

| Property | Proof | Runs in | Verdict |
| --- | --- | --- | --- |
| **The full tier passes or fails on the code, at the load other agents put on a shared machine.** | Browser runs one at a time in `gate:browsers`, each on half the cores, and the unit tests on half (#195). Tests wait on conditions, not time (`tools/a11y/tests/render.tsx`, #204). Beside six spinning threads on 15 cores, uncached (`vp run --no-cache ready:full`), on `main`'s code after #206: 3 of 3 passed, in 117, 113 and 113 s, with no step from cache. | `ci:test`, every browser run; the load check by hand | Proven at that load; gap 18 |
| **A stuck browser run fails in minutes, naming what's stuck.** | `tools/a11y/watchdog.ts`: no test finished for two minutes, or a run past ten, and it names the files and tests, cancels, then kills (`tools/a11y/watchdog.test.ts`). | `ci:test`; every browser run | Proven |
| **A release runs the whole full tier, strict, on the commit it publishes** (#206). | `release:gate`: the serial lane with `release:dry-run --require-clean`, then the three browser runs. `vp run release` runs it on the release commit, and on macOS 27, where Firefox doesn't start (#182), waits for CI's Firefox job on that commit's parent. `vp run release 1.0.0-rc.2 --dry-run` passed it on a bumped release commit in 193 s. `tools/release/tests/workflow.test.ts` pins CI's on-demand `release-gate` job to it, read-only, and fails if a workflow gets npm credentials or a publish step. Release installs read metadata from npm on a cold cache (`lacksMetadata`, `installFromStore`, `tools/release/tests/isolated.test.ts`), with a lockfile check. Green on fresh runners at #206's later commits, [38363085068](https://github.com/Moltenship/time/actions/runs/38363085068) and [38365174860](https://github.com/Moltenship/time/actions/runs/38365174860), and on `main`: [38367732111](https://github.com/Moltenship/time/actions/runs/38367732111). | `ci:test`; `release:gate`; CI's `release-gate` on demand | Proven |

## Gaps

Closed by the audit's PRs:

- The a11y job, red on every `main` commit since #158 (#178): a focus-scroll race in the scrolling agenda, muted text under 4.5:1 on hovered rows and days in seven places, and tests that read state before it settled. CI on `main` is green since.
- CI and local disagreeing (#179): the local gate in three tiers, the same task names in CI, the a11y suite at CI's speed in the full gate, and the races that running steps in parallel turned up.
- Only Chromium ran anything (#183): `vp run browsers`, the polyfill path, and real mouse and keyboard interactions everywhere.
- `navigateToday` read `Temporal.Now` outside the clock boundary (#193): it goes through the system clock, and the boundary test now covers every package's source and the registry.
- `docs/internal/quality-gates.md` listed old size budgets and a Jotai check that doesn't exist, and `docs/internal/package-topology.md`'s import table differed from the enforced matrix (#193).
- The full gate failed under load (#195, #204). Three browser runs at once with up to 12 pages each, beside the build and the unit tests, ran tests out of time, and some runs stalled for 20 to 35 minutes. Tests slept for fixed times or gave steps 1 s deadlines. React's "not wrapped in act" warning, sent to Node thousands of times a file, was most of the year view's popover test. A unit test compared wall times.
- Packages without READMEs, and `ics`'s license (#196): a README in every tarball; `ics` is `MIT AND Unicode-3.0`, with the CLDR notice in its tarball and its built code.
- The showcase and fixtures ran on workspace source (#203): `release:artifacts` runs them on the dry run's tarballs.
- The release job skipped the browser runs, and its clean consumer couldn't install on a cold runner (#206).

Open:

1. ~~**§10 describes transaction APIs the code doesn't have.**~~ Closed by #205 (#191). It filed #198 to #202: see gap 17.
2. **DST gap shifts.** Since #205, §4.5 says what's true: snapped drops never land in a skipped hour, and nothing carries or announces a shift. *Owner decision:* whole-day moves resolve a gap with Temporal's `"compatible"` rule whatever `disambiguation` says, and shift silently; close on the docs, or build the announced shift. #187.
3. **The performance contract.** Its numbers are local reference-hardware benchmarks, not run in CI or `ready:full`, by design. The layout and pointer-frame rows time reference code, and nothing measures scrolling; the scrolling agenda re-projects its whole load range on each anchor move. #188.
4. **Parity in the resource views**: no pointer-versus-keyboard equality check for resource columns or the resource timeline. #189.
5. ~~**The store's records.** #205 rewrote `architecture.md` for `calendar-react`'s own store; still open is a short ADR that supersedes ADR 0025 (Jotai).~~ Closed by #216 (#184): ADR 0070.
6. **A literal colour in registry source**: `registry/time-grid-view/time-grid-annotations.tsx` draws the annotation icon disc with `bg-white/35 text-black/70`, over the mark's colour. *Owner decision:* a token, or a documented exception.
7. ~~**Registry views don't declare `"use client"`**: a Server Component that imports a view directly fails.~~ Closed by #213 (#190).
8. **God files**: no check. The largest: `calendar-recurrence/src/series/expander.ts` (815 lines), `calendar-core/src/snapshots/event-snapshot.ts` (708), `calendar-react/src/root.ts` (687), `ics/src/types.ts` (621), `calendar-recurrence/src/edits/series.ts` (528), `registry/time-grid-view/time-grid-annotations.tsx` (520). *Owner decision:* a `max-lines` warning, or review.
9. **No manual screen-reader passes**, which §17 requires before release. #186, not a blocker: the owner decided the passes can follow the release (14 October 2026), and it's p2, off the 1.0 milestone. It needs a person at VoiceOver and NVDA.
10. **Focus out of view in WebKit's scrolling agenda** after some keys, about half the time (WCAG 2.4.11). #185, not a blocker: the owner accepted it for rc.1 as a known issue (14 October 2026), and it's p2. With #204's waits the tests check the list at rest, and it still fails in 1 to 3 of 4 cases a run: a product bug, not the tests.
11. **An empty week's scroll area has nothing to focus** (axe `scrollable-region-focusable`, serious, tagged WCAG 2.1.1, Level A). Arrow keys do reach the slots from the grid. #180. *Owner decision:* a 1.0 blocker or not (#207).
12. **Other browser findings.** WebKit tests skipped there until they're fixed, or rewritten if the test is at fault: the agenda's end, the 10,000-event agenda on the polyfill in CI, a day swipe's and a month step's snap points, a drag against the edge (#181). Playwright's Firefox doesn't start on macOS 27 (#182), so a local full run there is WebKit alone. CI's `browsers` job is stable now (#192, closed).
13. ~~**Release tooling.**~~ Closed by #177.
14. **Registry labels are English literals**, not a messages contract: they're source the app owns and edits. Since #205, §18 says so: registry source is where apps localize. *Owner:* confirm, or ask for a contract (#207).
15. **`tools/a11y` sits outside the package graph.** It isn't in `tests/dependency-boundaries.test.ts`'s matrix, and it imports the demo's `App` by a relative path. #209.
16. **The year view's popover renders all 365 day triggers on each open and close.** Performance on slow devices; the tests no longer feel it since #204 dropped React's act warning (Firefox's whole year-view file takes under 8 s on a runner). #197.
17. **Found by #205:** a keyboard preview marks the event `isPending` (#198); a `Root` without `onEventChange` still started drags and keyboard grabs (#201, fixed in #214); `CalendarEventSource` was exported but nothing accepted it (#200; built, not removed: `Root` takes one). A public read of pending changes (#199), built before 1.0 at the owner's call. Post-1.0: locale week rules (#202). #198 is p2 without a milestone; #207 proposes the 1.0 milestone for it.
18. **Extreme load.** Under 15 spinning threads on 15 cores, before #195 and #204, `ready:full` failed 3 of 3, once after a 26-minute stall; no run at that load has been made since. The watchdog fails a page that stops making progress in two minutes, shown on a page that spins its main thread, not under that load. The cause of the stalls inside the browsers wasn't chased. No issue: a known limit.
19. **Release provenance.** `1.0.0-rc.1` went out from Actions with npm provenance; releases since
    go out from the owner's laptop, which can't sign provenance. They carry an approver instead,
    from npm's staged publishing, which pnpm's `trustPolicy: no-downgrade` ranks above
    provenance, so installs don't read them as a downgrade. Provenance would come back if CI staged
    the tarballs through trusted publishing and the owner approved them
    ([research/release-flow.md](./research/release-flow.md)). *Owner decision*, not a blocker.

## Browsers

| Browser | Temporal | `vp run a11y` / `vp run browsers` |
| --- | --- | --- |
| Chromium 156 | native | 209 of 209, also at CI's speed |
| WebKit 27.2 on macOS | `temporal-polyfill`, installed by the test page | 191 pass, 11 skip (#181, #185) |
| Firefox 157 and WebKit on Linux (CI, on demand) | native and the polyfill | Run [38367732111](https://github.com/Moltenship/time/actions/runs/38367732111) on `main`: 393 pass, 11 skip, the seventh green dispatched run in a row (#192, closed). |

The interactions (mouse and keyboard moves and resizes) pass in Chromium and WebKit on macOS, and in all three on Linux.

Base UI makes its focus guards unnamed buttons in WebKit on purpose, for VoiceOver; `tools/a11y/tests/axe.ts` exempts them beside the existing `aria-hidden-focus` exemption.

## Open issues: p0 and p1

The only p0 issues were the two epics that track the release; since 14 October 2026 they have no priority. The p1s were this audit's findings, and #207, the owner's checklist for the release itself, which closes after publishing. #185 is p2 since the owner accepted it for rc.1 as a known issue, and #186 since the owner decided the screen-reader passes can follow the release (both 14 October 2026), so #207 is the only p1 left.

| Issue | Remaining | Proposal for the owner |
| --- | --- | --- |
| #1 Calendar roadmap (was p0, epic) | Its open sub-issue is #5; its body also lists #45. | Done: its priority is dropped (14 October 2026). It tracks, it doesn't block. |
| #5 Epic 7: demo, docs, registry, release (was p0) | #45 and #47; #43 and #46 closed. | Its priority is dropped (14 October 2026). #45 publishes `calendar-testing` with 1.0 after all (14 October 2026); close #5 with #45 and #47. |
| #185 Safari: focus left out of view in the scrolling agenda (p2, was p1) | A product bug, confirmed after #204's waits. | Decided: rc.1 ships with it as a known issue (owner, 14 October 2026). |
| #186 Manual VoiceOver and NVDA passes (p2, was p1) | Needs a person at each screen reader. | Decided: not an rc.1 blocker; the passes can follow the release (owner, 14 October 2026). |

Done in this triage: #45 (publish `calendar-testing`) left the 1.0 milestone. #146 and the owner's comment on it keep the package private for 1.0 (#175). Since then the owner asked for it to be built, and it publishes with 1.0 (#45, 14 October 2026). #192 (a stable CI `browsers` job) closed: seven green dispatched runs in a row since #204's first version.

Not for 1.0: #132, #133 (the full browser matrix), #138 and #143 (#146's small follow-ups, all four), and #160 (the Post-1.0 milestone).

## Before 1.0.0-rc.1

Each open finding, and whether it blocks the release candidate. The owner's steps are in #207.

| Finding | Blocks rc.1? | Why |
| --- | --- | --- |
| The docs site in production | No, resolved | It serves at `https://time.molten.sh`, with the registry at `/r/registry.json`. Every package's `homepage`, the registry's URLs and the `shadcn add` lines point there (#210); the old Vercel domain is gone. |
| #185, focus out of view in the scrolling agenda in WebKit | No: a known issue | The owner accepted it for rc.1 as a known issue (14 October 2026), and it's p2 now. It fails WCAG 2.4.11 in Playwright's WebKit 27.2 on `temporal-polyfill`; a check in Safari would still help. |
| #186, the screen-reader passes | No: follow-up work | The owner decided they can follow the release (14 October 2026), and it's p2 now, off the 1.0 milestone. §17 still asks for them, and they need a person at VoiceOver and NVDA. |
| #200, `CalendarEventSource` exported but unused | No: done | Built, not removed: `Root` takes a source, so the API reports can freeze with it. |
| The npm scope, the `npm` environment, the publish path, rc.1 or 1.0.0, and a `release.yml` rehearsal | Yes | Owner setup and decisions, in #207. |
| #1 and #5, the p0 epics | No: relabeled | Trackers, not work. Their priority labels are gone (14 October 2026), so they no longer keep "no p0/p1 left" from being true. |
| #180, an empty week's scroll area | No; the owner decides for 1.0 | Tagged WCAG 2.1.1 (Level A) by axe, though arrow keys reach the slots. |
| #201, read-only roots still start drags and grabs | No, resolved | Fixed in #214: views get `isReadOnly`, and a root without `onEventChange` starts no drags, grabs or resize handles. |
| #198, keyboard previews mark the event `isPending` | No, fix before 1.0 | A wrong state during a keyboard gesture. If rc.1 goes out first, `latest` points at it, so default installs get it until 1.0. |
| #197, the year view renders 365 triggers per popover | No | Performance on slow devices. |
| #187, whole-day moves shift silently in a DST gap | No | The docs are now accurate; the behaviour is the owner's call. |
| #181, #182, #188, #189, #209, gaps 6, 8, 14, 18 | No | p2 or docs, tracked in their issues; gaps 6, 8 and 14 are owner decisions in #207. |
| #199 | No: done | The owner moved it before 1.0; `onEventChangeResult` and `useCalendarPendingChanges` are built. |
| #202 | No | Post-1.0. |

## Phase 2

Done:

- #177: the release tooling, the dry run and a guarded publish step.
- #195: the full gate under load. The browser runs go one at a time on half the cores, beside the serial lane; the unit tests take half the cores; a watchdog fails a stuck browser run in minutes.
- #204: the browser tests wait on conditions. On `main`'s code, uncached, `ready:full` passed 3 of 3 runs beside six spinning threads.
- #196: a README in every published package; `ics` is `MIT AND Unicode-3.0`.
- #203: the SSR fixture, the docs site and the registry's clean apps install the dry run's tarballs (`release:artifacts`, in `ready:full` and `release:gate`).
- #206: the gate policy (quick after every change, the local `ready` before every other merge, the full tier for releases). The release job runs the whole full tier with a strict dry run, rehearsed green on fresh runners by CI's on-demand `release-gate` job.
- #205 (#191): `architecture.md` and the docs match the code.
- CI's `browsers` job: green seven dispatched runs in a row since #204's first version (#192).
- The RC report, on #47.

Left for the owner: #207.
