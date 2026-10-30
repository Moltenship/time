import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";

import stylex from "@stylexjs/unplugin";
import tailwindcss from "@tailwindcss/vite";
import { configDefaults, defineConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";

import { mouse } from "./mouse";
import { Watchdog } from "./watchdog";

/**
 * `--mode browsers` leaves Firefox out until #263 brings it back: a drag test failed there in the
 * 1.0.0-rc.2 release gate. Playwright's Firefox also can't start on macOS 27 (#182).
 */
const firefoxRuns = false;

const fromHere = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** Reduced motion runs in a Chromium context of its own. */
const chromiumOnly = ["tests/reduced-motion.a11y.tsx"];

/**
 * The demo's StyleX page runs without Tailwind's global CSS, as it does in the demo: the two define
 * the same tokens, and a contrast check should see the page's own.
 */
const stylexOnly = ["tests/demo-stylex.a11y.tsx"];
const tailwindExclude = [...chromiumOnly, ...stylexOnly];
// Absolute: Vitest doesn't resolve the paths of an instance's own setup files.
const stylexSetup = [fromHere("./tests/setup.ts")];
const tailwindSetup = [...stylexSetup, fromHere("./tests/setup-tailwind.ts")];

export default defineConfig(({ mode }) => {
  // `vp run browsers`: the suite in Firefox and WebKit instead of Chromium.
  const otherBrowsers = mode === "browsers";
  if (otherBrowsers && !firefoxRuns) console.warn("Firefox left out until #263.");

  /**
   * Test files that run at once, each in a page of its own. Vitest gives each browser a pool of
   * up to 12 pages, which oversubscribed the machine: a browser run shares it with the gate's build
   * and unit-test lane. So a run takes half the cores, split between its browsers, and the full
   * gate runs its browser runs one at a time. Reduced motion has one file, so one page.
   */
  const browsers = otherBrowsers && firefoxRuns ? 2 : 1;
  const maxWorkers = Math.max(1, Math.ceil(availableParallelism() / 2 / browsers));

  return {
    // A GitHub runner is the speed `--mode ci-speed` simulates: there it runs unthrottled, a second
    // Chromium run like `a11y`.
    define: { __ON_GITHUB_RUNNER__: JSON.stringify(process.env.GITHUB_ACTIONS === "true") },
    // Each mode optimizes dependencies in a cache of its own, so two runs at once don't rewrite
    // each other's. Vitest's mode is `test`.
    cacheDir: mode === "test" ? undefined : `node_modules/.vite-${mode}`,
    // What StyleX's compiled files import, known up front so the first such test doesn't reload.
    optimizeDeps: { include: ["@stylexjs/stylex/lib/stylex-inject"] },
    plugins: [
      stylex.vite({
        aliases: { "@registry/*": [fromHere("../../registry/*")] },
        dev: true,
        runtimeInjection: true,
        unstable_moduleResolution: { rootDir: fromHere("../.."), type: "commonJS" },
      }),
      tailwindcss(),
    ],
    resolve: {
      tsconfigPaths: true,
    },
    lint: { options: { typeAware: true, typeCheck: true } },
    fmt: {},
    test: {
      // Not `*.test.tsx`, so the root `vp test` run, which has no browser, leaves these alone.
      include: ["tests/**/*.a11y.tsx"],
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
              ...(firefoxRuns
                ? [
                    {
                      browser: "firefox" as const,
                      exclude: tailwindExclude,
                      setupFiles: tailwindSetup,
                    },
                  ]
                : []),
              { browser: "webkit" as const, exclude: tailwindExclude, setupFiles: tailwindSetup },
              {
                browser: "webkit" as const,
                include: stylexOnly,
                name: "webkit-stylex",
                setupFiles: stylexSetup,
              },
            ]
          : [
              { browser: "chromium", exclude: tailwindExclude, setupFiles: tailwindSetup },
              {
                browser: "chromium",
                include: chromiumOnly,
                name: "reduced-motion",
                provider: playwright({ contextOptions: { reducedMotion: "reduce" } }),
                setupFiles: tailwindSetup,
              },
              {
                browser: "chromium",
                include: stylexOnly,
                name: "chromium-stylex",
                setupFiles: stylexSetup,
              },
            ],
        provider: playwright(),
        viewport: { height: 800, width: 1280 },
        // Real mouse input at page points, step by step, for drags a test watches as they go.
        commands: { mouse },
      },
    },
  };
});
