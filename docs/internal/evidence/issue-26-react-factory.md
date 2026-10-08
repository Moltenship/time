# Issue #26 typed factory and custom-view evidence

- Date: 2026-08-15
- Issue: [#26](https://github.com/Moltenship/time/issues/26)
- Packages: `@moltenship/calendar-react`, `@moltenship/calendar`

## Implemented contract

- `createCalendar<TEvent, TResource, ...>()` carries application records, inferred branded IDs,
  semantic state, actions, meta, event render callbacks, and view renderers without consumer casts.
- `defineCalendarView()` and factory-local `defineView()` bind pure core strategies, immutable
  default options, capabilities, navigation/title behavior, and React renderers. Factory-local
  renderers retain the complete runtime view union separately from the strategy's literal name;
  standalone renderers remain safely assignable through a view-agnostic context.
- Immutable factory/root view registries use deterministic last-registration-wins behavior and
  report duplicate names without logging.
- `Root` owns one compound context. Hooks and custom controls work anywhere below it; `Frame` is
  markup rather than a nested provider.
- Internal semantic contexts keep selector-only controls isolated from unrelated state-slice
  commits while preserving the full typed `useCalendar()` contract for view renderers.
- Headless frame, toolbar, viewport, title, navigation, today, view-switcher, active/custom-view,
  and indexed event primitives use structural composition instead of visual boolean props.
- React 19 DOM refs are direct props, preserve callback cleanup functions, and compose with the same
  part refs exposed through `meta`. `Root.id` or `useId` authoritatively derives part IDs and keeps
  default ARIA relationships synchronized.
- Stable semantic actions publish their current controlled source, handlers, view, state, and
  environment before descendant layout effects.
- Immutable capabilities and diagnostics expose active-view, explicit-now, duplicate-view,
  unregistered-view, and invalid-event state through public contracts.
- The supported facade re-exports core and React contracts behind a preserved client boundary. A
  consumer fixture implements a third-party view using package roots only.
- Source imports across the repository omit file extensions. TypeScript workspaces use bundler
  resolution, SSR command fixtures run through Vitest's resolver, and the two direct TypeScript
  command workspaces use `tsx` as their Node loader.
- A repository-level test walks complete source text and rejects explicit JavaScript or TypeScript
  extensions in static imports, multiline dynamic imports, and re-exports.

`architecture.md` remains normative. `IMPLEMENTATION_PLAN.md` did not change because issue scope and
dependency sequencing remain unchanged; GitHub's native issue relationships continue to hold the
live execution state.

## Focused gate

`vp run react:factory` passed:

- `calendar-react`: 4 test files and 16 tests;
- public facade: 1 third-party custom-view test;
- both package checks and production builds;
- no consumer cast or private source import;
- no public Jotai contract or `forwardRef` wrapper;
- deterministic React IDs and direct-ref coverage;
- production React entry: 25,413 bytes raw / 5,382 bytes gzip, below the enforced 28 KiB / 6.25
  KiB budget.

## SSR/hydration artifact

`vp run ssr:smoke` rendered the public facade and factory with explicit locale, timezone, week
rules, anchor, and instant. It produced:

```json
{
  "serverHtmlSha256": "2a3db2afe503b8e20a54486c7b23f0af271c2ce26760e5bf506b808fa38cf0cd",
  "recoverableErrors": [],
  "hydratedWithoutMutation": true,
  "interactionCount": 1,
  "unmounted": true
}
```

The full `ssr-fixture` suite also passed three tests. Its known-bad locale-divergence and
module-scope `window` fixtures exited non-zero inside subprocesses for the intended hydration and
server-import reasons.

This issue changes a headless API rather than a styled visual surface, so deterministic
SSR/hydration is its runtime artifact; browser screenshots and visual accessibility scans remain
owned by the downstream integrated React gate and source-view issues.

## Repository gates

| Command | Result |
| --- | --- |
| `vp install --frozen-lockfile` | Lockfile current; supply-chain policy passed |
| `vp check` | 205 files formatted; 149 files with no lint or type errors |
| `vp test` | 28 files and 152 tests passed; one intentional file/test skipped |
| `vp run -r build` | 23 of 23 recursive build tasks passed |
| `vp run ssr:smoke` | Stable hash, no recovery, no mutation, one interaction, clean unmount |
| `vp run @moltenship/interval-dst-spike#test` | 12 direct Node/TypeScript tests passed |
| `vp run --no-cache @moltenship/interval-dst-spike#benchmark` | Reference agreement and performance gate passed through the `tsx` loader |
| `git diff --check` | Passed |
