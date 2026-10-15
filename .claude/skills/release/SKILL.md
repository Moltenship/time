---
name: release
description: Release the nine @moltenship packages with `vp run release`, which runs the release workflow in CI through npm trusted publishing, then rewrite the GitHub release's generated notes into polished ones. Only the owner starts it, with /release [version] [--dry-run].
disable-model-invocation: true
argument-hint: "[version] [--dry-run]"
---

# Release

The owner asked for a release: `/release $ARGUMENTS`. That is the whole approval: the owner wants
no question, prompt or confirmation from here on. You run `vp run release`, which starts the
release workflow in CI and watches it (`docs/internal/releasing.md`), and then you write the
release notes people read. Never start a release, or this skill, on your own, and never publish,
push, tag or start the release workflow by other means: only the command does that.

Run everything from the repository root, in the owner's checkout of `main`.

## 1. Before the command

`git status` must be clean, on `main`, with `git pull --ff-only` done; then `vp install`. If the
checkout has changes or another branch, stop and tell the owner: they're the owner's work. `gh`
must be logged in (`gh auth status`). Nothing else: the laptop needs no npm login.

## 2. The release

Run, in the background, allowing it an hour (the Bash tool's `timeout: 3600000`):

```sh
vp run release $ARGUMENTS
```

Without a version, it takes the one the commits since the last tag suggest and says which. It
checks the checkout and CI (waiting while CI runs), starts the release workflow on `main`, watches
it with `gh run watch`, and reports. The workflow takes about 15 minutes: its check, the release
gate on a fresh runner, the publish through npm trusted publishing, the push and the GitHub
release, then an install from npm. Tell the owner the run's link when it prints `Started:`, and
wait for the command to end.

- **It says `Released <version>`:** go on to step 3.
- **A dry run** (`--dry-run` in `$ARGUMENTS`) ends with `The dry run of <version> passed` and what
  a release would stop at. Report that, with the run's link, and stop: nothing was published.
- **It failed:** report what it printed, the failed jobs and their logs' end, and what it says to
  do. A missing trusted publisher on npm needs the owner's one-time setup
  (`docs/internal/releasing.md`, "One-time setup"): say so and stop. A gate failure needs a fix on
  `main` through a PR. Once it's fixed, running `vp run release <version>` again picks up: it
  starts a new run, or, after the publish started, runs the failed jobs of the last one again.
  Don't run git, npm or gh commands to finish a release by hand.

## 3. Polished notes

The generated notes (the GitHub release's body) list the `feat`, `fix` and `perf` commits since
the last tag, by scope, with links. Rewrite them into the release notes people read, following
[`notes-template.md`](./notes-template.md):

1. Read what went in: `git fetch --tags`, then
   `git log <previous tag>..v<version> --format='%H%n%s%n%b%n---'`, where
   `git describe --tags --abbrev=0 v<version>^` names the previous tag, and each PR the commits
   link: `gh pr view <number> --json title,body,author`. Squash commits carry the PR's
   description, and a `BREAKING CHANGE:` footer says how to migrate.
2. Write the notes in a file outside the repository, as the template says: what the release is,
   highlights in user terms, breaking changes with their migration, then the rest by package, and
   contributors.
3. Contributors: every commit's author on GitHub,
   `gh api repos/{owner}/{repo}/compare/<previous tag>...v<version> --jq '[.commits[].author.login] | unique'`,
   as `@login`, and the `Co-authored-by:` names of the commit messages.
4. Publish them: `gh release edit v<version> --notes-file <file>`, and give the owner the release's
   URL. They can ask for changes; edit again the same way.

Write as `AGENTS.md` and the docs do: plain, specific, the API names in code, no hype. A release
note says what changed for someone using the packages, not how the code changed.

## After the release

Tell the owner what shipped, with the release URL. Nothing else to do: `docs/internal/releasing.md`
covers rollbacks.
