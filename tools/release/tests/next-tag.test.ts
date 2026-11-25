import { describe, expect, test } from "vite-plus/test";

import {
  distTagNpm,
  nextTagCommand,
  nextTagLimits,
  nextTagMoves,
  pointNext,
  type NextTagContext,
} from "../src/next-tag";
import { moveNextTag, type NextTagParts } from "../src/publish";

const names = ["@x/a", "@x/b", "@x/c"];
const moved = { code: 0, stderr: "", stdout: "" };
/** npm's answer to a job whose trusted publisher doesn't allow dist-tag. */
const refusal = {
  code: 1,
  stderr:
    "npm error code E403\nnpm error 403 Forbidden - dist-tag is not allowed for this trusted publisher\nnpm error A complete log of this run can be found in: /tmp/log",
  stdout: "",
};
/** Its answer for a version it took a moment ago and doesn't serve yet. */
const unknown = {
  code: 1,
  stderr: "npm error code E404\nnpm error 404 Not Found - PUT /-/package/@x%2fa/dist-tags/next",
  stdout: "",
};

/**
 * npm with these `next` tags, and `add` answering as scripted: the last answer repeats. "throw" is
 * a call that was cut off. Each call takes `callTime` on the clock.
 */
function npm(
  tags: Readonly<Record<string, string | undefined>>,
  options: {
    version?: string;
    answers?: readonly (typeof refusal | "throw")[];
    callTime?: number;
  } = {},
) {
  const calls: string[] = [];
  const timeouts: number[] = [];
  const lines: string[] = [];
  const answers = options.answers ?? [moved];
  let asked = 0;
  let clock = 1_000_000;
  const context: NextTagContext = {
    npm: options.version ?? distTagNpm,
    tagged: async (name) => tags[name],
    add: async (name, version, timeout) => {
      calls.push(`${name}@${version}`);
      timeouts.push(timeout);
      clock += options.callTime ?? 0;
      const answer = answers[Math.min(asked, answers.length - 1)]!;
      asked += 1;
      if (answer === "throw") throw new Error("The operation was aborted due to timeout");
      return answer;
    },
    sleep: async (milliseconds) => {
      calls.push(`sleep ${milliseconds}`);
      clock += milliseconds;
    },
    log: (line) => lines.push(line),
    now: () => clock,
  };
  return { calls, context, lines, timeouts };
}

const betas = { "@x/a": "2.0.0-beta.2", "@x/b": "2.0.0-beta.2", "@x/c": undefined };
const byHand = (left: string) =>
  `for name in ${left}; do npm dist-tag add "$name@2.0.0" next; done`;

