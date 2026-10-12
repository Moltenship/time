# Releasing

How the packages get to npm. Only the owner publishes. Everything before the publish step runs
locally and offline, and never talks to the npm registry.

Seven packages publish under `@moltenship`, listed in
[`tools/release/src/config.ts`](../../tools/release/src/config.ts) and
[package-topology.md](./package-topology.md#published-packages). They share one version until after
1.0 (`architecture.md` §24).

## Checks

Each check is a `vp run` task. The same tasks run locally, in CI and in the release workflow. The
tier says where a check belongs in the local gate: PR checks are cheap enough for every PR, and the
full tier is the release gate. `vp run release:check` runs the three PR checks in about two seconds.
It sits in the `gate:serial` lane right after `ci:build`, so `vp run ready` and CI run it. The full
tier, `vp run ready:full`, also runs `vp run release:dry-run`.

| Task | What it checks | Tier |
| --- | --- | --- |
| `vp run release:size` | Each published entry point's emitted ESM, raw and gzip, against its budget in `tools/release/src/config.ts` | PR |
| `vp run release:api` | Each package's built declarations against its committed `api-report.md` | PR |
| `vp run release:exports` | Packs every package into a temporary folder, then runs publint and are-the-types-wrong (ESM-only), checks for `LICENSE`, and checks that base packages don't import the dnd adapter | PR |
| `vp run release:consumer` | Installs the tarballs into a new project outside the workspace, offline from the pnpm store; imports every package in Node, type-checks them with TypeScript 7 and 6 under `NodeNext` and `Bundler`, expects deep imports to fail, and bundles the facade without its pointer exports to show `calendar-dnd` tree-shakes away | Full |
| `vp run release:dry-run` | A fresh build of every published package, then all of the above, the registry smoke, and a registry build into `.release/registry` that must ask for the packed version. Writes `.release/manifest.json` | Full |
| `vp run release:registry-e2e` | #43's install test: it builds the registry from source with a local base URL and runs `shadcn add` into clean Vite and Next.js apps, with the dry run's tarballs served as the `@moltenship` packages. Needs the network for npm and shadcn's own components, so it isn't in the offline dry run | Release, online |

The PR checks read the built packages, so on their own they run after `vp run ci:build`. Only the
dry run writes `.release/`. It takes the version to check from `--version`, or else from
`RELEASE_VERSION`, which the release workflow sets for `release:gate`; a stray `RELEASE_VERSION` in
your shell makes a plain dry run check that version, and the error says so. Without
`--require-clean`, it also runs on a tree with changes and records that in the manifest, which the
publish step then refuses; releases pass the flag.

- **The API changed on purpose.** Run `vp run release:api:update` and commit the reports with the
  change. The diff in `packages/*/api-report.md` is what reviewers look at.
- **A budget is too small.** Raise it in `tools/release/src/config.ts` in the PR that needs it, and
  say why in the PR.

## Release steps

1. **Changelog.** PRs that change a published package add a line under "Unreleased" in
   [`CHANGELOG.md`](../../CHANGELOG.md).
2. **Version PR.** On a branch, run `vp run release:version 1.0.0-rc.1` (or whichever version).
   It sets the version in all seven manifests and turns "Unreleased" into `## 1.0.0-rc.1 (date)`.
   Open a PR and review it.
3. **Link a green `browsers` run** before merging. Firefox and WebKit run on demand in CI:
   `gh workflow run ci.yml --ref <version-branch>`. Link the green run in the version PR, as
   `AGENTS.md` asks, then merge. From then on, the docs site's registry asks for that version,
   which npm doesn't have until step 4, so publish soon after merging.
4. **Publish from `main`**, one of two ways:
   - **GitHub Actions.** Actions → Release → Run workflow, on `main`, with the version. Leave
     "Publish to npm" off for a rehearsal, and rehearse at least once before the first real
     release: the clean-consumer and registry install tests haven't run on GitHub's runners yet.
     The `verify` job runs `vp run a11y` alone, as CI does, then `vp run release:gate` with
     `RELEASE_VERSION` set to the input. `release:gate` is `ready:full` without the browser runs
     (a runner is what `a11y:ci-speed` simulates, and `browsers` runs on demand), with
     `release:dry-run --require-clean` for that version and `release:registry-e2e` on the dry
     run's tarballs. The job keeps `.release/` as the
     `release` artifact for seven days. A rehearsal before the version PR uses version `0.0.0`.
     With publishing on, the `publish` job downloads the artifact and runs
     `vp run release:publish --version <v> --provenance --yes` on the same commit. Only that job
     can mint the OIDC token that signs npm provenance.

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
     vp run ready:full                # the release gate; needs the network
     vp run release:dry-run --version 1.0.0-rc.1 --require-clean
     vp run release:registry-e2e      # needs the network
     export NODE_AUTH_TOKEN=<token>   # or npm login
     vp run release:publish --version 1.0.0-rc.1
     ```

     The publish step asks you to type the version. Local publishes have no provenance. Use a
     granular access token that can publish to `@moltenship`: with two-factor authentication on
     writes, a one-time password can expire before all seven packages are out.
5. **After publishing.** Tag the commit (`v1.0.0-rc.1`), push the tag, and write a GitHub release
   from the changelog section. These steps aren't automated yet. After the first publish, check
   that `vp pm view @moltenship/calendar-core@<v> dist.integrity` matches the package's
   `integrity` in `.release/manifest.json` (on the Actions path, in the run's `release` artifact).
   A re-run can only skip packages npm stored unchanged; if they differ, deprecate and release a
   new version.

## What the publish step checks

`release:publish` refuses unless:

- `.release/manifest.json` exists from a passing dry run;
- the dry run ran on `HEAD`, on a clean tree, and the tree is still clean;
- `HEAD` is on `origin/main`;
- the dry run checked the version you asked for, and it isn't `0.0.0`;
- every published package was packed, and each tarball's sha512 still matches.

Before publishing anything, it asks npm about all seven. A version npm already has is skipped only
when npm's integrity matches the tarball the dry run checked; otherwise the step stops, so the seven
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

1. **Stop new installs.** For each of the seven packages, move `latest` (or `next`) back to the
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
   deprecate what went out and release a new version of all seven.

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
`release:version` the registry and the packages agree. `vp run release:registry-e2e` then builds
it again from source with a local base URL, and installs it into clean apps against the exact
tarballs the dry run checked. The release workflow runs both.

## Open owner decisions

From #146. The tooling supports either choice for each.

- The `@moltenship` npm scope: it must exist, and the publisher needs rights to it.
- Publish from GitHub Actions with provenance, or locally with a token. The Actions path also needs
  the `npm` environment described above.
- `1.0.0-rc.1` first, or straight to `1.0.0`.
