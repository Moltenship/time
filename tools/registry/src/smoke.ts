import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { buildRegistry } from "./build";
import { checkBuiltRegistry } from "./check";
import { validateRegistryWorkspace } from "./validation";

// The fast registry gate in `ready`: validates the source manifests and a contract fixture, then
// builds the registry with `shadcn build` into a temporary folder and checks the output. Offline:
// nothing is fetched or installed. `vp run registry:e2e` installs it into real apps.

const workspaceRoot = resolve(import.meta.dirname, "../../..");
const contractFixture = "tools/registry/fixtures/valid/registry-item.json";
const repositoryReport = await validateRegistryWorkspace(workspaceRoot);
const contractReport = await validateRegistryWorkspace(workspaceRoot, [contractFixture]);

if (!repositoryReport.valid || !contractReport.valid) {
  throw new Error(
    `Registry smoke failed: ${JSON.stringify([...repositoryReport.issues, ...contractReport.issues])}`,
  );
}

const outDir = await mkdtemp(join(tmpdir(), "time-registry-smoke-"));
try {
  const manifest = await buildRegistry({ workspaceRoot, outDir });
  const issues = await checkBuiltRegistry({ outDir, manifest });
  if (issues.length > 0) {
    throw new Error(
      `Registry smoke failed: the built registry has problems:\n${issues.join("\n")}`,
    );
  }

  console.log(
    `REGISTRY_SMOKE ${JSON.stringify({
      repositoryManifests: repositoryReport.manifests,
      contractFixtures: contractReport.manifests,
      validatedTargets: repositoryReport.targets + contractReport.targets,
      builtItems: manifest.items.length,
      runtime: manifest.runtime,
    })}`,
  );
} finally {
  await rm(outDir, { force: true, recursive: true });
}
