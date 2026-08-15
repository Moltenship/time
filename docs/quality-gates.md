# Quality gates

Issue #15 makes the repository's compatibility checks executable before calendar feature code lands. CI and local development run the same named Vite+ tasks.

CI runs on Node.js 26, the server-runtime floor where the suite exercises native `Temporal` without
a V8 feature flag or bundled polyfill.

## Passing gates

From the workspace root:

```sh
vp install
vp run ci:check
vp run ci:build
vp run ci:test
vp run ssr:smoke
vp run registry:smoke
vp run package:graph
```

`vp run ready` runs the same sequence. The SSR report includes its deterministic environment, server-markup hash, recoverable hydration errors, interaction result, and unmount result. The registry report validates any `registry-item.json` files under `registry/` plus a committed contract fixture so an empty source registry cannot make the schema smoke vacuous.

`vp run calendar-temporal#build` also enforces the package's production ESM budget: at most 16 KiB
raw and 4 KiB gzip. Because the check reads the emitted artifact, the recursive CI build exercises
the same gate that runs before publication.

## Intentional failure proofs

These commands must exit non-zero:

```sh
vp run ssr-fixture#fixture:bad-hydration
vp run ssr-fixture#fixture:bad-browser-global
vp run registry#fixture:known-bad
```

The hydration fixture renders different server/client locale text and reports React's hydration mismatch. The browser-global fixture reads `window` at module scope and fails during a server import. The registry fixture is valid enough for shadcn's base schema to reach the repository checks, then fails its npm dependency, registry dependency, source/target, CSS variable, and minimum-runtime compatibility contracts.

## Registry compatibility metadata

Each item records minimum compatible public runtime ranges in shadcn's extensible `meta` field:

```json
{
  "meta": {
    "compatibility": {
      "@moltenship/calendar": ">=0.1.0"
    }
  }
}
```

The package must also be present in the item's npm `dependencies`. Targets must be explicit project-relative paths, and CSS variable names must use standard shadcn tokens or the `calendar-*` namespace.
