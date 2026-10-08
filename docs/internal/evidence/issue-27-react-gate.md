# Issue #27 React integration gate evidence

- Date: 2026-08-15
- Issue: [#27](https://github.com/Moltenship/time/issues/27)
- Packages: `@moltenship/calendar-react`, `@moltenship/calendar`

## Reproducible gate

The phase-2 React audit is a first-class Vite+ task:

```sh
vp run react:gate
```

It runs the repository formatter/linter/type checker, the focused issue harness, the complete React
and facade tests and production builds, the consumer-equivalent SSR smoke, and the dependency
boundary suite. The same task runs from `vp run ready` and CI.

## Contract matrix

The focused harness passed 12 tests:

| Contract | Evidence | Result |
| --- | --- | --- |
| Controlled freshness | View, anchor date, selection, focus, timezone, and expanded-resource slices run through controlled actions under Strict Mode; no post-action render contains the prior value | Pass |
| Concurrent rendering | A controlled `agenda` transition suspends while the committed `month` screen remains visible, an urgent revision commits against `month`, and releasing the gate rebases `agenda` over that revision; every attempted render keeps the controlled prop and calendar state equal | Pass |
| Selector isolation | An unrelated selection update evaluates both selectors but produces zero view and anchor commits; an anchor update produces one anchor commit and zero view commits | Pass |
| Custom-view boundary | A typed month/agenda fixture uses public package roots, deterministic event/resource builders, and an injected clock | Pass |
| Root isolation | Updating one of two physical `createRoot` trees leaves the other calendar unchanged | Pass |
| Cleanup | Unmount removes the first tree and prevents later commits while the caller-owned store continues updating the second tree | Pass |
| Hydration | Server markup hydrates without mutation, warning, or recoverable error, then performs a controlled view interaction and unmounts cleanly | Pass |
| Deep imports | dependency-cruiser rejects the known-bad React source specifier; the package is then packed, extracted under a temporary consumer's `node_modules`, and Node reports `ERR_PACKAGE_PATH_NOT_EXPORTED` from the published export map | Pass |

As a mutation proof, temporarily replacing `startTransition` with the synchronous state setter
causes the focused concurrency test to fail because the Suspense fallback replaces the committed
screen. Restoring `startTransition` makes the same test pass.

The render/hydrate lifecycle helpers, deterministic clock/builders, selector/Profiler counters,
custom-view fixture, and controlled-state matrix remain internal test infrastructure. Issue #45
continues to own the future public `@moltenship/calendar-testing` surface.

## SSR/hydration artifact

The consumer-equivalent `ssr-fixture` smoke produced:

```json
{
  "serverHtmlSha256": "2a3db2afe503b8e20a54486c7b23f0af271c2ce26760e5bf506b808fa38cf0cd",
  "recoverableErrors": [],
  "hydratedWithoutMutation": true,
  "interactionCount": 1,
  "unmounted": true
}
```

The focused hydration harness independently observed no `console.error` call and successfully
changed the controlled custom view after hydration.

## Production and repository gates

| Command | Result |
| --- | --- |
| `vp run react:gate` | 12 focused tests, 28 total React-package tests, facade consumer, SSR smoke, boundary suite, and affected builds passed |
| `vp check` | 212 files formatted; 155 files with no lint or type errors |
| `vp test` | 29 files and 165 tests passed; one intentional file/test skipped |
| `vp run -r build` | 23 of 23 recursive build tasks passed |
| `vp run check:boundaries` | 10 tests passed, including static rejection and packed-consumer React deep-import rejection |
| `git diff --check` | Passed |

The production React entry remains 25,413 bytes raw / 5,382 bytes gzip, below its unchanged 28 KiB
raw / 6.25 KiB gzip budget. The public facade declaration and client-boundary audit also passed.

This gate changes headless test and quality infrastructure rather than a styled visual surface. Its
required runtime artifact is deterministic render/hydration and commit-count evidence; browser
screenshots and accessibility scans remain owned by the integrated source-view gates. Architecture
scope and sequencing did not change, so `IMPLEMENTATION_PLAN.md` remains unchanged.
