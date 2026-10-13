import { describe, expect, test } from "vite-plus/test";

import {
  checkArtifacts,
  concurrency,
  consumers,
  outcome,
  servedProblems,
  summary,
} from "../src/artifacts";

describe("the release artifacts' consumers", () => {
  test("the SSR fixture, the docs site and the registry's clean apps use the artifacts", () => {
    expect(consumers.map(({ name }) => name)).toEqual(["ssr-fixture", "showcase", "registry"]);
  });

  test("an unknown consumer is an error, before anything runs", async () => {
    await expect(checkArtifacts({ only: ["docs"] })).rejects.toThrow(
      "Unknown consumer docs. Choose from ssr-fixture, showcase, registry.",
    );
  });

  test("the registry's install test must serve exactly the dry run's tarballs", () => {
    const packed = [
      {
        name: "@moltenship/calendar",
        file: "moltenship-calendar-1.0.0.tgz",
        integrity: "sha512-a",
      },
      { name: "@moltenship/ics", file: "moltenship-ics-1.0.0.tgz", integrity: "sha512-b" },
    ];

    expect(
      servedProblems({ "@moltenship/calendar": "sha512-a", "@moltenship/ics": "sha512-b" }, packed),
    ).toEqual([]);
    expect(
      servedProblems(
        {
          "@moltenship/calendar": "sha512-packed-again",
          "@moltenship/calendar-testing": "sha512-c",
        },
        packed,
      ),
    ).toEqual([
      "it served @moltenship/calendar with sha512-packed-again, not the dry run's sha512-a",
      "it didn't serve @moltenship/ics",
      "it served @moltenship/calendar-testing, which the dry run didn't pack",
    ]);
    expect(servedProblems(undefined, packed)).toEqual([
      "the install test didn't report the tarballs it served",
    ]);
  });

  test("one consumer at a time per four cores, and at least one", () => {
    expect([2, 4, 8, 15, 16].map((cores) => concurrency(cores))).toEqual([1, 1, 2, 3, 4]);
  });

  test("a step's outcome is the tests that passed, the pages built, or the last line", () => {
    expect(outcome(" Test Files  16 passed (16)\n      Tests  193 passed (193)\n")).toBe(
      "tests: 193 passed (193)",
    );
    expect(outcome("✓ Generating static pages using 9 workers (47/47) in 841ms\n")).toBe(
      "47 pages generated",
    );
    expect(outcome("Starting…\nVerified every docs route.\n\n")).toBe("Verified every docs route.");
    expect(outcome("\n")).toBeUndefined();
  });

  test("the summary names each consumer, its time and its steps, and where one failed", () => {
    expect(
      summary([
        {
          name: "ssr-fixture",
          seconds: 4,
          steps: [
            { name: "install", seconds: 0.8, passed: true },
            { name: "render and hydrate", seconds: 2.7, passed: true },
          ],
        },
        {
          name: "showcase",
          seconds: 12.3,
          steps: [
            { name: "install", seconds: 1.6, passed: true },
            { name: "build", seconds: 10.2, passed: false },
          ],
          failure: 'showcase failed at "build": next build exited with 1',
        },
      ]),
    ).toBe(
      [
        "✓ ssr-fixture   4.0s  install 0.8s · render and hydrate 2.7s",
        "✗ showcase     12.3s  install 1.6s · build failed after 10.2s",
      ].join("\n"),
    );
  });
});
