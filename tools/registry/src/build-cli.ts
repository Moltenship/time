import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { buildRegistry } from "./build";
import { checkBuiltRegistry } from "./check";
import { defaultRegistryBaseUrl } from "./config";

const workspaceRoot = resolve(import.meta.dirname, "../../..");
const { values } = parseArgs({
  options: {
    out: { type: "string" },
    "base-url": { type: "string" },
  },
});

// An --out given on the command line is relative to where it runs; the default is the docs site's.
const outDir = values.out
  ? resolve(process.cwd(), values.out)
  : resolve(workspaceRoot, "apps/showcase/public/r");
const baseUrl = values["base-url"] ?? process.env.REGISTRY_BASE_URL ?? defaultRegistryBaseUrl;
const manifest = await buildRegistry({ workspaceRoot, outDir, baseUrl });
const issues = await checkBuiltRegistry({ outDir, manifest });
if (issues.length > 0) {
  throw new Error(
    `The built registry failed its checks:\n${issues.map((line) => `- ${line}`).join("\n")}`,
  );
}

console.log(`Built ${manifest.items.length} registry items into ${outDir} for ${manifest.baseUrl}`);
