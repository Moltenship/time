import { gte, satisfies, valid } from "semver";

import { distTag } from "./manifest";
import type { RunResult } from "./workspace";

/**
 * After a stable release, `next` still names the last pre-release, so an `@next` command in
 * someone's notes would install that and not the release. So a stable release also points `next`
 * at itself, on every package where `next` names an older version.
 *
 * `npm publish` sets one tag, so this is `npm dist-tag add`, which a step of the publish job runs
 * through npm trusted publishing, as it publishes: no token. npm allows that from 11.21.0, and
 * only for a trusted publisher with "Allow npm dist-tag" on, which is off unless the owner turns
 * it on (docs/internal/releasing.md). Where npm is older, refuses or stops answering, nothing
 * fails: the release is out, and what is left is one command for the owner, which the run reports.
 * The whole move has a few minutes (`nextTagLimits`), well inside its step's and its job's.
 */

/** How a run names a step it leaves to the owner. `vp run release` prints these at its end. */
export const leftToDo = "Left to do by hand:";
/** The same step, as a dry run names it, among what a release would do. */
export const wouldLeave = "A release would leave a step to do by hand:";

/** The first npm that changes a dist-tag through trusted publishing (docs.npmjs.com/trusted-publishers). */
export const distTagNpm = "11.21.0";
/** Every npm that does: npm 12 learned it in 12.2.0. */
export const distTagNpmRange = `>=${distTagNpm} <12.0.0 || >=12.2.0`;

/**
 * The packages whose `next` a stable `version` takes: those where it names an older version, or
 * nothing. A newer pre-release keeps it, such as `2.1.0-beta.1` when `2.0.1` comes out.
 */
export function nextTagMoves(
  version: string,
  current: ReadonlyMap<string, string | undefined>,
): string[] {
  return [...current]
    .filter(([, tagged]) => tagged === undefined || valid(tagged) === null || !gte(tagged, version))
    .map(([name]) => name);
}

/** The command that points `next` at `version` by hand, for someone logged in to npm. */
export function nextTagCommand(names: readonly string[], version: string): string {
  return `for name in ${names.join(" ")}; do npm dist-tag add "$name@${version}" next; done`;
}

export interface NextTagContext {
  /** The runner's npm version. */
  readonly npm: string;
  /** The version a package's `next` names on npm, or undefined when it has none. */
  readonly tagged: (name: string) => Promise<string | undefined>;
  /**
   * Runs `npm dist-tag add <name>@<version> next`, with the job's OIDC identity. It rejects when
   * npm hasn't answered after `timeout` milliseconds, or can't run.
   */
  readonly add: (name: string, version: string, timeout: number) => Promise<RunResult>;
  readonly sleep: (milliseconds: number) => Promise<unknown>;
  readonly log: (line: string) => void;
  /** A clock, in milliseconds. */
  readonly now: () => number;
}

/**
 * How long the move may take: all of it, one call to npm, and how often and how soon it asks again
 * for a version npm doesn't know yet. The step that runs it has five minutes
 * (.github/workflows/release.yml), so `total` and one look at npm's tags stay under that.
 */
export const nextTagLimits = { total: 180_000, call: 45_000, tries: 3, pause: 10_000 };

/**
 * Whether npm's answer may change in a moment: it took the version seconds ago and may not know
 * it yet. A refusal of the job's identity (E403, a login npm asks for) is final, and so is a
 * package without a trusted publisher.
 */
function mayKnowSoon(output: string): boolean {
  return (
    /\bE404\b|\bETARGET\b|version not found|no such version/iu.test(output) &&
    !/OIDC|trusted publish/iu.test(output)
  );
}

/**
 * Points `next` at a stable `version` on the packages that need it. It returns the step that is
 * left for the owner when npm can't or won't do it here, and undefined when nothing is left. It
 * never throws for npm's refusal: the packages are published by now. A pre-release needs nothing,
 * since it went out under `next`. With `dryRun` it changes nothing and says what a release would do.
 *
 * It asks each package once, and again only for a version npm may not know yet. A call npm doesn't
 * answer ends the move, and so does the end of its time: the packages after that are left too,
 * since each would wait as long.
 */
