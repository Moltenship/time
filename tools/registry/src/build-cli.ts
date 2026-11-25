import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { buildRegistry } from "./build";
import { checkBuiltRegistry } from "./check";
import { defaultRegistryBaseUrl, registryFrameworks } from "./config";

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
// Each framework's registry in its own folder: React's at the root, so its URLs stay as they were,
// and Solid's under solid/ (ADR 0279, point 2).
for (const framework of registryFrameworks) {
  const frameworkOut = join(outDir, framework.path);
  const manifest = await buildRegistry({ workspaceRoot, outDir: frameworkOut, baseUrl, framework });
  const issues = await checkBuiltRegistry({ outDir: frameworkOut, manifest, framework });
  if (issues.length > 0) {
    throw new Error(
      `The built ${framework.name} registry failed its checks:\n${issues.map((line) => `- ${line}`).join("\n")}`,
    );
  }
  console.log(
    `Built ${manifest.items.length} ${framework.name} registry items into ${frameworkOut} for ${manifest.baseUrl}`,
  );
}
