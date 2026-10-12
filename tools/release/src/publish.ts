import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

import { distTag, manifestPath, publishProblems, readManifest, tarballIntegrity } from "./manifest";
import { tarballDirectory } from "./pack";
import {
  gitState,
  parseArguments,
  readPublishedPackages,
  run,
  runMain,
  runOrThrow,
} from "./workspace";

const registry = "https://registry.npmjs.org/";

/** Whether npm already has this version. Throws when the registry can't say. */
async function isPublished(
  name: string,
  version: string,
  env: NodeJS.ProcessEnv,
): Promise<boolean> {
  const result = await run("vp", ["pm", "view", `${name}@${version}`, "version", "--json"], {
    env,
  });
  if (result.code === 0) return result.stdout.includes(`"${version}"`);
  const output = `${result.stdout}\n${result.stderr}`;
  if (/ERR_PNPM_PACKAGE_NOT_FOUND|ERR_PNPM_FETCH_404|E404/.test(output)) return false;
  throw new Error(`Can't tell whether ${name}@${version} is on npm:\n${output.trim()}`);
}

async function confirm(question: string, expected: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await prompt.question(question)).trim() === expected;
  } finally {
    prompt.close();
  }
}

/**
 * Publishes the tarballs a passing dry run checked, and nothing else. Run it by hand, or from the
 * manual release workflow. It refuses unless the dry-run manifest matches HEAD, the version and
 * every tarball, on a clean tree.
 */
export async function publish(options: {
  readonly version: string;
  readonly tag?: string;
  readonly provenance: boolean;
  readonly yes: boolean;
  readonly manifestFile?: string;
}): Promise<void> {
  const manifest = await readManifest(options.manifestFile ?? manifestPath);
  const git = await gitState();
  const packages = await readPublishedPackages();
  const problems = publishProblems({
    manifest,
    version: options.version,
    head: git.head,
    clean: git.clean,
    expectedPackages: packages.map(({ manifest: { name } }) => name),
    tarballIntegrity: await tarballIntegrity(manifest),
  });
  if (problems.length > 0 || !manifest) {
    throw new Error(`Refusing to publish:\n- ${problems.join("\n- ")}`);
  }
  const tag = distTag(options.version, options.tag);
  if (options.provenance && process.env.GITHUB_ACTIONS !== "true") {
    throw new Error(
      "--provenance needs GitHub Actions. Publish locally without it, or run the release workflow.",
    );
  }

  const summary = `${manifest.packages.length} packages at ${options.version} with the "${tag}" tag${options.provenance ? " and provenance" : ""}`;
  console.log(`Ready to publish ${summary}:`);
  for (const { file } of manifest.packages) console.log(`  ${file}`);
  if (!options.yes && !(await confirm(`Type ${options.version} to publish: `, options.version))) {
    throw new Error(
      "Not confirmed. Nothing was published. (Pass --yes when there is no terminal.)",
    );
  }

  // Always the public registry, whatever a local .npmrc says. With NODE_AUTH_TOKEN set, a
  // throwaway npmrc reads the token from the environment, so it is never written to disk.
  const env: NodeJS.ProcessEnv = { ...process.env, npm_config_registry: registry };
  const configDirectory = process.env.NODE_AUTH_TOKEN
    ? await mkdtemp(join(tmpdir(), "moltenship-npmrc-"))
    : undefined;
  if (configDirectory) {
    const userconfig = join(configDirectory, ".npmrc");
    await writeFile(
      userconfig,
      `registry=${registry}\n//registry.npmjs.org/:_authToken=\${NODE_AUTH_TOKEN}\n`,
    );
    env.npm_config_userconfig = userconfig;
  }

  try {
    for (const { name, file } of manifest.packages) {
      if (await isPublished(name, options.version, env)) {
        console.log(`${name}@${options.version} is already on npm; skipping.`);
        continue;
      }
      const args = [
        "pm",
        "publish",
        join(tarballDirectory, file),
        "--tag",
        tag,
        "--access",
        "public",
        "--no-git-checks",
      ];
      if (options.provenance) args.push("--provenance");
      await runOrThrow("vp", args, { env, inherit: true });
      console.log(`Published ${name}@${options.version}.`);
    }
  } finally {
    if (configDirectory) await rm(configDirectory, { force: true, recursive: true });
  }
  console.log(`Published ${summary}.`);
}

runMain(import.meta, async () => {
  const { flags } = parseArguments(process.argv.slice(2), ["provenance", "yes"]);
  const value = (key: string) =>
    typeof flags.get(key) === "string" ? (flags.get(key) as string) : undefined;
  const version = value("version");
  if (!version) {
    throw new Error(
      "Usage: vp run release:publish --version <version> [--tag <tag>] [--provenance] [--yes]",
    );
  }
  await publish({
    version,
    tag: value("tag"),
    provenance: flags.has("provenance"),
    yes: flags.has("yes"),
    manifestFile: value("manifest"),
  });
});
