# Release audit

The evidence index for 1.0 (#47): each invariant and decision in
[`architecture.md`](../../architecture.md), the test, gate or ADR that proves it, and the gaps.
Phase 1, 12 October 2026, on `main` after #176 (the shadcn registry), #178 (the a11y flakes) and
#179 (the quality gate tiers), with #183 (Firefox and WebKit).

How to read a row:

- **Proof** names the test file, and the test where a file holds several claims, or the gate or ADR.
  A claim in a doc is not proof, and neither is a test that no task runs.
- **Runs in** says where: `ci:test` is the root `vp test`, which picks up every `*.test.ts(x)` in the
  repo; `a11y` is `tools/a11y/tests/*.a11y.tsx` in Chromium. Both run in CI and in `vp run ready`.
  Steps only in `vp run ready:full`, or run by hand, say so.
- **Verdict:** proven; partial, with the rest listed as a gap; or a gap.

## Invariants

The checklist in `architecture.md` §26.

| Invariant | Proof | Runs in | Verdict |
| --- | --- | --- | --- |
| **External events stay authoritative** (ADR 0003). | `calendar-core/tests/event-transactions.test.ts`: pending until the handler settles, confirmed by revision, rolled back on a reject or a throw, the latest proposal wins, a late rejection is ignored. `event-overlay.test.ts`: the overlay never rebuilds the base indexes. `event-snapshots.test.ts`: the external-store contract. `calendar-react/tests/event-changes.test.tsx`. | `ci:test` | Proven; §10 drift: gap 1 |
| **Every interval is typed and half-open** (ADR 0002). | `calendar-temporal/tests/half-open.test.ts`; fast-check properties in `interval-operations.test.ts`, `iteration.property.test.ts` and the zoned slot and rounding tests; `calendar-core/tests/event-snapshots.test.ts`, "matches a simple reference for randomized half-open queries"; `timed-overlap.test.ts`. | `ci:test`, `engine:gate` | Proven |
| **No host time zone or current time is read implicitly during render** (ADR 0004). | `tests/temporal-utilities-boundary.test.ts`: only `calendar-temporal`'s system clock reads the time, and no package or registry view uses `Date`, across every package's source (new in this audit). `tests/ics-boundary.test.ts`. `calendar-react/tests/use-now.test.tsx`: no now on the server, the injected clock after. The DST matrix across `calendar-core/tests`. | `ci:test`, `a11y` | Proven; DST claim: gap 2 |
| **Core imports no React, DOM, Jotai, dnd-kit, Tailwind or app code.** The dependency law, §2 (ADR 0005). | `dependency-cruiser.config.ts`, run by `tests/dependency-boundaries.test.ts`: production source obeys the rules; known-bad deep imports fail statically and against the packed tarball; the manifest matrix; core, temporal and ics compile with `types: []` and no DOM. | `package:graph`, `react:gate`, `ci:test` | Proven |
| **No work proportional to all events or resources inside a render or frame.** The §14 contract. | `benchmark#core` in `vp run engine:gate`: the 10k snapshot build and warm queries (`docs/internal/evidence/issue-24-engine-gate.md`). `vp run recurrence:gate`: 200 series in under 50 ms p95. Bounded DOM: `registry/tests/resource-timeline-view.test.tsx` (500 resources), `agenda-view.test.tsx` and `tools/a11y/tests/long-agenda.a11y.tsx` (10,000 events). No commits on pointer moves: `calendar-dnd/tests/use-calendar-pointer.test.tsx`. | Benchmarks by hand, on reference hardware; the rest `ci:test`, `a11y` | Partial: gap 3 |
| **Pointer interaction has keyboard and explicit-action equivalents.** | `packages/calendar/tests/month-parity.test.tsx` and `time-grid-parity.test.tsx`: the same changes and the same spoken text from pointer and keyboard, for move, both resizes and create, across DST and between the all-day row and the grid. `registry/tests/*-keyboard.test.tsx`; `proposeEventChange` in `event-changes.test.tsx`. Real mouse and keys in Chromium, Firefox and WebKit: `tools/a11y/tests/interactions.a11y.tsx`. Touch: `calendar-dnd/tests/attach-calendar-pointer.test.ts`, "starts touch drags with a long-press and lets quick swipes scroll", but no touch-versus-keyboard comparison. | `ci:test`, `a11y`, `browsers` | Partial: gap 4 |
| **Controlled state isn't mirrored through an effect** (ADR 0018). | `calendar-react/tests/react-gate.test.tsx`: under Strict Mode the controlled-state matrix never renders a stale value, a Suspense transition rebases, selectors don't commit unrelated components. `store.test.ts`, `regressions.test.tsx`. | `react:gate`, `ci:test` | Proven; ADR 0025 drift: gap 5 |
| **A custom view needs no internal imports.** | `packages/calendar/tests/public-custom-view.test.tsx` imports only `@moltenship/calendar` and type-checks without casts; `react-gate.test.tsx`. | `react:factory`, `ci:test` | Proven |
| **Registry source uses semantic tokens and stays editable.** | `tools/registry`, through `registry:smoke` and `tools/registry/tests/*`: targets, dependencies, CSS variables (shadcn or `calendar-*`), compatibility ranges, a known-bad fixture. `vp run registry:e2e` installs `calendar-full` into clean Vite and Next.js apps and builds them. `registry/tests/theme-contrast.test.ts`. | `registry:smoke`, `ci:test`; `registry:e2e` in `ready:full` | Partial: gap 6 |
| **SSR markup is deterministic, or the client-only part is intentional.** | `apps/ssr-fixture/tests/ssr-fixture.test.ts`: render, hydrate, interact, unmount; its known-bad cases (a hydration mismatch, `window` at module scope) must fail. `calendar-react/tests/ssr-hydration.test.tsx`. `verify-public-api.mjs` fails the build without `"use client"`. Hydration tests for the time grid's zones, the resource timeline and the scrolling agenda, and the Next.js example's. | `ssr:smoke`, `ci:test`, `ci:build` | Partial: gap 7 |
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
| **Modern browsers, with native Temporal or an app-installed polyfill.** | `vp run browsers`: the a11y suite and `interactions.a11y.tsx` in Firefox and WebKit, WebKit on `temporal-polyfill` installed by the test page as an app would, checked by a test. Results below. | `browsers` in `ready:full`; CI on demand | Partial: gaps 10, 12 |
| **Curated exports; a size budget per package.** | Every package exports `.` and `./package.json`, with `dist` through `publishConfig`. Packed-tarball checks for `calendar-temporal`, `calendar-core` and `calendar-react` (`tests/dependency-boundaries.test.ts`), the LICENSE in each tarball (`tests/package-metadata.test.ts`). An ESM budget for every published entry point in `tools/release/src/config.ts`, a committed API report per package, publint and are-the-types-wrong on every tarball (`release:check`, #46). | `ci:build`, `release:check`, `ci:test` | Proven |
| **The upgrade story** (§24): semver and lockstep versions, explicit registry diffs, a generated changelog and release checks, publishing as an explicit step. | The MIT LICENSE and package links (#175). Registry compatibility ranges and `compatibility.json` (#176). One version for the published packages, `CHANGELOG.md` and `release:version`; the release checks and a dry run that checks the registry against the packed version; `release:publish` as the explicit, guarded publish step (#46, `docs/internal/releasing.md`). | `registry:smoke`, `release:check`; the dry run in `ready:full` | Proven |
| **No English from core; a typed messages contract** (§18). | Core formats through `Intl` with the environment's locale. Announcements go through the typed `CalendarAnnouncementMessages`, with English defaults in registry source. | `ci:test` | Partial: gap 14 |

## Gaps

Closed by the audit's PRs:

- The a11y job, red on every `main` commit since #158 (#178): a focus-scroll race in the scrolling agenda, muted text under 4.5:1 on hovered rows and days in seven places, and tests that read state before it settled. CI on `main` is green since.
- CI and local disagreeing (#179): the local gate in three tiers, the same task names in CI, the a11y suite at CI's speed in the full gate, and the races that running steps in parallel turned up.
- Only Chromium ran anything (#183): `vp run browsers`, the polyfill path, and real mouse and keyboard interactions everywhere.
- `navigateToday` read `Temporal.Now` outside the clock boundary (this PR): it goes through the system clock, and the boundary test now covers every package's source and the registry.
- `docs/internal/quality-gates.md` listed old size budgets and a Jotai check that doesn't exist, and `docs/internal/package-topology.md`'s import table differed from the enforced matrix (this PR).

Open:

1. **§10 describes transaction APIs the code doesn't have**: `onTransactionStateChange`, a transaction controller, and other `cause` values. #191.
2. **§4.5 promises announced DST gap shifts.** Views get `environment.disambiguation` and the helpers honour it, but the time grid can't place a drop in a gap, and nothing carries or announces a shift. #187.
3. **The performance contract.** Its numbers are local reference-hardware benchmarks, not run in CI or `ready:full`, by design. The layout and pointer-frame rows time reference code, and nothing measures scrolling; the scrolling agenda re-projects its whole load range on each anchor move. #188.
4. **Parity in the resource views**: no pointer-versus-keyboard equality check for resource columns or the resource timeline. #189.
5. **The store's records**: ADR 0025 (Accepted) and `architecture.md` §1–§3, §8, §9 and §24 describe a Jotai store that `calendar-react` dropped in #70. #184.
6. **A literal colour in registry source**: `registry/time-grid-view/time-grid-annotations.tsx` draws the annotation icon disc with `bg-white/35 text-black/70`, over the mark's colour. *Owner decision:* a token, or a documented exception.
7. **Registry views don't declare `"use client"`**: a Server Component that imports a view directly fails. #190.
8. **God files**: no check. The largest: `calendar-recurrence/src/series/expander.ts` (815 lines), `calendar-core/src/snapshots/event-snapshot.ts` (708), `calendar-react/src/root.ts` (687), `ics/src/types.ts` (621), `calendar-recurrence/src/edits/series.ts` (528), `registry/time-grid-view/time-grid-annotations.tsx` (520). *Owner decision:* a `max-lines` warning, or review.
9. **No manual screen-reader passes**, which §17 requires before release. #186, a 1.0 blocker.
10. **Focus out of view in WebKit's scrolling agenda** after some keys, about half the time (WCAG 2.4.11). #185, filed as a 1.0 blocker for the owner to confirm.
11. **An empty week's scroll area has nothing to focus** (axe `scrollable-region-focusable`, serious). #180. *Owner decision:* a 1.0 blocker or not.
12. **Other browser findings.** WebKit tests skipped there until they're fixed, or rewritten if the test is at fault: the agenda's end, the 10,000-event agenda on the polyfill in CI, a day swipe's and a month step's snap points, a drag against the edge (#181). Playwright's Firefox doesn't start on macOS 27 (#182). On a GitHub runner, Firefox and WebKit timing tests fail differently from run to run, one of them maybe a real dropped Escape (#192), so the CI job runs on demand. A green run of it is phase 2 work.
13. **Release tooling**: packed-API and export checks and size budgets for every published package (`calendar`, `calendar-dnd` and `calendar-recurrence` have no budget; `calendar`, `calendar-dnd`, `calendar-recurrence` and `ics` no packed-API check), versions, changelog, provenance, dry run and publish. All in #46's scope. Closed by #177.
14. **Registry labels are English literals**, not a messages contract: they're source the app owns and edits. *Owner decision:* say registry source is where apps localize, or add a contract.

## Browsers

| Browser | Temporal | `vp run a11y` / `vp run browsers` |
| --- | --- | --- |
| Chromium 156 | native | 208 of 208 |
| WebKit 27.2 on macOS | `temporal-polyfill`, installed by the test page | 190 pass, 11 skip (#181, #185) |
| Firefox 157 and WebKit on Linux (CI, on demand) | native and the polyfill | Run [38291837725](https://github.com/Moltenship/time/actions/runs/38291837725): 386 pass, 11 skip, 5 fail. Which timing tests fail varies from run to run (#192). |

The interactions (mouse and keyboard moves and resizes) pass in Chromium and WebKit on macOS, and in all three on Linux.

Base UI makes its focus guards unnamed buttons in WebKit on purpose, for VoiceOver; `tools/a11y/tests/axe.ts` exempts them beside the existing `aria-hidden-focus` exemption.

## Open issues: p0 and p1

The only p0 issues are the two epics that track the release; the p1s are this audit's findings.

| Issue | Remaining | Proposal for the owner |
| --- | --- | --- |
| #1 Calendar roadmap (p0 epic) | Its open sub-issue is #5; its body also lists #45. | Close it with the 1.0 release, or drop its priority: it tracks, it doesn't block. |
| #5 Epic 7: demo, docs, registry, release (p0) | #45, #46 and #47; #43 closed with #176. | Move #45, now post-1.0, under a post-1.0 parent; then close #5 when #46 and #47 close. |
| #185 Safari: focus left out of view in the scrolling agenda (p1) | New, filed as a proposed blocker. | Confirm, and fix before the RC. |
| #186 Manual VoiceOver and NVDA passes (p1) | New. | Run before the RC, in phase 2. |

Done in this triage: #45 (publish `calendar-testing`) left the 1.0 milestone. #146 and the owner's comment on it keep the package private for 1.0 (#175).

Owner decisions that 1.0 still needs, from #146: publish through Actions with provenance or locally with a token; the `@moltenship` npm scope; `1.0.0-rc.1` first or straight to `1.0.0`.

#192, a stable CI `browsers` job, is on the 1.0 milestone at p2: phase 2 needs a green run of it.

Everything else open is post-1.0 by #146, or a p2 finding from this audit: #132, #133 (the full browser matrix), #138, #143, #160, #180, #181, #182, #184, #187–#191.

## Phase 2

After #46 merges:

- The showcase and fixtures install the packed release artifacts instead of workspace source.
- Done in #177: `ready:full` runs the release dry run, and the release workflow runs the shadcn install test on the dry run's tarballs (`release:registry-e2e`).
- A green run of CI's on-demand `browsers` job, the only place Firefox runs while it can't start on
  macOS 27 (#182, #192).
- The full release dry run, the screen-reader passes (#186) and the RC report on #47.