export async function pointNext(
  options: {
    readonly version: string;
    readonly names: readonly string[];
    readonly dryRun: boolean;
  },
  context: NextTagContext,
): Promise<string | undefined> {
  const { version, names, dryRun } = options;
  const { log } = context;
  if (distTag(version) === "next") return undefined;

  // All at once, so the look takes one request's time.
  const tags = await Promise.all(names.map((name) => context.tagged(name)));
  const moves = nextTagMoves(version, new Map(names.map((name, index) => [name, tags[index]])));
  if (moves.length === 0) {
    log(`next names ${version} or a later version on every package: nothing to move.`);
    return undefined;
  }
  const byHand = (why: string, left: readonly string[]) =>
    `${why} Until next moves, @next installs the last pre-release. Logged in to npm, run: ${nextTagCommand(left, version)}`;

  if (!satisfies(context.npm, distTagNpmRange)) {
    return byHand(
      `npm ${context.npm} can't move a dist-tag through trusted publishing, which needs ${distTagNpm}, or 12.2.0 of npm 12, so next stays where it is on ${moves.length} packages.`,
      moves,
    );
  }
  if (dryRun) {
    log(
      `A release would point next at ${version} on ${moves.length} packages, with npm ${context.npm} through trusted publishing: ${moves.join(", ")}.`,
    );
    log(
      'npm takes that only from a trusted publisher with "Allow npm dist-tag" on. Where it refuses, the release says so and prints the command to run by hand.',
    );
    return undefined;
  }

  const stopAt = context.now() + nextTagLimits.total;
  /** Moves one package's tag: undefined when it moved, or why it didn't, and whether to go on. */
  const move = async (
    name: string,
  ): Promise<{ readonly why: string; readonly stop: boolean } | undefined> => {
    for (let attempt = 1; ; attempt += 1) {
      const remaining = stopAt - context.now();
      if (remaining <= 0) {
        return { stop: true, why: `the move's ${nextTagLimits.total / 60_000} minutes ran out` };
      }
      let result: RunResult;
      try {
        result = await context.add(name, version, Math.min(nextTagLimits.call, remaining));
      } catch (error) {
        // Cut off, or npm didn't start: asking again would wait as long.
        return { stop: true, why: messageOf(error) };
      }
      if (result.code === 0) return undefined;
      const output = `${result.stdout}\n${result.stderr}`;
      const again =
        attempt < nextTagLimits.tries &&
        mayKnowSoon(output) &&
        stopAt - context.now() > nextTagLimits.pause;
      if (!again) return { stop: false, why: lastLine(output) };
      await context.sleep(nextTagLimits.pause);
    }
  };

  const left: string[] = [];
  let detail = "";
  let stopped = false;
  for (const [index, name] of moves.entries()) {
    const failure = await move(name);
    if (failure === undefined) {
      log(`next names ${name}@${version}.`);
      continue;
    }
    detail ||= failure.why;
    if (failure.stop) {
      // The first that stopped it explains it, whatever a package before it was refused for.
      detail = failure.why;
      stopped = true;
      left.push(...moves.slice(index));
      break;
    }
    left.push(name);
  }
  if (left.length === 0) {
    log(`Pointed next at ${version} on ${moves.length} packages.`);
    return undefined;
  }
  return byHand(
    `npm didn't move next to ${version} on ${left.length} of ${moves.length} packages${detail ? ` (${detail})` : ""}: ${
      stopped
        ? "npm stopped answering, so the move ended there."
        : "their trusted publisher may not allow npm dist-tag (docs/internal/releasing.md)."
    }`,
    left,
  );
}

/** The last line of a command's output that says something, where npm puts its error. */
function lastLine(output: string): string {
  return (
    output
      .split("\n")
      .map((line) => line.trim())
      .findLast((line) => line !== "" && !line.startsWith("npm error A complete log")) ?? ""
  );
}

/** What an error says. An abort is a DOMException, which isn't an Error in every realm. */
function messageOf(error: unknown): string {
  const message = (error as { readonly message?: unknown } | null)?.message;
  return typeof message === "string" && message !== "" ? message : String(error);
}
