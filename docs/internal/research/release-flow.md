# Research: how to release the nine packages

How large libraries release today, what npm and pnpm allow from a laptop in October 2026, and
what that means for `vp run release`. Checked against the repositories' default branches, npm's
and pnpm's docs and source, and the registry, on 15 October 2026. Anything not verified says so.

## Short answer

- **Publishing from CI on a tag is the norm.** TanStack, antfu's repositories, vitest, nitro and
  nuxt publish from GitHub Actions with trusted publishing, so provenance is automatic. Laptop
  publishing survives in smaller unjs packages (h3 stable, unbuild), without provenance.
- **From a laptop, use npm's staged publishing.** Stage the nine tarballs, which needs no 2FA, then
  approve them with one `pnpm stage approve` and a single 2FA. The approval also leaves the trust
  evidence pnpm ranks highest. That is what `vp run release` does.
- **Recommendation: keep the local flow.** It's built, it needs no secrets in CI, and the owner
  approves every release in person anyway. If provenance matters later, move only the staging to
  CI, on the tag, through trusted publishing, and keep the owner's approval: vitest's and nuxt's
  model. All nine packages exist on npm now, so trusted publishing's first-publish limit no longer
  applies.

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

Trusted publishing needs npm 11.5.1 or later, a cloud runner on GitHub Actions, GitLab or
CircleCI, and `id-token: write`. Provenance is automatic on GitHub and GitLab. A publisher can be
limited to staging ([docs](https://docs.npmjs.com/trusted-publishers)). The package must already
exist on npm before a publisher can be configured, so trusted publishing can't do a package's
first publish ([`npm trust`](https://docs.npmjs.com/cli/v11/commands/npm-trust): npm 11.15 or
later, one package per call).

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
- **Trust evidence.** `1.0.0-rc.1` has provenance and no approver. A later release from a laptop
  without staging would have none, so `1.0.0-rc.2` would read as a downgrade under
  `trustPolicy: no-downgrade`. A staged, approved one ranks above provenance.

## The options

| | **Local, staged** (built) | **antfu's hybrid** | **Staged from CI** |
| --- | --- | --- | --- |
| The laptop | Bumps, gates, stages, approves, pushes, writes the release | Bumps, tags, pushes | Bumps, tags, pushes, approves |
| CI | Nothing; `release-gate` on demand | Publishes on the tag, with trusted publishing | Stages on the tag, with trusted publishing |
| 2FA | One approval for all nine | None: no person in the loop | One approval for all nine |
| Provenance | No | Yes | Yes, with an approver |
| pnpm's trust rank | Highest (approver) | Below an approved staged publish: after one, a downgrade | Highest |
| What ships | The tarballs the local gate checked, by hash | What CI builds on the tag: a second build, gated again in CI | What CI builds, then approved |
| Secrets | None in CI | A trusted publisher per package, no token | A trusted publisher per package, limited to staging |
| Firefox (#182) | Waits for CI's Firefox job on macOS 27 | CI runs it | CI runs it |

**Recommendation.** Keep the local flow, which is built. It needs nothing in the repository's
settings, the owner sees every release through, and what ships is byte for byte what the gate
checked. The one thing it lacks is provenance. If that matters, adopt the third column: release
on the tag from a CI job that stages with trusted publishing, and keep `vp run release` for the
bump, the gate, the tag and the approval. Plain trusted publishing (the middle column) would now
be a trust downgrade, since an approved release ranks above it, and it removes the owner's
approval.
