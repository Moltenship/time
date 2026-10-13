import { availableParallelism, release } from "node:os";

import tailwindcss from "@tailwindcss/vite";
import { configDefaults, defineConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";

import { Watchdog } from "./watchdog";

/**
 * Playwright's Firefox can't find a profile folder on macOS 27 and quits before it opens a page
 * (#182). There, `--mode browsers` runs WebKit alone.
 */
const firefoxStarts = !(process.platform === "darwin" && Number(release().split(".")[0]) >= 27);

/** Reduced motion runs in a Chromium context of its own. */
const chromiumOnly = ["tests/reduced-motion.a11y.tsx"];

export default defineConfig(({ mode }) => {
  // `vp run browsers`: the suite in Firefox and WebKit instead of Chromium.
  const otherBrowsers = mode === "browsers";
  if (otherBrowsers && !firefoxStarts) {
    console.warn("Firefox left out: Playwright's Firefox doesn't start on macOS 27 (#182).");
  }

  /**
   * Test files that run at once, each in a page of its own. Vitest gives each browser a pool of
   * up to 12 pages, which oversubscribed the machine: a browser run shares it with the gate's build
   * and unit-test lane. So a run takes half the cores, split between its browsers, and the full
   * gate runs its browser runs one at a time. Reduced motion has one file, so one page.
   */
  const browsers = otherBrowsers && firefoxStarts ? 2 : 1;
  const maxWorkers = Math.max(1, Math.ceil(availableParallelism() / 2 / browsers));

  return {
    // A GitHub runner is the speed `--mode ci-speed` simulates: there it runs unthrottled.
    define: { __ON_GITHUB_RUNNER__: JSON.stringify(process.env.GITHUB_ACTIONS === "true") },
    // Each mode optimizes dependencies in a cache of its own, so two runs at once don't rewrite
    // each other's. Vitest's mode is `test`.
    cacheDir: mode === "test" ? undefined : `node_modules/.vite-${mode}`,
    plugins: [tailwindcss()],
    resolve: {
      tsconfigPaths: true,
    },
    lint: { options: { typeAware: true, typeCheck: true } },
    fmt: {},
    test: {
      // Not `*.test.tsx`, so the root `vp test` run, which has no browser, leaves these alone.
      include: ["tests/**/*.a11y.tsx"],
      setupFiles: ["./tests/setup.ts"],
      maxWorkers,
      // A stuck page can't time its own tests out: the watchdog fails the run from Node instead.
      // Beside Vitest's own reporters, which in CI include the GitHub Actions annotations.
      reporters: [
        ...configDefaults.reporters,
        new Watchdog({ limitMs: 600_000, stallMs: 120_000 }),
      ],
      browser: {
        enabled: true,
        headless: true,
        instances: otherBrowsers
          ? [
              ...(firefoxStarts ? [{ browser: "firefox" as const, exclude: chromiumOnly }] : []),
              { browser: "webkit" as const, exclude: chromiumOnly },
            ]
          : [
              { browser: "chromium", exclude: chromiumOnly },
              {
                browser: "chromium",
                include: chromiumOnly,
                name: "reduced-motion",
                provider: playwright({ contextOptions: { reducedMotion: "reduce" } }),
              },
            ],
        provider: playwright(),
        viewport: { height: 800, width: 1280 },
      },
    },
  };
});
