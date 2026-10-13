import { describe, expect, test } from "vite-plus/test";

import { checkArtifacts, consumers, outcome, summary } from "../src/artifacts";

describe("the release artifacts' consumers", () => {
  test("the SSR fixture, the docs site and the registry's clean apps use the artifacts", () => {
    expect(consumers.map(({ name }) => name)).toEqual(["ssr-fixture", "showcase", "registry"]);
  });

  test("an unknown consumer is an error, before anything runs", async () => {
    await expect(checkArtifacts({ only: ["docs"] })).rejects.toThrow(
      "Unknown consumer docs. Choose from ssr-fixture, showcase, registry.",
    );
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
