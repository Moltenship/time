# Releasing

How the packages get to npm: one command on the owner's laptop, `vp run release`, or `/release` in
Claude Code, which runs it and then writes the release notes. Nothing publishes from CI. Only the
owner releases; agents run the command only through `/release`, which only the owner can start.

Nine packages publish under `@moltenship`, listed in
[`tools/release/src/config.ts`](../../tools/release/src/config.ts) and
[package-topology.md](./package-topology.md#published-packages). They share one version until after
1.0 (`architecture.md` §24). Why the release works this way, and how other libraries release:
[research/release-flow.md](./research/release-flow.md).

## Release

```sh
vp run release                # asks for the version, and suggests one
vp run release 1.0.0-rc.2     # or names it
vp run release --dry-run      # everything but publishing, pushing and the GitHub release
```

Or `/release [version] [--dry-run]` in Claude Code
([the skill](../../.claude/skills/release/SKILL.md)): it runs the command, shows you npm's 2FA
link when it comes, and then rewrites the generated notes into polished ones.

Once, on the laptop: `vp exec pnpm login` (npm's browser login; the session lasts two hours, so
log in again before each release), `gh auth login`, and the browsers for the gate,
`vp exec --filter a11y playwright install chromium firefox webkit`.

The command, in order:

1. **Checks.** The checkout is `main`, clean, and at `origin/main`, with the tags fetched. pnpm is
   logged in to npm (`pnpm whoami`), it runs in a terminal (npm's 2FA needs one), and git and `gh`
   can push (`git push --dry-run`; git never prompts for credentials). Nothing in `main`'s rules
   or branch protection would refuse a direct push of the release commit: it reads them and changes
   nothing. CI passed on `HEAD`; if
   it's still running, the command waits for it before publishing. Playwright's Firefox doesn't
   start on macOS 27 (#182), so there it also needs CI's Firefox job on `HEAD`: if no dispatched
   CI run has one, it starts one (`gh workflow run ci.yml --ref main`) and waits for it before
   publishing. Dispatched runs have a concurrency group of their own, so a push to `main` doesn't
   cancel it.
2. **Version.** The argument, or a prompt with a suggestion from the Conventional Commits since
   the last tag: after a prerelease, the next one (`1.0.0-rc.2`) or its stable version; after a
   stable one, major for a breaking change, minor for a feature and patch for the rest. Without a
   terminal it doesn't ask: it fails with the suggestion. A version that has no GitHub release
   yet is suggested again, to finish it. Prereleases go to npm's `next` tag, stable versions to
   `latest`, and `--tag` picks another, never `latest` for a prerelease.
3. **Bump.** It asks you to type the version to confirm (`--yes` skips that), sets the version in
   the nine manifests and commits `chore(release): v<version>`.
4. **Gate.** `RELEASE_VERSION=<version> vp run release:gate` on the release commit: the whole full
   tier, with a strict dry run that packs the tarballs and writes `.release/manifest.json`
   ([Checks](#checks)). About three minutes on an Apple-silicon laptop. Then
   `.release/release.json` records the commit and the manifest's hash, so a rerun can tell this
   gate's tarballs from any a later dry run wrote.
5. **Tag.** `v<version>`, annotated, on the release commit, locally.
6. **Notes.** [changelogithub](https://github.com/antfu/changelogithub) writes the release's first
   notes from the Conventional Commits since the last tag into `.release/notes.md`: breaking
   changes, then `feat`, `fix` and `perf`, by scope, each with its PR and author. Other types stay
   out. PR titles are the notes, which is why they follow `AGENTS.md`'s format.
7. **Publish.** It publishes the tarballs the gate checked through npm's
   [staged publishing](https://docs.npmjs.com/staged-publishing):
   `pnpm stage publish` uploads each one, which needs no 2FA, and one `pnpm stage approve`
   publishes all nine with a single 2FA, in dependency order. pnpm shows npm's link; approve it
   in the browser. A staged version can't be installed until it's approved.
8. **Push.** `main` and the tag, in one atomic push. If `main` moved while it published, it merges
   the release into `main` as a PR would (`chore(release): merge v<version> into main`) and pushes
   that, so `main`'s history comes first and the tag stays on the commit the gate checked. A merge
   that conflicts stops, with the steps.
9. **Check npm.** It waits up to 15 minutes for npm to serve every package the gate packed, and
   fails as soon as one differs: its `dist.integrity` from the tarball's, its dist-tag from the
   version (unless a newer release took it), or no approver on it.
10. **GitHub release.** `v<version>` with the generated notes, marked a prerelease for one.
11. **Install it as a user would.** `REGISTRY_E2E_PACKAGES=npm vp run registry:e2e`: #43's install
    test with the packages from npm, `shadcn add` into clean Vite and Next.js apps, then a
    typecheck and a build.

Then rewrite the notes: `/release` does it from
[the template](../../.claude/skills/release/notes-template.md), or edit them by hand with
`gh release edit v<version> --notes-file <file>`.

### When it stops

Until its first upload to npm, nothing has left the laptop: a failure, Ctrl-C, `SIGTERM` or
`SIGHUP` stops the gate, deletes the local tag and resets the release commit or the bumped
manifests, so the checkout is as it was. Only a `SIGKILL` can leave them behind. Fix what it names
and run it again. A red gate or CI needs a fix on `main` through a PR first.

From the first upload on, run the same command again: it picks up where it stopped. Once the tag
is on GitHub, npm serves any of the nine at the version, or `.release/release.json` says this
checkout started publishing, it only finishes. It skips the CI checks, which passed before, and
the gate, as long as its manifest and tarballs are unchanged, by their hashes; if a later dry run
rewrote them, it runs the gate again on the release commit, and npm's integrity check catches any
difference. It finds the release commit or the tag the stopped run left, skips the packages npm
serves with the gate's tarball, approves a version an earlier run staged with the same tarball and
tag instead of staging it again, and leaves a GitHub release that's already out. Once npm serves
all nine, it doesn't need an npm login. A version staged with another tarball or tag stops it:
reject it (`vp pm stage reject <id>`) and run again. While a release is publishing, the checkout
refuses to release another version. Only the checkout that published can finish a release: another
one has no manifest to check npm against, and the command says so.

`--dry-run` does everything up to the publish, checks what publishing would do, then undoes the
commit and tag. It commits on a detached HEAD, so the branch never moves, and goes back to the
branch at the end or on Ctrl-C, `SIGTERM` or `SIGHUP`; after a `SIGKILL`, `git switch <branch>`
and `git tag -d v<version>`. It goes on past what a release would stop at (another branch, no npm
login, CI that hasn't run) and lists it at the end. It doesn't wait for CI or start a run.

### Why publish before pushing

Before the publish, a failure costs nothing: the release commit and tag are still local. The docs
site deploys from `main`, and its registry asks for the version `main` has, so `main` gets the new
version only once npm serves it. The cost is that `main` can move while the release publishes,
which the push handles by merging it.

### npm's 2FA

- `npm login` and `pnpm login` give a two-hour session, and npm asks for 2FA on every publish in it
  ([GitHub changelog, 9 December 2025](https://github.blog/changelog/2025-12-09-npm-classic-tokens-revoked-session-based-auth-and-cli-token-management-now-available/)).
  Nine plain publishes would ask up to nine times.
- Staging needs no 2FA and approving does; `pnpm stage approve` approves the nine with one
  ([pnpm 11.25](https://github.com/pnpm/pnpm/releases/tag/v11.25.0), and 12). Approving on
  npmjs.com works too, one package at a time.
- pnpm asks for 2FA only in a terminal (`ERR_PNPM_OTP_NON_INTERACTIVE` otherwise), so an agent runs
  the command through `.claude/skills/release/terminal.sh`, and you open the link it relays. An
  account that answers with a one-time password from an app instead of a passkey runs
  `vp run release` in its own terminal and types the code there: an agent can't.
- `NODE_AUTH_TOKEN` still works: the command reads the token from the environment and never writes
  it to disk. A granular token that bypasses 2FA can stage, but the approval needs the owner's 2FA
  anyway, and from January 2027 such tokens can only stage
  ([GitHub changelog, 8 July 2026](https://github.blog/changelog/2026-07-08-npm-install-time-security-and-gat-bypass2fa-deprecation/)).
- A laptop can't sign provenance. An approved staged publish is the trust evidence pnpm's
  `trustPolicy: no-downgrade` ranks highest, above trusted publishing and provenance, so releases
  after `1.0.0-rc.1`, which went out from Actions with provenance, don't read as a downgrade. From
  now on every release must be staged and approved, from the laptop or from CI: a direct publish
  would read as a downgrade.

### CI

CI never publishes. Its on-demand `release-gate` job (`gh workflow run ci.yml --ref <branch>`) runs
`vp run release:gate` on a fresh Linux runner, where Firefox starts. A PR that changes the release
tooling or the full gate links a green run. `tools/release/tests/workflow.test.ts` fails if a
workflow gets npm credentials or a publish step.

## Checks

Each check is a `vp run` task. The same tasks run locally, in CI and in `vp run release`. The
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
| `vp run release` | The release itself ([Release](#release)). After publishing, it checks that npm serves every package the dry run packed, with its integrity, its dist-tag and an approver, and runs #43's install test with the packages from npm (`REGISTRY_E2E_PACKAGES=npm vp run registry:e2e`) | Releases |

The PR checks read the built packages, so on their own they run after `vp run ci:build`. Only the
dry run writes `.release/`. It takes the version to check from `--version`, or else from
`RELEASE_VERSION`, which `vp run release` sets for `release:gate`; a stray `RELEASE_VERSION` in
your shell makes a plain dry run check that version, and the error says so. Without
`--require-clean`, it also runs on a tree with changes and records that in the manifest, which the
publish step then refuses; the release gate passes the flag. `vp run release --dry-run` is another
thing: a rehearsal of the whole release, which runs this dry run inside the gate.
`release:artifacts` only reads `.release/`: it packs nothing, and refuses a manifest from another
commit or a file whose hash changed since.

- **The API changed on purpose.** Run `vp run release:api:update` and commit the reports with the
  change. The diff in `packages/*/api-report.md` is what reviewers look at.
- **A budget is too small.** Raise it in `tools/release/src/config.ts` in the PR that needs it, and
  say why in the PR.

## What the publish step checks

The publish step (`tools/release/src/publish.ts`) refuses unless:

- `.release/manifest.json` exists from a passing dry run;
- the dry run ran on `HEAD`, on a clean tree, and the tree is still clean;
- `HEAD` is on `origin/main`, or right on top of it: the release commit, not pushed yet;
- the dry run checked the version you asked for, and it isn't `0.0.0`;
- every published package was packed, and each tarball's sha512 still matches.

Before staging anything, it asks npm about all nine. A version npm already serves is skipped only
when npm's integrity matches the tarball the dry run checked; otherwise it stops, so the nine
packages on npm never mix two builds. Each tarball it stages must come back from pnpm with the same
integrity. The registry is always `https://registry.npmjs.org/`: it sets it, and refuses when an
`.npmrc` points `registry` or `@moltenship:registry` anywhere else.

Each package's `prepublishOnly` script fails, so `pnpm publish` in a package folder, or
`pnpm publish -r`, can't skip the gate. Publishing or staging a tarball doesn't run that script.

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
3. **Partial publish.** If the approval published some packages and not the rest, run
   `vp run release <version>` again from the same checkout: it approves what's still staged, or
   stages it again. npm can take a minute to list a version it just took; until then, a rerun can
   fail on that package, which is safe. If the fix needs a code change, deprecate what went out
   and release a new version of all nine.
4. **Staged, never approved.** A staged version doesn't install. Reject it with
   `vp pm stage reject <id>` (`vp pm stage list` shows the ids), or approve it with
   `vp pm stage approve <id>`.

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

## Owner setup

- The `@moltenship` npm scope exists, and all nine packages are on npm since `1.0.0-rc.1`.
- Since the release command, nothing uses the repository's `npm` environment or its `NPM_TOKEN`
  secret: the owner can delete both. Trusted publishing isn't set up and isn't needed; the
  research note says when it would be.
