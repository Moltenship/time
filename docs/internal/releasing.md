# Releasing

How the packages get to npm. Only the owner publishes. Everything before the publish step runs
locally or in CI, and nothing installs our packages from npm. The dry run installs from the pnpm
store, reading package metadata from npm only when a cold cache lacks it, as on a fresh runner;
the checks on its tarballs reach the network only for third-party packages, shadcn's components
and the docs site's fonts.

Nine packages publish under `@moltenship`, listed in
[`tools/release/src/config.ts`](../../tools/release/src/config.ts) and
[package-topology.md](./package-topology.md#published-packages). They share one version until after
1.0 (`architecture.md` §24).

## Checks

Each check is a `vp run` task. The same tasks run locally, in CI and in the release workflow. The
tier says where a check belongs in the local gate: PR checks are cheap enough for every PR, and the
full tier is the release gate, which runs for releases, and once in a PR that changes it or the
release tooling. `vp run release:check` runs the four PR checks in about two seconds.
It sits in the `gate:serial` lane right after `ci:build`, so `vp run ready` and CI run it. The full
tier, `vp run ready:full`, also runs `vp run release:dry-run` and then `vp run release:artifacts`
on what the dry run packed.

| Task | What it checks | Tier |
| --- | --- | --- |
| `vp run release:size` | Each published entry point's emitted ESM, raw and gzip, against its budget in `tools/release/src/config.ts` | PR |
| `vp run release:api` | Each package's built declarations against its committed `api-report.md` | PR |
| `vp run release:exports` | Packs every package into a temporary folder, then runs publint and are-the-types-wrong (ESM-only), checks for `LICENSE`, and checks that base packages don't import the dnd adapter | PR |
| `vp run release:treeshake` | Bundles the facade's exports with esbuild, minified, with and without each opt-in feature's exports (`optionalFeatures` in `tools/release/src/config.ts`; today the event history, #227). From the built packages, as an app's bundler sees them, the bundle without the feature must have none of its markers. From source, with every module's side effects kept, it must have no bytes from the feature's files, so a statement left at a module's top level fails. With the feature, both must find it | PR |
| `vp run release:consumer` | Installs the tarballs into a new project outside the workspace, from the pnpm store, with every third-party package at the version the workspace locks (offline, unless a cold cache needs metadata from npm, which it says); imports every package in Node, type-checks them with TypeScript 7 and 6 under `NodeNext` and `Bundler`, expects deep imports to fail, and bundles the facade without its pointer exports to show `calendar-dnd` tree-shakes away | Full |
| `vp run release:dry-run` | A fresh build of every published package, then all of the above, the registry smoke, and a registry build into `.release/registry` that must ask for the packed version. Writes `.release/manifest.json` | Full |
| `vp run release:artifacts` | What uses the release, on the dry run's tarballs and registry, with their hashes checked: the SSR fixture's render and hydration tests and the docs site's build, routes and example tests, each in a copy outside the workspace, installed offline from the pnpm store (a cold cache reads metadata from npm); and #43's install test, `shadcn add` into clean Vite and Next.js apps, which needs the network for npm and shadcn's own components. See [quality-gates.md](./quality-gates.md#release-artifacts) | Full |
| `vp run release:published` | After publishing: waits up to 15 minutes for npm to list every package the dry run packed, and fails as soon as a listed one differs: its integrity from the dry run's tarball, its dist-tag from the version (unless a newer release has taken it), or with `--provenance` its provenance. Reads `.release/manifest.json`, or `--manifest <path>` | After publishing |
| `REGISTRY_E2E_PACKAGES=npm vp run registry:e2e` | After publishing: #43's install test with the packages from npm, into clean Vite and Next.js apps | After publishing |

The PR checks read the built packages, so on their own they run after `vp run ci:build`. Only the
dry run writes `.release/`. It takes the version to check from `--version`, or else from
`RELEASE_VERSION`, which the release workflow sets for `release:gate`; a stray `RELEASE_VERSION` in
your shell makes a plain dry run check that version, and the error says so. Without
`--require-clean`, it also runs on a tree with changes and records that in the manifest, which the
publish step then refuses; releases pass the flag. `release:artifacts` only reads `.release/`: it
packs nothing, and refuses a manifest from another commit or a file whose hash changed since.

- **The API changed on purpose.** Run `vp run release:api:update` and commit the reports with the
  change. The diff in `packages/*/api-report.md` is what reviewers look at.
- **A budget is too small.** Raise it in `tools/release/src/config.ts` in the PR that needs it, and
  say why in the PR.

## Release steps

1. **Changelog.** PRs that change a published package add a line under "Unreleased" in
   [`CHANGELOG.md`](../../CHANGELOG.md).
2. **Version PR.** On a branch, run `vp run release:version 1.0.0-rc.1` (or whichever version).
   It sets the version in all nine manifests and turns "Unreleased" into `## 1.0.0-rc.1 (date)`.
   Open a PR and review it.
3. **Link a green rehearsal** before merging: `gh workflow run ci.yml --ref <version-branch>`
   runs CI's on-demand `release-gate` job, which runs what the release workflow's gate runs, and
   the `browsers` job. Link the green run in the version PR, then merge. From then on, the docs
   site's registry asks for that version, which npm doesn't have until step 4, so publish soon
   after merging.
4. **Publish from `main`**, one of two ways:
   - **GitHub Actions.** Actions → Release → Run workflow, on `main`, with the version. Leave
     "Publish to npm" off for a rehearsal, and rehearse at least once before the first real
     release. The `verify` job installs Chromium, Firefox and WebKit, then runs
     `vp run release:gate` with `RELEASE_VERSION` set to the input: the whole full tier, its three
     browser runs included, with `release:dry-run --require-clean` for that version and
     `release:artifacts` on the dry run's tarballs, its lanes one after the other. CI's
     on-demand `release-gate` job runs the same steps on any branch without publishing: on the
     version PR's branch, as step 3 says, or before it. The job keeps
     `.release/` as the `release` artifact for seven days. A rehearsal of the release workflow
     itself before the version PR uses version `0.0.0`.
     With publishing on, the `publish` job downloads the artifact and runs
     `vp run release:publish --version <v> --provenance --yes` on the same commit. Only that job
     can mint the OIDC token that signs npm provenance.

     Step 5 then runs by itself. The `published` job runs `vp run release:published` on the same
     artifact. Once it passes, the `github` job runs `vp run release:github`, the only job with a
     token that can write tags and releases, and the `install` job runs
     `REGISTRY_E2E_PACKAGES=npm vp run registry:e2e` with read access only, since it runs shadcn
     and the apps' installs and builds. If a job fails, re-run it: every step is safe to repeat.

     Before the first run, set up the `npm` environment in the repository settings:
     - deployment branches: `main` only;
     - a required reviewer;
     - either an `NPM_TOKEN` secret that can publish to `@moltenship`, or an npm trusted publisher
       for `release.yml` and the `npm` environment.

     The workflow's `main` check is only an accident guard: anyone with write access can dispatch
     a branch whose copy of the file drops it. The environment's branch rule is the real limit.
   - **Locally.** From a clean checkout of that commit, after `git fetch`:

     ```sh
     vp install --frozen-lockfile
     vp exec --filter a11y playwright install chromium firefox webkit   # once, for the browser runs
     RELEASE_VERSION=1.0.0-rc.1 vp run release:gate   # the full tier, strict; needs the network
     # On macOS 27 its browser run is WebKit alone (#182): rehearse on CI for Firefox.
     export NODE_AUTH_TOKEN=<token>   # or npm login
     vp run release:publish --version 1.0.0-rc.1
     vp run release:published --version 1.0.0-rc.1   # step 5, as the release workflow runs it
     vp run release:github --version 1.0.0-rc.1      # needs gh, signed in with write access
     REGISTRY_E2E_PACKAGES=npm vp run registry:e2e
     ```

     The publish step asks you to type the version. Local publishes have no provenance. Use a
     granular access token that can publish to `@moltenship`: with two-factor authentication on
     writes, a one-time password can expire before all nine packages are out.
5. **After publishing.** The release workflow does these; after a local publish, run the commands
   above.
   - **Check what npm serves.** `vp run release:published --version <v>` waits for npm, which can
     take minutes to list a new package. Each package it lists must have the `dist.integrity` of
     its `integrity` in `.release/manifest.json`, its dist-tag at the version, and with
     `--provenance` provenance; the first that doesn't fails the check at once. If a package
     differs, deprecate the release and release a new version (Rollback).
   - **Tag and release.** `vp run release:github --version <v>` tags the commit the dry run checked
     `v<version>` and writes the GitHub release from the changelog section, one line per paragraph
     and list item. A prerelease is marked as one. Like the publish step, it refuses a commit that
     isn't on `origin/main`. A published release is left alone; a draft, or a tag on another
     commit, stops it.
   - **Install it as a user would.** `REGISTRY_E2E_PACKAGES=npm vp run registry:e2e` builds the
     registry from the commit and runs #43's install test with the packages from npm: `shadcn add`
     into clean Vite and Next.js apps, then a typecheck and a build.

## What the publish step checks

`release:publish` refuses unless:

- `.release/manifest.json` exists from a passing dry run;
- the dry run ran on `HEAD`, on a clean tree, and the tree is still clean;
- `HEAD` is on `origin/main`;
- the dry run checked the version you asked for, and it isn't `0.0.0`;
- every published package was packed, and each tarball's sha512 still matches.

Before publishing anything, it asks npm about all nine. A version npm already has is skipped only
when npm's integrity matches the tarball the dry run checked; otherwise the step stops, so the nine
packages on npm never mix two builds. Running it again after a partial failure is safe. Skipped
packages keep the tag they went out with, so re-run with the same `--tag`.

Prereleases get the `next` dist-tag and stable versions `latest`; `--tag` picks another, but a
prerelease can't take `latest`. `--provenance` only works in GitHub Actions. The registry is always
`https://registry.npmjs.org/`: the step sets it, and refuses when an `.npmrc` points `registry` or
`@moltenship:registry` anywhere else. Unknown options are errors, so a typo such as `--dry-run`
can't slip through.

Each package's `prepublishOnly` script fails, so `pnpm publish` in a package folder, or
`pnpm publish -r`, can't skip the dry run. Publishing a tarball doesn't run that script.

npm points `latest` at a package's first published version even when it goes out under another
tag. If the first release is `1.0.0-rc.1`, `latest` points at it until `1.0.0` ships.

## Rollback

A published version can't be changed or reused, even after an unpublish. Fix forward.

1. **Stop new installs.** For each of the nine packages, move `latest` (or `next`) back to the
   previous version and deprecate the bad one:

   ```sh
   vp pm dist-tag add @moltenship/calendar-core@<previous> latest
   vp pm deprecate @moltenship/calendar-core@<bad> "Broken; use <fixed>. See <issue link>."
   ```

   With no previous version, skip the dist-tag and only deprecate.
2. **Fix and release again** with a new version (`1.0.1`, or `1.0.0-rc.2`) through the steps above.
3. **Partial publish.** If some packages published and the rest failed, run the publish step again
   on the same commit. npm can take a minute to list a version it just took; until then, a re-run
   fails on that package with "cannot publish over", which is safe. If the fix needs a code change,
   deprecate what went out and release a new version of all nine.

Unpublish only for something that must disappear, such as a leaked secret. npm allows it within
72 hours, and it breaks lockfiles that already reference the version.

## Deprecation

- Public exports, event semantics, view strategies, transactions and CSS variable names are
  contracts (`architecture.md` §24).
- To retire an API, deprecate it in a minor release: a `@deprecated` JSDoc tag naming the
  replacement, a changelog line and a docs note. It keeps working.
- Remove it in the next major, with migration notes, and a codemod when that's practical.
- To retire a whole package, `vp pm deprecate @moltenship/<package> "<message>"` deprecates every
  version; say where to go instead.

## Registry

The registry (#43) isn't published to npm: the docs site serves it at `/r/<item>.json`, built
from `main`. The dry run builds it into `.release/registry` and checks that `compatibility.json`
and every item's `@moltenship/calendar` range ask for the version it packed, so after
`release:version` the registry and the packages agree. `vp run release:artifacts` serves that
build at `/r` from the docs site built on the tarballs. Its install test builds the registry again
from source with a local base URL and installs it into clean apps against the exact tarballs the
dry run checked. The release workflow runs both.

## Open owner decisions

From #146. The tooling supports either choice for each.

- The `@moltenship` npm scope: it must exist, and the publisher needs rights to it.
- Publish from GitHub Actions with provenance, or locally with a token. The Actions path also needs
  the `npm` environment described above.
- `1.0.0-rc.1` first, or straight to `1.0.0`.
