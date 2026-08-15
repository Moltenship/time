import { resolve } from "node:path";

import { validateRegistryWorkspace } from "./validation";

const workspaceRoot = resolve(import.meta.dirname, "../../..");
const report = await validateRegistryWorkspace(workspaceRoot, [
  "tools/registry/fixtures/known-bad/registry-item.json",
]);

if (report.valid) throw new Error("Known-bad registry fixture unexpectedly passed");
throw new Error(`KNOWN_BAD_REGISTRY ${JSON.stringify(report.issues)}`);
