import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { describe, expect, test } from "vite-plus/test";

import { deterministicEnvironment } from "../src/fixture.js";
import { runHydrationScenario } from "../src/hydration-harness.js";

const execFileAsync = promisify(execFile);

async function runExpectedFailure(fixture: "browser-global" | "hydration"): Promise<string> {
  try {
    await execFileAsync("vp", ["test", "tests/fixtures/known-bad-runner.test.ts", "--run"], {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, SSR_KNOWN_BAD: fixture },
    });
  } catch (error) {
    const output = error as { stderr?: string; stdout?: string };
    return `${output.stdout ?? ""}\n${output.stderr ?? ""}`;
  }
  throw new Error(`Known-bad fixture unexpectedly passed: ${fixture}`);
}

describe("SSR fixture", () => {
  test("renders, hydrates, interacts, and unmounts with explicit deterministic inputs", async () => {
    const report = await runHydrationScenario({
      serverEnvironment: deterministicEnvironment,
      clientEnvironment: deterministicEnvironment,
      interact: true,
    });

    expect(report.recoverableErrors).toEqual([]);
    expect(report.hydratedWithoutMutation).toBe(true);
    expect(report.interactionCount).toBe(1);
    expect(report.unmounted).toBe(true);
    expect(report.environment).toMatchObject({
      locale: "en-GB",
      timeZone: "Asia/Tbilisi",
      weekStartsOn: 1,
      now: "2026-08-15T08:30:00Z",
    });
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
    expect(globalThis.IS_REACT_ACT_ENVIRONMENT).toBeUndefined();
    console.log(`SSR_SMOKE ${JSON.stringify(report)}`);
  });

  test("known-bad server/client divergence fails for React's hydration reason", async () => {
    const output = await runExpectedFailure("hydration");

    expect(output).toContain("KNOWN_BAD_HYDRATION");
    expect(output).toContain("Hydration failed");
  });

  test("known-bad module-scope browser access fails during a server import", async () => {
    const output = await runExpectedFailure("browser-global");

    expect(output).toContain("window is not defined");
  });
});