describe("the next tag after a stable release", () => {
  test("moves from an older version or from nothing, and stays on a newer one", () => {
    expect(
      nextTagMoves(
        "2.0.1",
        new Map([
          ["@x/older", "2.0.0-beta.2"],
          ["@x/none", undefined],
          ["@x/same", "2.0.1"],
          ["@x/newer", "2.1.0-beta.1"],
          ["@x/odd", "not-a-version"],
        ]),
      ),
    ).toEqual(["@x/older", "@x/none", "@x/odd"]);
  });

  test("is one command to run by hand", () => {
    expect(nextTagCommand(["@x/a", "@x/b"], "2.0.0")).toBe(byHand("@x/a @x/b"));
  });

  test("moves on every package that needs it, through npm in the job", async () => {
    const { calls, context, lines, timeouts } = npm({ ...betas, "@x/b": "2.0.0" });

    expect(await pointNext({ version: "2.0.0", names, dryRun: false }, context)).toBeUndefined();
    expect(calls).toEqual(["@x/a@2.0.0", "@x/c@2.0.0"]);
    expect(timeouts).toEqual([nextTagLimits.call, nextTagLimits.call]);
    expect(lines.at(-1)).toBe("Pointed next at 2.0.0 on 2 packages.");
  });

  test("is left alone by a pre-release, which went out under it", async () => {
    const { calls, context } = npm(betas);

    expect(
      await pointNext({ version: "2.0.0-beta.3", names, dryRun: false }, context),
    ).toBeUndefined();
    expect(calls).toEqual([]);
  });

  test("needs nothing when it names the release already, as when the job runs again", async () => {
    const { calls, context, lines } = npm({ "@x/a": "2.0.0", "@x/b": "2.0.0", "@x/c": "2.0.0" });

    expect(await pointNext({ version: "2.0.0", names, dryRun: false }, context)).toBeUndefined();
    expect(calls).toEqual([]);
    expect(lines).toEqual([
      "next names 2.0.0 or a later version on every package: nothing to move.",
    ]);
  });

  test("asks again when npm doesn't know the new version yet", async () => {
    const { calls, context } = npm({ "@x/a": "2.0.0-beta.2" }, { answers: [unknown, moved] });

    expect(
      await pointNext({ version: "2.0.0", names: ["@x/a"], dryRun: false }, context),
    ).toBeUndefined();
    expect(calls).toEqual(["@x/a@2.0.0", `sleep ${nextTagLimits.pause}`, "@x/a@2.0.0"]);
  });

  test("gives up on a version npm still doesn't know after its tries", async () => {
    const { calls, context } = npm({ "@x/a": "2.0.0-beta.2" }, { answers: [unknown] });

    const left = await pointNext({ version: "2.0.0", names: ["@x/a"], dryRun: false }, context);
    expect(left).toContain("on 1 of 1 packages (npm error 404 Not Found");
    expect(calls.filter((call) => call.startsWith("@x/"))).toHaveLength(nextTagLimits.tries);
  });

  test("asks once where npm refuses the job, and leaves the owner one command", async () => {
    const { calls, context } = npm(betas, { answers: [refusal] });

    const left = await pointNext({ version: "2.0.0", names, dryRun: false }, context);
    expect(left).toBe(
      "npm didn't move next to 2.0.0 on 3 of 3 packages (npm error 403 Forbidden - dist-tag is not allowed for this trusted publisher): their trusted publisher may not allow npm dist-tag (docs/internal/releasing.md). Until next moves, @next installs the last pre-release. Logged in to npm, run: " +
        byHand("@x/a @x/b @x/c"),
    );
    // A refusal is final: no second try, and no pause in the job that holds the OIDC token.
    expect(calls).toEqual(["@x/a@2.0.0", "@x/b@2.0.0", "@x/c@2.0.0"]);
  });

  test("doesn't ask again for a package without a trusted publisher, which also answers 404", async () => {
    const missing = {
      code: 1,
      stderr: "npm error code E404\nnpm error 404 OIDC token exchange error - package not found",
      stdout: "",
    };
    const { calls, context } = npm({ "@x/a": "2.0.0-beta.2" }, { answers: [missing] });

    await pointNext({ version: "2.0.0", names: ["@x/a"], dryRun: false }, context);
    expect(calls).toEqual(["@x/a@2.0.0"]);
  });

  test("names only the packages npm refused", async () => {
    const { context } = npm(
      { "@x/a": "2.0.0-beta.2", "@x/b": "2.0.0-beta.2" },
      { answers: [moved, refusal] },
    );

    const left = await pointNext(
      { version: "2.0.0", names: ["@x/a", "@x/b"], dryRun: false },
      context,
    );
    expect(left).toContain("on 1 of 2 packages (npm error 403 Forbidden");
    expect(left).toContain(byHand("@x/b"));
  });

  test("ends at the first call npm doesn't answer, and leaves the packages after it", async () => {
    const { calls, context } = npm(betas, { answers: [moved, "throw"] });

    const left = await pointNext({ version: "2.0.0", names, dryRun: false }, context);
    expect(left).toBe(
      "npm didn't move next to 2.0.0 on 2 of 3 packages (The operation was aborted due to timeout): npm stopped answering, so the move ended there. Until next moves, @next installs the last pre-release. Logged in to npm, run: " +
        byHand("@x/b @x/c"),
    );
    // One call was cut off. Nothing asked again, and the third package wasn't tried.
    expect(calls).toEqual(["@x/a@2.0.0", "@x/b@2.0.0"]);
  });

  test("ends when its time is up, however npm answers", async () => {
    // Every call takes 100 seconds and is refused: the third would start past three minutes.
    const { calls, context, timeouts } = npm(betas, { answers: [refusal], callTime: 100_000 });

    const left = await pointNext({ version: "2.0.0", names, dryRun: false }, context);
    expect(calls).toEqual(["@x/a@2.0.0", "@x/b@2.0.0"]);
    expect(left).toContain("on 3 of 3 packages (the move's 3 minutes ran out)");
    expect(left).toContain(byHand("@x/a @x/b @x/c"));
    // A call never gets more time than the move has left.
    expect(timeouts).toEqual([nextTagLimits.call, nextTagLimits.call]);
    expect(nextTagLimits.total).toBe(180_000);
  });

  test("gives a call what is left of the move's time, when that is less than a call's", async () => {
    const { context, timeouts } = npm(betas, { callTime: 80_000 });

    await pointNext({ version: "2.0.0", names, dryRun: false }, context);
    expect(timeouts).toEqual([nextTagLimits.call, nextTagLimits.call, 20_000]);
  });

  test("doesn't wait to ask again when the pause would use up its time", async () => {
    const { calls, context } = npm(
      { "@x/a": "2.0.0-beta.2" },
      { answers: [unknown], callTime: 175_000 },
    );

    await pointNext({ version: "2.0.0", names: ["@x/a"], dryRun: false }, context);
    expect(calls).toEqual(["@x/a@2.0.0"]);
  });

  test("is left to the owner where npm is too old to move a tag without a token", async () => {
    for (const version of ["11.20.0", "12.0.0", "12.1.3"]) {
      const { calls, context } = npm(betas, { version });

      const left = await pointNext({ version: "2.0.0", names, dryRun: false }, context);
      expect(left, version).toContain(
        `npm ${version} can't move a dist-tag through trusted publishing, which needs 11.21.0, or 12.2.0 of npm 12, so next stays where it is on 3 packages.`,
      );
      expect(left, version).toContain(`run: ${byHand("@x/a @x/b @x/c")}`);
      expect(calls).toEqual([]);
    }
    for (const version of ["11.21.0", "11.30.1", "12.2.0", "13.0.0"]) {
      const { calls, context } = npm(betas, { version });

      expect(
        await pointNext({ version: "2.0.0", names, dryRun: false }, context),
        version,
      ).toBeUndefined();
      expect(calls).toHaveLength(3);
    }
  });

  test("a dry run changes nothing and says what a release would do", async () => {
    const { calls, context, lines } = npm(betas);

    expect(await pointNext({ version: "2.0.0", names, dryRun: true }, context)).toBeUndefined();
    expect(calls).toEqual([]);
    expect(lines[0]).toBe(
      `A release would point next at 2.0.0 on 3 packages, with npm ${distTagNpm} through trusted publishing: @x/a, @x/b, @x/c.`,
    );
  });

  test("a dry run on an npm too old reports the step a release would leave", async () => {
    const { calls, context } = npm(betas, { version: "11.20.0" });

    expect(await pointNext({ version: "2.0.0", names, dryRun: true }, context)).toContain(
      "npm 11.20.0 can't move a dist-tag",
    );
    expect(calls).toEqual([]);
  });
});

