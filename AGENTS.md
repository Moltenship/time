<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

# Quality gate

Check locally; don't wait on CI to learn whether a change passes. There are three tiers.

| Tier  | Command              | What it runs                                                                                                                                                         |
| ----- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quick | `vp run ready:quick` | The docs site's link check, which compiles every page, then `vp check` and `vp test`                                                                                |
| PR    | `vp run ready`       | Quick, plus production builds, the release checks (size budgets, API reports, package exports), the React, SSR, registry and package-graph gates, and the a11y suite in Chromium. CI runs the same tasks on every PR: `ready:checks` and `a11y`. |
| Full  | `vp run ready:full`  | Everything in PR, plus the a11y suite at CI's speed (`a11y:ci-speed`) and in WebKit (`browsers`; Firefox is off until #263), the release dry run (a fresh build, the packed tarballs installed from the pnpm store into a clean project, the registry built for that version), the docs site's types and search, and the dry run's tarballs in use (`release:artifacts`): the SSR fixture's tests and the docs site's build in copies outside the workspace, and `shadcn add` into clean Vite and Next.js apps, which needs the network. It's the release gate. |

When each tier runs:

- **Quick, after every change.** A change to docs content (MDX), READMEs, ADRs or
  `docs/internal` notes alone may merge on it.
- **PR, before every other merge**, whatever the change touches. The local `vp run ready` is the
  merge gate: once it's green, merge without waiting for the GitHub Actions run. CI runs the same
  tasks as a backstop. If CI goes red on `main`, fix it right away. CI red with local green is a
  gate bug: fix the local gate until it reproduces the failure.
- **Full, for releases only:** the release workflow runs it on the release commit before it
  publishes. A PR doesn't run it, with one exception: a PR that changes the full gate itself or the
  release tooling runs it once, to show the gate still works, and links a green run of CI's
  on-demand `release-gate` job on a fresh runner. A PR that changes the
  release tooling also links a green dry run of the release workflow (`vp run release --dry-run`
  from its branch).

On a recent laptop, quick takes about 15 seconds, PR about 40 and full about 120 from a cold cache.
Steps run in parallel where they're independent. Steps that write or read generated files
(`dist`, `.next`, `.source`, packed tarballs) run one after another in a `gate:serial` lane. The
full gate's browser runs (`a11y`, `browsers`, `a11y:ci-speed`) run one after another in a
`gate:browsers` lane beside it, each on half the cores, and the unit tests take half the cores too.
A browser run that stops making progress fails: a watchdog names the files and tests still running
when no test finishes for two minutes, or the run passes ten. Vite Task caches each step, so a rerun
only redoes what changed; `a11y:ci-speed` never replays, since a timing race can pass once by luck.
When a tier fails, `vp run --last-details` names the step; rerun it alone with `vp run <step>`.

