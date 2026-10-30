import { existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import stylex from "@stylexjs/unplugin";
import { defineConfig } from "vite-plus";

const registry = fileURLToPath(new URL(".", import.meta.url));
const flavour = "stylex-";
const ported = new Set(
  readdirSync(registry)
    .filter((name) => name.startsWith(flavour))
    .map((name) => name.slice(flavour.length)),
);
const sourceFile = /^(.+?)(\.tsx?)?$/u;
const tailwindClassTests = [
  "icons sit in the clamped and truncated titles",
  "the ring that sets them apart",
  "only the exceptions are shaded",
  "shades weekends",
];

/**
 * Every registry test, run against the StyleX flavour: the tests import `@registry/month-view/…`,
 * which this resolves to `registry/stylex-month-view/…`, so the two flavours answer to one contract.
 */
function stylexFlavour() {
  return {
    enforce: "pre" as const,
    name: "registry-stylex-flavour",
    resolveId(source: string, importer?: string) {
      // Tests also reach the source relatively: `../calendar/mini-month`.
      const fromTests = importer?.startsWith(`${registry}tests/`) === true;
      const match = (
        fromTests ? /^(?:@registry|\.\.)\/([^/]+)\/(.+)$/u : /^@registry\/([^/]+)\/(.+)$/u
      ).exec(source);
      if (match === null || !ported.has(match[1]!)) return null;
      const base = `${registry}${flavour}${match[1]}/${sourceFile.exec(match[2]!)![1]}`;
      return [".ts", ".tsx"].map((extension) => base + extension).find(existsSync) ?? null;
    },
  };
}

// Without its dev server part: a timer there stops with an HTTP server, and Vitest's has none, so
// it would keep the run from exiting.
const { configureServer: _, ...compile } = stylex.vite({
  aliases: { "@registry/*": [`${registry}*`] },
  dev: false,
  runtimeInjection: false,
  unstable_moduleResolution: { rootDir: `${registry}..`, type: "commonJS" },
});

export default defineConfig({
  // Inside the checkout's `node_modules/.vite`, Vite Task sees Vitest's results as inputs it wrote.
  cacheDir: `${tmpdir()}/moltenship-registry-stylex`,
  plugins: [stylexFlavour(), compile],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    // Tests of the Tailwind theme, of what ties the flavours together, and, below, the few that read
    // a Tailwind class off an element.
    exclude: ["tests/stylex-flavour.test.ts", "tests/theme-contrast.test.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    testNamePattern: new RegExp(`^(?!.*(?:${tailwindClassTests.join("|")}))`, "u"),
  },
});
