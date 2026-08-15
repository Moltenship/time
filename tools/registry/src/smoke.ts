import { resolve } from "node:path";

import { validateRegistryWorkspace } from "./validation";

const workspaceRoot = resolve(import.meta.dirname, "../../..");
const contractFixture = "tools/registry/fixtures/valid/registry-item.json";
const repositoryReport = await validateRegistryWorkspace(workspaceRoot);
const contractReport = await validateRegistryWorkspace(workspaceRoot, [contractFixture]);

if (!repositoryReport.valid || !contractReport.valid) {
  throw new Error(
    `Registry smoke failed: ${JSON.stringify([...repositoryReport.issues, ...contractReport.issues])}`,
  );
}

console.log(
  `REGISTRY_SMOKE ${JSON.stringify({
    repositoryManifests: repositoryReport.manifests,
    contractFixtures: contractReport.manifests,
    validatedTargets: repositoryReport.targets + contractReport.targets,
  })}`,
);
