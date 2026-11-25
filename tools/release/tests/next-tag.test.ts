import { describe, expect, test } from "vite-plus/test";

import {
  distTagNpm,
  nextTagCommand,
  nextTagMoves,
  nextTagTries,
  pointNext,
  type NextTagContext,
} from "../src/next-tag";

const names = ["@x/a", "@x/b", "@x/c"];
const refusal = {
  code: 1,
  stderr:
    "npm error code E403\nnpm error 403 Forbidden - dist-tag is not allowed for this trusted publisher\nnpm error A complete log of this run can be found in: /tmp/log",
  stdout: "",
};

/** npm with these `next` tags, and `add` answering as scripted: the last answer repeats. */
function npm(
  tags: Readonly<Record<string, string | undefined>>,
  options: { version?: string; answers?: readonly (typeof refusal | "throw")[] } = {},
) {
  const calls: string[] = [];
  const lines: string[] = [];
  const answers = options.answers ?? [{ code: 0, stderr: "", stdout: "" }];
  let asked = 0;
  const context: NextTagContext = {
    npm: options.version ?? distTagNpm,
    tagged: async (name) => tags[name],
    add: async (name, version) => {
      calls.push(`${name}@${version}`);
      const answer = answers[Math.min(asked, answers.length - 1)]!;
      asked += 1;
      if (answer === "throw") throw new Error("The operation was aborted due to timeout");
      return answer;
    },
    sleep: async (milliseconds) => {
      calls.push(`sleep ${milliseconds}`);
    },
    log: (line) => lines.push(line),
  };
  return { calls, context, lines };
}

const betas = { "@x/a": "2.0.0-beta.2", "@x/b": "2.0.0-beta.2", "@x/c": undefined };

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
    expect(nextTagCommand(["@x/a", "@x/b"], "2.0.0")).toBe(
      'for name in @x/a @x/b; do npm dist-tag add "$name@2.0.0" next; done',
    );
  });

  test("moves on every package that needs it, through npm in the job", async () => {
    const { calls, context, lines } = npm({ ...betas, "@x/b": "2.0.0" });

    expect(await pointNext({ version: "2.0.0", names, dryRun: false }, context)).toBeUndefined();
    expect(calls).toEqual(["@x/a@2.0.0", "@x/c@2.0.0"]);
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
    const { calls, context } = npm(
      { "@x/a": "2.0.0-beta.2" },
      { answers: [refusal, { code: 0, stderr: "", stdout: "" }] },
    );

    expect(
      await pointNext({ version: "2.0.0", names: ["@x/a"], dryRun: false }, context),
    ).toBeUndefined();
    expect(calls).toEqual(["@x/a@2.0.0", `sleep ${nextTagTries.pause}`, "@x/a@2.0.0"]);
  });

  test("leaves the owner one command when npm refuses, and fails nothing", async () => {
    const { calls, context } = npm(betas, { answers: [refusal] });

    const left = await pointNext({ version: "2.0.0", names, dryRun: false }, context);
    expect(left).toBe(
      "npm didn't move next to 2.0.0 on 3 of 3 packages (npm error 403 Forbidden - dist-tag is not allowed for this trusted publisher): their trusted publisher may not allow npm dist-tag (docs/internal/releasing.md). Until next moves, @next installs the last pre-release. Logged in to npm, run: " +
        'for name in @x/a @x/b @x/c; do npm dist-tag add "$name@2.0.0" next; done',
    );
    expect(calls.filter((call) => call.startsWith("@x/"))).toHaveLength(3 * nextTagTries.count);
  });

  test("names only the packages npm refused", async () => {
    const { context } = npm(
      { "@x/a": "2.0.0-beta.2", "@x/b": "2.0.0-beta.2" },
      { answers: [{ code: 0, stderr: "", stdout: "" }, "throw"] },
    );

    const left = await pointNext(
      { version: "2.0.0", names: ["@x/a", "@x/b"], dryRun: false },
      context,
    );
    expect(left).toContain("on 1 of 2 packages (The operation was aborted due to timeout)");
    expect(left).toContain('for name in @x/b; do npm dist-tag add "$name@2.0.0" next; done');
  });

  test("is left to the owner where npm is too old to move a tag without a token", async () => {
    const { calls, context } = npm(betas, { version: "11.20.0" });

    const left = await pointNext({ version: "2.0.0", names, dryRun: false }, context);
    expect(left).toMatch(
      /^npm 11\.20\.0 can't move a dist-tag through trusted publishing, which needs 11\.21\.0, so next stays where it is on 3 packages\..*run: for name in @x\/a @x\/b @x\/c; do/u,
    );
    expect(calls).toEqual([]);
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
