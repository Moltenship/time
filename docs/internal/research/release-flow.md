# Research: how to release the nine packages

How large libraries release today, what npm and pnpm allow in October 2026, and what that means
for `vp run release`. Checked against the repositories' default branches, npm's and pnpm's docs and
source, and the registry, on 15 October 2026. Anything not verified says so. The owner then decided
that nobody confirms a release ([below](#the-owners-decision-nobody-confirms)), which settled it:
CI publishes, through trusted publishing.

## Short answer

- **Publishing from CI on a tag is the norm.** TanStack, antfu's repositories, vitest, nitro and
  nuxt publish from GitHub Actions with trusted publishing, so provenance is automatic. Laptop
  publishing survives in smaller unjs packages (h3 stable, unbuild), without provenance.
- **From a laptop, publishing always asks a person.** A login session asks for 2FA on every
  publish, and staged publishing, which batches nine into one approval, still needs that approval.
- **The release: CI, through trusted publishing, started by one command.** The owner wants no
  confirmation at all, so `vp run release` starts a workflow that gates, publishes with trusted
  publishing and provenance, pushes and writes the release. All nine packages exist on npm, so
  trusted publishing's first-publish limit doesn't apply.

## How maintainers release

| Project | Where it publishes | Fixed versions in a monorepo | Changelog and GitHub release | Provenance |
| --- | --- | --- | --- | --- |
| TanStack query, router | CI, on push to `main` (and `*-pre`, `*-maint`), `changesets/action` | Changesets; query puts about 20 packages in one `fixed` group, router has none | `@changesets/changelog-github` per package; one combined GitHub release from a script | Trusted publishing, `id-token: write`, no token |
| antfu (ni, eslint-config, unocss, shiki, slidev) | Laptop runs `bumpp`: bump, commit, tag, push. CI publishes on the `v*` tag | `bumpp -r`, or a `files` list in `bump.config.ts` | `changelogithub` in CI, from Conventional Commits | Trusted publishing |
| vitest | `workflow_dispatch` opens a release PR (bumpp's `versionBump`); merging it stages from CI, an approver publishes | bumpp | changelogithub | Trusted publishing, staged, approver on the registry |
| unjs `changelogen` | `changelogen --release --push --publish` from a laptop (unbuild, h3 stable); nitro bumps locally and publishes from CI on the tag | One `package.json` only; monorepos are open issues (#85, #142) | Writes CHANGELOG.md; `changelogen gh release` syncs it to GitHub | Only on GitHub Actions; h3 2.0.2 has none |
| nuxt | `danielroe/uppt`: a release PR, then staged publishing from CI | uppt | uppt | Trusted publishing, staged |
| changesets | `changeset version` in a "Version Packages" PR; `changeset publish` on merge, in CI | `fixed` groups | A CHANGELOG.md per package; a GitHub release per package | Trusted publishing recommended; it can't stage yet |
| release-it | Laptop, one package at a time | `@release-it/bumper` or `@release-it-plugins/workspaces` | `@release-it/conventional-changelog`; GitHub release with a token, or a pre-filled form | Trusted publishing documented; `npm.stage` for staging |

Sources: TanStack's [query](https://github.com/TanStack/query/blob/HEAD/.github/workflows/release.yml)
and [router](https://github.com/TanStack/router/blob/HEAD/.github/workflows/release.yml) workflows
and [`.changeset/config.json`](https://github.com/TanStack/query/blob/HEAD/.changeset/config.json);
[bumpp](https://github.com/antfu-collective/bumpp/blob/HEAD/README.md),
[changelogithub](https://github.com/antfu/changelogithub/blob/HEAD/README.md), the shared
[`sxzz/workflows` release workflow](https://github.com/sxzz/workflows/blob/HEAD/.github/workflows/release.yml),
[unocss](https://github.com/unocss/unocss/blob/HEAD/.github/workflows/release.yml),
[shiki](https://github.com/shikijs/shiki/blob/HEAD/.github/workflows/release.yml),
[slidev](https://github.com/slidevjs/slidev/blob/HEAD/.github/workflows/release.yml),
[vitest](https://github.com/vitest-dev/vitest/blob/HEAD/.github/workflows/publish.yml);
[changelogen](https://github.com/unjs/changelogen/blob/HEAD/README.md) and its
[monorepo issue](https://github.com/unjs/changelogen/issues/85),
[h3](https://github.com/h3js/h3/blob/HEAD/.github/workflows/publish.yml),
[nitro](https://github.com/nitrojs/nitro/blob/HEAD/.github/workflows/npm-publish.yml),
[nuxt](https://github.com/nuxt/nuxt/blob/HEAD/.github/workflows/release.yml);
[changesets](https://github.com/changesets/changesets/blob/HEAD/site/guide/automating.md),
[fixed packages](https://changesets.dev/guide/fixed-packages),
[changesets/action](https://github.com/changesets/action/blob/HEAD/action.yml);
[release-it](https://github.com/release-it/release-it/blob/HEAD/docs/npm.md) and its
[workspaces plugin](https://github.com/release-it-plugins/workspaces/blob/HEAD/index.js). The
provenance and approver columns come from each package's latest version on the registry.

## Vite+

Vite+ 1.1.0 has no release, version or changelog command (`vp help`;
`node_modules/vite-plus/docs`). It forwards publishing to the package manager: `vp pm publish`,
and `vp pm stage publish|list|view|download|approve|reject` for npm's staged publishing (pnpm 11.3
or later). `vp run release` is a task of this repository.

## npm, from a laptop

- **2FA on every publish.** Since 9 December 2025, classic tokens are revoked and `npm login` gives
  a two-hour session in which publishing asks for 2FA
  ([changelog](https://github.blog/changelog/2025-12-09-npm-classic-tokens-revoked-session-based-auth-and-cli-token-management-now-available/)).
  The login is a browser flow by default (`auth-type=web`,
  [config](https://docs.npmjs.com/cli/v11/using-npm/config#auth-type)).
- **TOTP is on its way out.** New TOTP setups are disabled and existing ones are being phased out,
  for WebAuthn and passkeys
  ([changelog, 29 September 2025](https://github.blog/changelog/2025-09-29-strengthening-npm-security-important-changes-to-authentication-and-token-management/)).
  When it ends isn't announced.
- **Tokens.** Granular tokens with write access last 7 days by default and 90 at most (same
  changelog). Tokens that bypass 2FA lose account management around August 2026, and around
  January 2027 they can only read and stage, not publish
  ([changelog, 8 July 2026](https://github.blog/changelog/2026-07-08-npm-install-time-security-and-gat-bypass2fa-deprecation/)).
- **The five-minute window.** npm's 2022 2FA page added "remember me for 5 minutes", tied to the
  same IP and token
  ([changelog](https://github.blog/changelog/2022-07-26-general-availability-of-improved-2fa-experience-in-npm/)).
  Today's docs don't mention it: unverified. Without it, nine plain publishes ask for 2FA nine
  times; `--otp` covers them only while one code is valid, and a passkey-only account has none.
- **Staged publishing, GA since 22 May 2026.** `npm stage publish` uploads without 2FA, and
  `approve` publishes with it. The tag is fixed at staging. Staging a package that doesn't exist
  yet publishes a `0.0.0-stage` placeholder
  ([docs](https://docs.npmjs.com/staged-publishing),
  [changelog](https://github.blog/changelog/2026-05-22-staged-publishing-and-new-install-time-controls-for-npm/)).
  npm's `approve` takes one id; pnpm's takes several and approves the batch with one 2FA, in
  dependency order ([pnpm 11.25](https://github.com/pnpm/pnpm/releases/tag/v11.25.0)). How long a
  staged version waits isn't documented.
- **No provenance from a laptop.** Provenance needs a supported cloud CI runner
  ([docs](https://docs.npmjs.com/generating-provenance-statements)).

## pnpm

- **Publishing without npm.** pnpm 11 and 12 publish natively and handle npm's browser 2FA (the
  `authUrl`/`doneUrl` flow), but only in a terminal. Without one they stop with
  `ERR_PNPM_OTP_NON_INTERACTIVE` unless given `--otp` or `PNPM_CONFIG_OTP`. That's in pnpm 12.10.1's
  messages and the [11.0 release](https://github.com/pnpm/pnpm/releases/tag/v11.0.0).
- **`pnpm stage publish <tarball> --json`** prints `{ "<name>": { …, "integrity", "stageId" } }`
  ([source](https://github.com/pnpm/pnpm/blob/HEAD/pnpm/crates/publish/src/publish_summary.rs)).
  `pnpm stage approve <id>…` approves the batch through one OTP session
  ([source](https://github.com/pnpm/pnpm/blob/HEAD/pnpm/crates/cli/src/cli_args/stage/approve.rs)).
  Approving with no id needs a terminal to pick from.
- **`trustPolicy: no-downgrade`.** An install fails, or since pnpm 11.28 and 12.7 picks an older
  version, when a version has weaker trust evidence than one published before it. The ranking
  ([source](https://github.com/pnpm/pnpm/blob/HEAD/pnpm11/resolving/npm-resolver/src/trustChecks.ts)):
  1. a staged publish with an approver;
  2. a trusted publisher with provenance;
  3. provenance alone;
  4. nothing.

  For a stable version, prerelease history doesn't count (since 10.24,
  [settings](https://pnpm.io/settings/dependency-resolution)).

## Trusted publishing

- **Requirements:** npm 11.5.1 or later and Node 22.14, a GitHub-hosted runner (or GitLab or
  CircleCI), and `id-token: write`. On npmjs.com a GitHub publisher has four fields: the
  organization or user, the repository, the workflow's file name alone (`release.yml`, not its
  path) and an optional environment ([docs](https://docs.npmjs.com/trusted-publishers)).
- **Provenance** is automatic on GitHub Actions for a public repository and package. A publisher
  can be limited to staging.
- **"Require two-factor authentication and disallow tokens"** on a package only affects tokens:
  trusted publishers keep working. `npm access set mfa=publish` is the same setting (2FA required,
  tokens can't override it; `libnpmaccess`).
- **No first publish.** The package must exist before a publisher can be set up, so trusted
  publishing can't do a package's first publish.
- **`npm trust`** (npm 11.15 or later) sets publishers up from the CLI:
  `npm trust github <package> --file release.yml --repo Moltenship/time --allow-publish --yes`.
  One package per call; the first asks for 2FA, and ticking "skip 2FA for the next 5 minutes"
  lets the rest through, which npm's docs suggest for a loop
  ([`npm trust`](https://docs.npmjs.com/cli/v11/commands/npm-trust)). `vp run release:trust` is
  that loop.
- **Expiry.** Since 2 October 2026 a publisher that hasn't published within 48 hours of its
  creation expires, and must be set up again; npm also refuses tokens from `issue_comment` events
  ([changelog](https://github.blog/changelog/2026-10-02-unvalidated-npm-trusted-publishing-configurations-now-expire)).
  `workflow_dispatch` is fine.
- **The exchange.** `npm publish` asks GitHub for an OIDC token with the audience
  `npm:registry.npmjs.org` and `POST`s it to
  `/-/npm/v1/oidc/token/exchange/package/<name>` for a publish token; on failure it logs and
  publishes without a token ([`oidc.js`](https://github.com/npm/cli/blob/latest/lib/utils/oidc.js)).
  The release workflow's first job makes the same exchange for each package, so a missing
  publisher stops it before the gate. With none set up, npm answers
  `404 OIDC token exchange error - package not found`.

## This repository

- **`1.0.0-rc.1`** went out on 14 October 2026 from `release.yml`
  ([run 38620983432](https://github.com/Moltenship/time/actions/runs/38620983432)), with
  `NPM_TOKEN` and provenance.
- **The 404.** pnpm tried trusted publishing first and logged
  `ERR_PNPM_AUTH_TOKEN_EXCHANGE … (status code 404)`, since no trusted publisher was configured,
  then fell back to the token. Provenance doesn't need a trusted publisher, so it was signed anyway.
- **Placeholders.** Each package's first version on npm is a `0.0.0-stage` placeholder with the time
  the job published it; `1.0.0-rc.1` became visible one to two minutes later. Why a direct
  publish made placeholders isn't verified.
- **Trust evidence.** `1.0.0-rc.1` has provenance, from a token, and no trusted publisher or
  approver (`_npmUser` is the owner's account). A later release from a laptop without staging
  would have none, so `1.0.0-rc.2` would read as a downgrade under `trustPolicy: no-downgrade`.
  One through trusted publishing has a trusted publisher and provenance, which pnpm ranks above
  provenance alone: no downgrade. npm itself has no such check: its install-time controls (npm
  11.15) choose where packages may come from, not their trust evidence
  ([changelog](https://github.blog/changelog/2026-05-22-staged-publishing-and-new-install-time-controls-for-npm/)).

## The options

| | **Local, staged** (#259's first version) | **antfu's hybrid** | **CI on `workflow_dispatch`** (built) |
| --- | --- | --- | --- |
| The laptop | Bumps, gates, stages, approves, pushes, writes the release | Bumps, tags, pushes | Starts the workflow and watches it |
| CI | Nothing | Publishes on the tag | Bumps, gates, publishes, pushes, writes the release |
| A person confirms | One 2FA for all nine | Nothing | Nothing |
| Provenance | No | Yes | Yes |
| pnpm's trust rank | Highest (approver) | Trusted publisher, above rc.1's provenance | Trusted publisher, above rc.1's provenance |
| What a red gate leaves | Nothing, after an undo | A pushed tag and version bump on `main` | Nothing: the commit and tag stay in the runner |
| What ships | The tarballs the local gate checked | A second build, on the tag | The tarballs the gate checked, by hash |
| Firefox (#182) | A wait for CI's job on macOS 27 | CI | CI |

## The owner's decision: nobody confirms

The owner wants telling the agent "release" to be the whole approval: no 2FA, no staged approval,
no environment reviewer, no npm login, no typing the version back. That rules out every laptop
flow and staging, and leaves trusted publishing from CI.

**Why `workflow_dispatch` and not a tag push.** With antfu's hybrid the laptop pushes the version
bump and the tag before anything checks them, so a red gate leaves both on `main` and GitHub. With
a dispatch, the workflow bumps, commits and tags inside the runner, gates that commit, and pushes
nothing until the gate passes and npm serves the packages. The laptop keeps no state, so it needs
no undo, signals or resume logic. A run that fails after publishing finishes when its failed jobs
run again on the same commit and tarballs, which GitHub keeps.

**What it gives up, and what stands in.** No person looks at a release before it ships. In
exchange:

- Only the owner can push to `main` or start workflows. A real release runs only from `main`: an
  accident guard, which a branch's copy of the workflow could drop.
- Each package's trusted publisher is pinned to `Moltenship/time` and `release.yml`.
- With "Require two-factor authentication and disallow tokens", no token can publish at all.
- The gate runs the whole full tier on the exact commit, and the publish job ships only the
  tarballs it checked.

The publisher could also name a GitHub environment limited to `main`, with no reviewer, so a
branch's copy of the workflow couldn't publish. The owner chose to leave the environment blank: it
is one more setting to keep, and only the owner can push branches anyway.
