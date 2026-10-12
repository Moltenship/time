# Releasing

How the packages get to npm. Only the owner publishes. Everything before the publish step runs
locally and offline, and never talks to the npm registry.

Seven packages publish under `@moltenship`, listed in
[`tools/release/src/config.ts`](../../tools/release/src/config.ts) and
[package-topology.md](./package-topology.md#published-packages). They share one version until after
1.0 (`architecture.md` §24).

## Checks

Each check is a `vp run` task. The same tasks run locally and in the release workflow. The tier
says where a check belongs in the local gate: PR checks are cheap enough for `vp run ready`, and the
full tier is the release gate. #47 owns the tiers and wires these tasks into them.

| Task | What it checks | Tier |
| --- | --- | --- |
| `vp run release:size` | Each published entry point's emitted ESM, raw and gzip, against its budget in `tools/release/src/config.ts` | PR |
| `vp run release:api` | Each package's built declarations against its committed `api-report.md` | PR |
| `vp run release:exports` | Packs every package into `.release/tarballs`, then runs publint and are-the-types-wrong (ESM-only), checks for `LICENSE`, and checks that base packages don't import the dnd adapter | PR |
| `vp run release:consumer` | Installs the tarballs into a new project outside the workspace, offline from the pnpm store; imports every package in Node, type-checks them under `NodeNext` and `Bundler`, expects deep imports to fail, and bundles the facade without its pointer exports to show `calendar-dnd` tree-shakes away | Full |
| `vp run release:dry-run` | A fresh build of every published package, then all of the above and the registry smoke. Writes `.release/manifest.json` | Full |

`release:size` and `release:api` read the built packages. Run them after `vp run ci:build`, as
`vp run ready` does.

- **The API changed on purpose.** Run `vp run release:api:update` and commit the reports with the
  change. The diff in `packages/*/api-report.md` is what reviewers look at.
- **A budget is too small.** Raise it in `tools/release/src/config.ts` in the PR that needs it, and
  say why in the PR.

## Release steps

1. **Changelog.** PRs that change a published package add a line under "Unreleased" in
   [`CHANGELOG.md`](../../CHANGELOG.md).
2. **Version PR.** On a branch, run `vp run release:version 1.0.0-rc.1` (or whichever version).
   It sets the version in all seven manifests and turns "Unreleased" into `## 1.0.0-rc.1 (date)`.
   Open a PR, review, merge.
3. **Publish from `main`**, one of two ways:
   - **GitHub Actions.** Actions → Release → Run workflow, on `main`, with the version. The
     workflow runs `vp run ready`, `vp run release:dry-run --version <v>` and
     `vp run release:publish --version <v> --provenance --yes` on that commit. It needs either an
     `NPM_TOKEN` secret that can publish to `@moltenship`, or npm trusted publishing set up for
     `release.yml`. Packages get npm provenance.
   - **Locally.** From a clean checkout of that commit:

     ```sh
     vp install
     vp run ready
     vp run release:dry-run --version 1.0.0-rc.1
     npm login   # or export NODE_AUTH_TOKEN=<token>
     vp run release:publish --version 1.0.0-rc.1
     ```

     The publish step asks you to type the version. Local publishes have no provenance.
4. **After publishing.** Tag the commit (`v1.0.0-rc.1`), push the tag, and write a GitHub release
   from the changelog section. These steps aren't automated yet.

## What the publish step checks

`release:publish` refuses unless:

- `.release/manifest.json` exists from a passing dry run;
- the dry run ran on `HEAD`, on a clean tree, and the tree is still clean;
- the dry run checked the version you asked for, and it isn't `0.0.0`;
- every published package was packed, and each tarball's sha512 still matches.

Then it publishes those exact tarballs, dependencies first, and skips any version npm already has,
so running it again after a partial failure is safe. Prereleases get the `next` dist-tag and stable
versions `latest`; `--tag` picks another, but a prerelease can't take `latest`. `--provenance` only
works in GitHub Actions. The registry is always `https://registry.npmjs.org/`.

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
   on the same commit. If the fix needs a code change, deprecate what went out and release a new
   version of all seven.

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

The dry run runs `vp run registry:smoke`, which validates the registry items. #43 adds
`registry:build`, which writes the registry JSON the docs site serves, and `registry:e2e`, which runs
`shadcn add` in clean apps against packed packages. Once they're on `main`, add both to the
`registry` step in [`tools/release/src/dry-run.ts`](../../tools/release/src/dry-run.ts), so the
dry run builds the registry for the version it packs.

## Open owner decisions

From #146. The tooling supports either choice for each.

- The `@moltenship` npm scope: it must exist, and the publisher needs rights to it.
- Publish from GitHub Actions with provenance, or locally with a token.
- `1.0.0-rc.1` first, or straight to `1.0.0`.
