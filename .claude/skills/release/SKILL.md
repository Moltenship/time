---
name: release
description: Release the nine @moltenship packages with `vp run release`, getting the owner through npm's 2FA, then rewrite the GitHub release's generated notes into polished ones. Only the owner starts it, with /release [version] [--dry-run].
disable-model-invocation: true
argument-hint: "[version] [--dry-run]"
---

# Release

The owner asked for a release: `/release $ARGUMENTS`. You drive `vp run release`, which does the
whole release from this laptop (`docs/internal/releasing.md`), and then you write the release
notes people read. Never start a release, or this skill, on your own, and never publish, push or
tag by other means: only the command does that.

Run everything from the repository root, in the owner's checkout of `main`.

## 1. Before the command

1. `git status` must be clean, on `main`, with `git pull --ff-only` done; then `vp install`. If
   the checkout has changes or another branch, stop and ask the owner what to do with them.
2. `vp exec pnpm whoami` must print the owner's npm user. If it fails, the owner logs in:
   run `.claude/skills/release/terminal.sh vp exec pnpm login` in the background, show the owner
   the URL it prints, and wait for it to finish once they've logged in in the browser. If it asks
   for anything else, ask the owner to run `vp exec pnpm login` in their own terminal instead.
3. `gh auth status` must pass. If it doesn't, ask the owner to run `gh auth login`.

## 2. The version

If `$ARGUMENTS` has a version, use it. Otherwise run `vp run release` without one: without a
terminal it changes nothing and fails with `Suggested: <version> (<reason>)`. Ask the owner, with
AskUserQuestion, which version: the suggestion first, marked recommended, and the alternatives it
lists. A prerelease such as `1.0.0-rc.2` goes to npm's `next` tag and stays off `latest`.

## 3. A dry run, when asked

With `--dry-run` in `$ARGUMENTS`, run `vp run release <version> --dry-run` (about 4 minutes; give
it a 10-minute timeout) and report its last lines: what a release would have stopped at, and the
generated notes in `.release/notes.md`. It bumps, gates, tags and writes the notes, then undoes the
commit and tag; it publishes, pushes and releases nothing. Stop there.

## 4. The release

Start it in the background, in a terminal, so pnpm can ask for npm's 2FA:

```sh
mkdir -p .release && .claude/skills/release/terminal.sh vp run release <version> --yes > .release/release.log 2>&1
```

`--yes` skips the prompt that asks to type the version, since you can't type into it. The command
takes 5 to 10 minutes: the checks, the release gate (about 3 minutes), CI's Firefox job when it
has to start one (macOS 27 can't run Firefox, #182), then publishing.

Watch `.release/release.log` until the command ends (a Monitor on its last lines, or a check
every minute). While it runs:

- **npm's 2FA.** Publishing stages the nine tarballs, which needs no 2FA, then approves them all
  at once, which does. When the log shows `Authenticate your account at:` and an npmjs.com URL,
  tell the owner right away: open the URL, sign in if asked, and approve with their passkey or
  security key. If npm asks again, relay each new URL the same way. pnpm waits a few minutes for
  an approval, then fails with `ERR_PNPM_WEBAUTH_TIMEOUT`; run the command again.
- **A one-time password instead.** If the log asks for an OTP, ask the owner for it, then stop the
  run and start it again with `PNPM_CONFIG_OTP=<code>` in front of `vp run release`: a rerun picks
  up the staged packages.
- **It failed.** Read the error. Before publishing, the command has put the checkout back as it
  was: fix what it names (a login, red CI, a gate failure, which needs a PR on `main`) and run it
  again. After publishing started, run the same command again: it picks up where it stopped. Don't
  improvise git, npm or gh commands to finish a release by hand; tell the owner what's wrong.

It ends with `Released <version>.` By then npm serves all nine packages with the gate's tarballs,
`main` and `v<version>` are pushed, the GitHub release has the generated notes, and the release
installed from npm into clean Vite and Next.js apps.

## 5. Polished notes

The generated notes (`.release/notes.md`, and the GitHub release's body) list the `feat`, `fix`
and `perf` commits since the last tag, by scope, with links. Rewrite them into the release notes
people read, following [`notes-template.md`](./notes-template.md):

1. Read what went in: `git log <previous tag>..v<version> --format='%H%n%s%n%b%n---'`, where
   `git describe --tags --abbrev=0 v<version>^` names the previous tag, and each PR the commits
   link: `gh pr view <number> --json title,body,author`. Squash commits carry the PR's description,
   and a `BREAKING CHANGE:` footer says how to migrate.
2. Write the notes in `.release/notes-polished.md`, as the template says: what the release is,
   highlights in user terms, breaking changes with their migration, then the rest by package, and
   contributors.
3. Contributors: every commit's author on GitHub,
   `gh api repos/{owner}/{repo}/compare/<previous tag>...v<version> --jq '[.commits[].author.login] | unique'`,
   as `@login`, and the `Co-authored-by:` names of the commit messages.
4. Publish them: `gh release edit v<version> --notes-file .release/notes-polished.md`, and give the
   owner the release's URL. They can ask for changes; edit again the same way.

Write as `AGENTS.md` and the docs do: plain, specific, the API names in code, no hype. A release
note says what changed for someone using the packages, not how the code changed.

## After the release

Tell the owner what shipped, with the release URL, and anything the log noted, such as a dist-tag
a newer release has taken. Nothing else to do: `docs/internal/releasing.md` covers rollbacks.
