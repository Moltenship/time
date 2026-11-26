import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const manifestFile = createRequire(import.meta.url).resolve("npm/package.json");
const manifest = JSON.parse(readFileSync(manifestFile, "utf8")) as {
  readonly version: string;
  readonly bin: { readonly npm: string };
};

/**
 * The npm the release runs, which `tools/release` depends on: the lockfile pins its version and
 * integrity, and the jobs' `vp install --frozen-lockfile --ignore-scripts` brings it in, so a
 * release doesn't publish with whatever npm the runner's Node.js bundles. Node.js 26 brought
 * 11.20.0, which can publish through trusted publishing but not move a dist-tag (`next-tag.ts`).
 */
export const pinnedNpm = {
  version: manifest.version,
  /** How to start it: Node.js and npm's own entry point, so no PATH lookup finds another npm. */
  command: [process.execPath, join(dirname(manifestFile), manifest.bin.npm)],
} as const;
