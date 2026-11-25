import { gte, valid } from "semver";

import { distTag } from "./manifest";
import type { RunResult } from "./workspace";

/**
 * After a stable release, `next` still names the last pre-release, so an `@next` command in
 * someone's notes would install that and not the release. So a stable release also points `next`
 * at itself, on every package where `next` names an older version.
 *
 * `npm publish` sets one tag, so this is `npm dist-tag add`, which the publish job runs through
 * npm trusted publishing, as it publishes: no token. npm allows that from 11.21.0, and only for a
 * trusted publisher with "Allow npm dist-tag" on, which is off unless the owner turns it on
 * (docs/internal/releasing.md). Where npm is older or refuses, nothing fails: the release is
 * out, and what is left is one command for the owner, which the run reports.
 */

/** How a run names a step it leaves to the owner. `vp run release` prints these at its end. */
export const leftToDo = "Left to do by hand:";
/** The same step, as a dry run names it, among what a release would do. */
export const wouldLeave = "A release would leave a step to do by hand:";

/** The first npm that changes a dist-tag through trusted publishing (docs.npmjs.com/trusted-publishers). */
export const distTagNpm = "11.21.0";

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
  /** Runs `npm dist-tag add <name>@<version> next`, with the job's OIDC identity. */
  readonly add: (name: string, version: string) => Promise<RunResult>;
  readonly sleep: (milliseconds: number) => Promise<unknown>;
  readonly log: (line: string) => void;
}

/** How often to ask npm again for a tag it refused, and how long to wait in between. */
export const nextTagTries = { count: 3, pause: 10_000 };

/**
 * Points `next` at a stable `version` on the packages that need it. It returns the step that is
 * left for the owner when npm can't or won't do it here, and undefined when nothing is left. It
 * never throws for npm's refusal: the packages are published by now. A pre-release needs nothing,
 * since it went out under `next`. With `dryRun` it changes nothing and says what a release would do.
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

  const current = new Map<string, string | undefined>();
  for (const name of names) current.set(name, await context.tagged(name));
  const moves = nextTagMoves(version, current);
  if (moves.length === 0) {
    log(`next names ${version} or a later version on every package: nothing to move.`);
    return undefined;
  }
  const byHand = (why: string, left: readonly string[]) =>
    `${why} Until next moves, @next installs the last pre-release. Logged in to npm, run: ${nextTagCommand(left, version)}`;

  if (!gte(context.npm, distTagNpm)) {
    return byHand(
      `npm ${context.npm} can't move a dist-tag through trusted publishing, which needs ${distTagNpm}, so next stays where it is on ${moves.length} packages.`,
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

  const refused: string[] = [];
  let detail = "";
  for (const name of moves) {
    let result: RunResult | undefined;
    // npm may not know the version it took a moment ago.
    for (let attempt = 1; attempt <= nextTagTries.count; attempt += 1) {
      if (attempt > 1) await context.sleep(nextTagTries.pause);
      try {
        result = await context.add(name, version);
      } catch (error) {
        result = {
          code: 1,
          stderr: error instanceof Error ? error.message : String(error),
          stdout: "",
        };
      }
      if (result.code === 0) break;
    }
    if (result?.code === 0) log(`next names ${name}@${version}.`);
    else {
      refused.push(name);
      detail ||= lastLine(`${result?.stdout ?? ""}\n${result?.stderr ?? ""}`);
    }
  }
  if (refused.length === 0) {
    log(`Pointed next at ${version} on ${moves.length} packages.`);
    return undefined;
  }
  return byHand(
    `npm didn't move next to ${version} on ${refused.length} of ${moves.length} packages${detail ? ` (${detail})` : ""}: their trusted publisher may not allow npm dist-tag (docs/internal/releasing.md).`,
    refused,
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