The browser runs need Playwright's browsers once: `vp exec --filter a11y playwright install chromium
firefox webkit` (add `--with-deps` on Linux). `browsers` runs WebKit alone until #263 brings Firefox
back. CI runs it on demand: `gh workflow run ci.yml --ref <branch>`.

A new check joins a tier in `vite.config.ts`: `ready:checks` or `gate:serial` for the PR tier,
`ready:full` or `gate:serial:full` for the full gate only. Put it in a `gate:serial` lane if it
writes or reads generated files, and a new browser run in `gate:browsers`. A full-gate-only check
also joins `release:gate`: a serial step in its `gate:serial:release` lane, any other in its
command.
`tests/quality-gates.test.ts` fails if the full gate misses a PR step, or the release gate a full
one.

The release workflow runs the whole full tier on the release commit on a fresh runner, with a
strict dry run of the version it publishes and its two lanes one after the other:
`RELEASE_VERSION=<version> vp run release:gate`, the one command that reproduces it. To rehearse
the gate on a fresh runner, dispatch CI (`gh workflow run ci.yml --ref <branch>`): its
`release-gate` job runs the same steps (`docs/internal/releasing.md`).

# Releasing

The owner releases with one command, `vp run release [<version>] [--dry-run]`, or with the
`/release` skill in Claude Code (`.claude/skills/release/SKILL.md`), which runs it and then
rewrites the generated release notes. Asking for a release is the approval: nothing asks anyone to
confirm. The command starts the release workflow (`.github/workflows/release.yml`) on `main` and
watches it; the workflow gates the release commit, publishes through npm trusted publishing, pushes
and writes the GitHub release. Only the owner can start the skill. Agents never publish, push tags,
create GitHub releases, start the release workflow or run `vp run release` on their own, though
`vp run release --dry-run` from a PR's branch is safe: it publishes, pushes and releases nothing.
The runbook is `docs/internal/releasing.md`.

The release notes start from the Conventional Commits since the last tag: `feat`, `fix` and `perf`
PR titles become their lines, and `!` and `BREAKING CHANGE:` their breaking changes. So write PR
titles for the packages' users. There's no changelog line to add in a PR.

# Commits

Every commit message and every PR title is `<type>(<scope>)!: <summary>`, per [Conventional Commits](https://www.conventionalcommits.org). The rule applies from now on; don't rewrite history.

- **Squash merges:** the PR's title becomes the commit on `main`, so the title follows the format too. The merge keeps GitHub's ` (#N)` suffix.
- **Types:** `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `revert`, `style`. `refactor` changes no behaviour and `perf` only speed or memory; `build` is dependencies, bundling and the `vite.config.ts` tasks, `ci` the workflows; `style` is formatting alone; `revert` repeats the reverted title; `chore` is the rest.
- **Scopes:** optional. Packages by short name: `calendar` (`@moltenship/calendar`), `core`, `temporal`, `recurrence`, `react`, `dnd`, `dnd-kit`, `testing` (`@moltenship/calendar-*`) and `ics`. Areas: `registry` (`registry/`, `tools/registry`), `demo` (`apps/demo`), `docs-site` (`apps/showcase`), `ssr-fixture`, `a11y` (`tools/a11y`), `release` (`tools/release`, `release.yml`, `.claude/skills/release`) and `gate` (the quality gate's tasks). Leave the scope out when a change spans many areas.
- **Summary:** imperative mood, lowercase start, no trailing period, about 72 characters at most. Issue references go in the body (`Closes #N`), not in the summary.
- **Breaking changes:** `!` after the type or scope, plus a `BREAKING CHANGE:` footer that explains the migration; on a squash merge, put it in the merge's body. After 1.0 this is how a break in the public API is marked.
- **Examples:**
  - `feat(react): add onEventChangeResult and useCalendarPendingChanges`
  - `perf(recurrence): key occurrences once`
  - `fix: start no drags, grabs or resize handles on read-only roots`
  - `docs: move the docs site to time.molten.sh`

# Pull requests

## Code review

- Non-trivial PRs get a review from Claude Opus 5.5 (xhigh). Simple ones skip it: docs or notes only, mechanical changes, or small fixes their tests cover.
- One reviewer per PR, for every round: spawn it once, then continue the same agent (SendMessage) with what you changed and the new commit, instead of spawning a fresh one.
- Start a new reviewer only if the old one can't be continued (its context ran out, or it's gone), and give it the earlier rounds' findings and your replies.
- Merge once the local gate passes and the review, if there was one, has no open blocker or should-fix findings. Details: `IMPLEMENTATION_PLAN.md`, "How we work".

## Screenshots

PRs that change what users see carry screenshots in the PR description.

- **Attach them with the GitHub CLI only**: `gh pr create --attach` or `gh pr edit --attach` (gh 2.101+). Reference each file in the body as `![alt](./file.png)`, and gh rewrites the reference to the uploaded asset. Don't commit screenshots to the repo or push them to asset branches such as `pr-assets/*`. Save them outside the repository so they never get committed.
- Take them in a real browser, from the demo or the docs, not from mocks.
- **UI fixes** (bug fixes, restyles, changed behaviour): a before/after table.

  | | Before | After |
  | --- | --- | --- |
  | Week view, dark | ![Week view before, dark](./before-week-dark.png) | ![Week view after, dark](./after-week-dark.png) |

- **New UI** (new features, views or parts): a light/dark table, or simply screenshots of the demo UI.

  | | Light | Dark |
  | --- | --- | --- |
  | Year view | ![Year view, light](./year-light.png) | ![Year view, dark](./year-dark.png) |

- PRs without visible UI changes need no screenshots.
- Example of the table layout: https://github.com/Moltenship/time/pull/125

```bash
# body.md holds the table and references ./before-week-dark.png and ./after-week-dark.png
gh pr create --title "…" --body-file body.md \
  --attach './before-week-dark.png#Week view before, dark' \
  --attach './after-week-dark.png#Week view after, dark'

# Add or replace screenshots on an open PR
gh pr edit 123 --body-file body.md --attach ./before.png --attach ./after.png
```
