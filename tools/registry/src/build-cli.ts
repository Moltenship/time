import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { buildRegistry } from "./build";
import { checkBuiltRegistry } from "./check";
import { defaultRegistryBaseUrl } from "./config";

const workspaceRoot = resolve(import.meta.dirname, "../../..");
const { values } = parseArgs({
  options: {
    out: { type: "string", default: "apps/showcase/public/r" },
    "base-url": { type: "string" },
  },
});

const outDir = resolve(process.cwd(), values.out);
const baseUrl = values["base-url"] ?? process.env.REGISTRY_BASE_URL ?? defaultRegistryBaseUrl;
const manifest = await buildRegistry({ workspaceRoot, outDir, baseUrl });
const issues = await checkBuiltRegistry({ outDir, manifest });
if (issues.length > 0) {
  throw new Error(
    `The built registry failed its checks:\n${issues.map((line) => `- ${line}`).join("\n")}`,
  );
}

console.log(`Built ${manifest.items.length} registry items into ${outDir} for ${manifest.baseUrl}`);
