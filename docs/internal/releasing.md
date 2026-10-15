# Releasing

How the packages get to npm: one command, `vp run release`, or `/release` in Claude Code, and
nobody confirms anything. Saying "release" is the approval. The command starts the release
workflow (`.github/workflows/release.yml`) on `main` and watches it; the workflow publishes through
npm trusted publishing, with provenance and no npm token. Only the owner releases; agents run the
command only through `/release`, which only the owner can start.

Nine packages publish under `@moltenship`, listed in
[`tools/release/src/config.ts`](../../tools/release/src/config.ts) and
[package-topology.md](./package-topology.md#published-packages). They share one version until after
1.0 (`architecture.md` §24). Why the release works this way, and how other libraries release:
[research/release-flow.md](./research/release-flow.md).

## One-time setup

The owner, once, before the first release with the workflow, and within 48 hours of it: npm drops a
trusted publisher that hasn't published within two days of its creation
([GitHub changelog, 2 October 2026](https://github.blog/changelog/2026-10-02-unvalidated-npm-trusted-publishing-configurations-now-expire)),
and then it must be set up again.

1. **A trusted publisher on each of the nine packages.** Either run, from the repository:

   ```sh
   vp run release:trust                     # add --disallow-tokens for step 3 too
   ```

   It needs npm 11.15 or later (`npm install -g npm@latest`), logs in to npm in the browser if
   needed, and runs `npm trust github <package> --file release.yml --repo Moltenship/time
   --allow-publish --yes` for each package that doesn't trust the workflow yet. npm asks for 2FA
   on the first; tick "skip 2FA for the next 5 minutes" in the browser and the other eight go
   through. Or, on npmjs.com, for each package: Settings → Trusted publishing → GitHub Actions,
   with these values:

   | Field | Value |
   | --- | --- |
   | Organization or user | `Moltenship` |
   | Repository | `time` |
   | Workflow filename | `release.yml` |
   | Environment name | blank |

   The packages: `@moltenship/calendar`, `calendar-core`, `calendar-dnd`, `calendar-dnd-kit`,
   `calendar-react`, `calendar-recurrence`, `calendar-temporal`, `calendar-testing` and `ics`.
2. **Remove the old token.** In the repository's settings, delete the `npm` environment and the
   `NPM_TOKEN` secret; on npmjs.com, revoke that token (Access Tokens). Nothing uses them.
3. **Optional: disallow tokens.** On npmjs.com, each package's Settings → Publishing access →
   "Require two-factor authentication and disallow tokens", or `vp run release:trust
   --disallow-tokens` (`npm access set mfa=publish`). Trusted publishing isn't a token, so the
   workflow keeps publishing; a leaked token can't.

The release workflow's first job checks the trusted publisher on every package, and a release
without one stops there, before anything else runs.

## Release

```sh
vp run release                # the version the commits since the last tag suggest
vp run release 1.0.0-rc.2     # or name it
vp run release --dry-run      # everything but publishing, pushing and the GitHub release
```

Or `/release [version] [--dry-run]` in Claude Code
([the skill](../../.claude/skills/release/SKILL.md)): it runs the command, then rewrites the
generated release notes into polished ones.

On the laptop, the command needs only `gh`, logged in with push access: no npm login, no browser,
no prompt. It:

1. **Picks the version:** the argument, or the suggestion from the Conventional Commits since the
   last tag. After a prerelease, the next one (`1.0.0-rc.2`); after a stable version, major for a
   breaking change, minor for a feature and patch for the rest. Prereleases go to npm's `next`
   tag, stable versions to `latest`.
2. **Looks at the version's runs.** One that's going is watched, and one that succeeded is
   reported. The newest that failed after it started publishing runs its failed jobs again
   ([When it stops](#when-it-stops)). None of that needs the checkout.
3. **Otherwise checks, and starts a run.** No other release may be running. The checkout must be
   `main`, clean and at `origin/main`, with CI passed on `HEAD` (it waits while CI runs; on a
   release commit the workflow pushed, which starts no CI, it reads the parent's). Nothing in
   `main`'s rules or branch protection may refuse the workflow's push: it reads them and changes
   nothing. Then it starts the release workflow on `main`, passing the commit it checked.
4. **Watches** it (`gh run watch`) and reports: the GitHub release's link, or the jobs that failed
   and the end of their logs.

The workflow, one release at a time (a second waits; dry runs queue apart):

1. **Check** (with an OIDC token, publishing nothing): the version is above the packages',
   `v<version>` isn't on GitHub, npm doesn't have it, the run is on `main` and on the commit the
   command checked, no release landed on `main` while the run waited, and npm's trusted publisher
   for the workflow is on every package: it asks npm the way `npm publish` does, trading the job's
   OIDC token for a publish token it throws away.
2. **Gate** (read-only): bumps the nine manifests, commits `chore(release): v<version>` and tags it,
   in the runner only, then runs `RELEASE_VERSION=<version> vp run release:gate` on that commit:
   the whole full tier, Firefox included, with a strict dry run that packs the tarballs and writes
   `.release/manifest.json` ([Checks](#checks)). Then it writes the release notes with
   [changelogithub](https://github.com/antfu/changelogithub) from the Conventional Commits since
   the last tag (breaking changes, then `feat`, `fix` and `perf`, by scope, with PRs and authors),
   and keeps `.release/`, with a git bundle of the release commit and tag, for the jobs after it.
   About 11 minutes.
3. **Publish** (with an OIDC token, no install scripts): the tarballs the gate checked, with
   `npm publish --provenance` through trusted publishing, skipping any npm serves already.
4. **Finish** (the only job that can write to the repository): waits for npm to serve every
   package with the gate's integrity, the dist-tag, its trusted publisher and provenance; then
   pushes the tag, so the commit npm has is on GitHub whatever happens next, then `main`, and
   writes the GitHub release, marked a prerelease for one. If `main` moved while the release ran,
   it merges the release into `main` as a PR would (`chore(release): merge v<version> into main`),
   so the tag stays on the commit the gate checked; a conflict stops it, with the steps.
5. **Install** it as a user would: `REGISTRY_E2E_PACKAGES=npm vp run registry:e2e`, #43's install
   test with the packages from npm, `shadcn add` into clean Vite and Next.js apps, then a typecheck
   and a build.

The jobs that can publish or push pin their actions to commits, use no cache, install without
scripts, and run the release's steps (`tools/release/src/ci.ts`) with node, not through Vite
Task. It takes about 15 minutes. Then rewrite the notes: `/release` does it from
[the template](../../.claude/skills/release/notes-template.md), or by hand with
`gh release edit v<version> --notes-file <file>`.

### When it stops

Run the same command again once the cause is fixed. It looks at the version's last run:

- **It failed before publishing** (the check, or the gate): nothing left the runners. Fix the
  cause, on `main` through a PR if the gate failed, and the command starts a new run from `main`.
  A missing trusted publisher fails the first job: set it up ([One-time setup](#one-time-setup)).
- **It failed after the publish job started:** the command runs the run's failed jobs again, on
  the same commit and with the same tarballs, kept for 30 days. They skip what npm serves, so the
  nine never mix two builds; the push and the GitHub release are safe to repeat.
- **It's running:** it watches it. **It released:** it says so.

A rerun runs the same commit and the same `release.yml`, so a failure after publishing that only a
change to the release tooling can fix can't be finished by one. Finish it by hand from the run's
artifact, with the version `v<version>` (the tag may be on GitHub already):

```sh
gh run download <run> --name release --dir .release
git fetch .release/release.bundle "refs/tags/v<version>:refs/tags/v<version>"
git push origin v<version>                       # if GitHub doesn't have it
git switch main && git pull && git merge --no-ff v<version> && git push
gh release create v<version> --verify-tag --title <version> --notes-file .release/notes.md --prerelease
```

`--prerelease` is for a prerelease only.

`--dry-run` starts a run with `dry-run` on, from any pushed branch: the check reports what a
release would stop at instead of stopping, and the gate runs. Then two jobs of their own, with no
OIDC token and no write access, check what publishing would do and how the push would go, and
print the notes; the publish and finish jobs don't run. It publishes, pushes and releases nothing,
and only reports CI and `main`'s rules on the laptop.

### Why this order

Nothing leaves the runners until the gate has passed on the release commit, so a red gate leaves
no tag, commit or version anywhere. npm comes before `main`: the docs site deploys from `main` and
its registry asks for the version `main` has, so `main` gets the new version only once npm serves
it. The release commit travels from the gate to the jobs after it as a git bundle, and those jobs
publish and push exactly what the gate checked.

### Trusted publishing, and nobody confirming

- The owner decided that asking for a release is the approval: no 2FA prompt, no environment
  reviewer, no npm login, no typing the version back. Publishing from a laptop always needs 2FA,
  and tokens that bypass it can only stage from January 2027
  ([GitHub changelog, 8 July 2026](https://github.blog/changelog/2026-07-08-npm-install-time-security-and-gat-bypass2fa-deprecation/)),
  so CI publishes, through npm trusted publishing.
- What stands in for a person's approval: only the owner can push to `main` or start workflows;
  each package's trusted publisher is pinned to this repository and `release.yml`; and with
  "Require two-factor authentication and disallow tokens", no token can publish at all.
- Trusted publishing on GitHub Actions signs provenance by itself, for a public repository and
  package; the publish step passes `--provenance` too. `1.0.0-rc.1` went out with a token and
  provenance. pnpm's `trustPolicy: no-downgrade` ranks a trusted publisher with provenance above
  provenance alone, so releases from the workflow aren't a downgrade from rc.1; npm has no such
  check.
- The trusted publisher names `release.yml`: renaming the file stops releases until each package's
  trusted publisher names the new one.

### CI

CI never publishes. Its on-demand `release-gate` job (`gh workflow run ci.yml --ref <branch>`)
runs the release workflow's gate steps on a fresh runner. A PR that changes the release tooling or
the full gate links a green run, and a green dry run of the release workflow.
`tools/release/tests/workflow.test.ts` holds the release workflow to its jobs, permissions and
steps, and fails if another workflow publishes or any holds an npm token.

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
| `vp run release` | The release itself ([Release](#release)). After publishing, the workflow checks that npm serves every package the dry run packed, with its integrity, its dist-tag, its trusted publisher and provenance, and runs #43's install test with the packages from npm (`REGISTRY_E2E_PACKAGES=npm vp run registry:e2e`) | Releases |

The PR checks read the built packages, so on their own they run after `vp run ci:build`. Only the
dry run writes `.release/`. It takes the version to check from `--version`, or else from
`RELEASE_VERSION`, which the release workflow sets for `release:gate`; a stray `RELEASE_VERSION` in
your shell makes a plain dry run check that version, and the error says so. Without
`--require-clean`, it also runs on a tree with changes and records that in the manifest, which the
publish step then refuses; the release gate passes the flag. `vp run release --dry-run` is another
thing: a rehearsal of the whole release workflow, which runs this dry run inside its gate.
`release:artifacts` only reads `.release/`: it packs nothing, and refuses a manifest from another
commit or a file whose hash changed since.

- **The API changed on purpose.** Run `vp run release:api:update` and commit the reports with the
  change. The diff in `packages/*/api-report.md` is what reviewers look at.
- **A budget is too small.** Raise it in `tools/release/src/config.ts` in the PR that needs it, and
  say why in the PR.

## What the publish step checks

The publish job (`tools/release/src/publish.ts`) refuses unless:

- `.release/manifest.json` exists from the gate's passing dry run;
- the dry run ran on `HEAD`, the release commit, on a clean tree, and the tree is still clean;
- `HEAD` is on `origin/main`, or right on top of it: the release commit, not pushed yet;
- the dry run checked the version asked for, and it isn't `0.0.0`;
- every published package was packed, and each tarball's sha512 still matches;
- npm is 11.5.1 or later, the first that publishes through trusted publishing.

Before publishing anything, it asks npm about all nine. A version npm already serves is skipped
only when npm's integrity matches the tarball the gate checked; otherwise it stops, so the nine
packages on npm never mix two builds. It runs `npm publish <tarball> --provenance` outside the
workspace with an empty npmrc and no token in its environment, so the job's OIDC token is the only
credential npm can use, and the registry is always `https://registry.npmjs.org/`.

Each package's `prepublishOnly` script fails, so `pnpm publish` in a package folder, or
`pnpm publish -r`, can't skip the gate. Publishing a tarball doesn't run that script.

npm pointed `latest` at `1.0.0-rc.1`, the first version, though it went out under `next`: `latest`
stays on the RC until `1.0.0` ships.

## Rollback

A published version can't be changed or reused, even after an unpublish. Fix forward.

1. **Stop new installs.** For each of the nine packages, move `latest` (or `next`) back to the
   previous version and deprecate the bad one:

   ```sh
   vp pm dist-tag add @moltenship/calendar-core@<previous> latest
   vp pm deprecate @moltenship/calendar-core@<bad> "Broken; use <fixed>. See <issue link>."
   ```

   With no previous version, skip the dist-tag and only deprecate.
2. **Fix and release again** with a new version (`1.0.1`, or `1.0.0-rc.3`): `vp run release`.
3. **Partial publish.** If the publish job published some packages and not the rest, run
   `vp run release <version>` again: it runs the run's failed jobs again, on the same commit and
   tarballs, and they skip what npm serves. If the fix needs a code change, deprecate what went
   out and release a new version of all nine.

Unpublish only for something that must disappear, such as a leaked secret. npm allows it within
72 hours, and it breaks lockfiles that already reference the version.

## Deprecation

- Public exports, event semantics, view strategies, transactions and CSS variable names are
  contracts (`architecture.md` §24).
- To retire an API, deprecate it in a minor release: a `@deprecated` JSDoc tag naming the
  replacement, a line in the release notes and a docs note. It keeps working.
- Remove it in the next major, with migration notes, and a codemod when that's practical.
- To retire a whole package, `vp pm deprecate @moltenship/<package> "<message>"` deprecates every
  version; say where to go instead.

## Registry

The registry (#43) isn't published to npm: the docs site serves it at `/r/<item>.json`, built
from `main`. The dry run builds it into `.release/registry` and checks that `compatibility.json`
and every item's `@moltenship/calendar` range ask for the version it packed, so after the bump
the registry and the packages agree. `vp run release:artifacts` serves that
build at `/r` from the docs site built on the tarballs. Its install test builds the registry again
from source with a local base URL and installs it into clean apps against the exact tarballs the
dry run checked. The release gate runs both.