describe("the publish job's step that moves it", () => {
  /** The step's parts, with npm at `version` and `run` answering as given. */
  function parts(
    run: NextTagParts["run"],
    overrides: Partial<NextTagParts> = {},
  ): { readonly parts: NextTagParts; readonly cleaned: () => boolean } {
    let cleaned = false;
    return {
      cleaned: () => cleaned,
      parts: {
        names: async () => ["@x/a", "@x/b"],
        npm: async (action) => {
          try {
            return await action({ cwd: "/npm", env: { PATH: "/bin" }, version: distTagNpm });
          } finally {
            cleaned = true;
          }
        },
        run,
        tagged: async () => "2.0.0-beta.2",
        ...overrides,
      },
    };
  }
  const quiet = { log: () => {} };

  test("runs npm dist-tag add for each package, outside the workspace and with a cut-off", async () => {
    const calls: { command: string; args: readonly string[]; cwd?: string; cut: boolean }[] = [];
    const step = parts(async (command, args, options) => {
      calls.push({
        args,
        command,
        cut: options?.signal instanceof AbortSignal,
        cwd: options?.cwd,
      });
      return moved;
    });

    expect(await moveNextTag({ version: "2.0.0", ...quiet }, step.parts)).toBeUndefined();
    expect(calls).toEqual(
      ["@x/a", "@x/b"].map((name) => ({
        args: [
          "dist-tag",
          "add",
          `${name}@2.0.0`,
          "next",
          "--registry",
          "https://registry.npmjs.org/",
        ],
        command: "npm",
        cut: true,
        cwd: "/npm",
      })),
    );
    expect(step.cleaned()).toBe(true);
  });

  test("leaves the rest to the owner when a call is cut off, and doesn't throw", async () => {
    let asked = 0;
    const step = parts(async () => {
      asked += 1;
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });

    const left = await moveNextTag({ version: "2.0.0", ...quiet }, step.parts);
    expect(left).toContain("on 2 of 2 packages (The operation was aborted due to timeout)");
    expect(left).toContain(byHand("@x/a @x/b"));
    expect(asked).toBe(1);
  });

  test("reports a step for the owner when it can't look at npm, and doesn't throw", async () => {
    const run: NextTagParts["run"] = async () => moved;
    const offline = parts(run, {
      tagged: async () => {
        throw new Error("npm answered 503 for @x/a");
      },
    });
    expect(await moveNextTag({ version: "2.0.0", ...quiet }, offline.parts)).toBe(
      `Couldn't look at the next tag (npm answered 503 for @x/a). If it names a version before 2.0.0, @next installs that. Logged in to npm, run: ${byHand("@x/a @x/b")}`,
    );

    const unread = parts(run, {
      names: async () => {
        throw new Error("ENOENT: packages");
      },
    });
    expect(await moveNextTag({ version: "2.0.0", ...quiet }, unread.parts)).toBe(
      "Couldn't look at the next tag (ENOENT: packages). If it names a version before 2.0.0, @next installs that. Logged in to npm, run: npm dist-tag add <package>@2.0.0 next, for each published package",
    );
  });

  test("moves nothing in a dry run or for a pre-release", async () => {
    let asked = 0;
    const step = parts(async () => {
      asked += 1;
      return moved;
    });

    expect(
      await moveNextTag({ version: "2.0.0", dryRun: true, ...quiet }, step.parts),
    ).toBeUndefined();
    expect(await moveNextTag({ version: "2.0.0-beta.3", ...quiet }, step.parts)).toBeUndefined();
    expect(asked).toBe(0);
  });
});
