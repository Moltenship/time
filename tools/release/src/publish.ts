import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

import { distTag, manifestPath, publishProblems, readManifest, tarballIntegrity } from "./manifest";
import { tarballDirectory } from "./pack";
import {
  gitState,
  isOnMain,
  parseArguments,
  readPublishedPackages,
  run,
  runMain,
  runOrThrow,
} from "./workspace";

const registry = "https://registry.npmjs.org/";

/**
 * The integrity npm records for this version, or undefined when npm doesn't have it. Throws when
 * the registry can't say.
 */
async function publishedIntegrity(
  name: string,
  version: string,
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  const result = await run("vp", ["pm", "view", `${name}@${version}`, "dist.integrity", "--json"], {
    env,
  });
  if (result.code === 0) {
    const integrity = result.stdout.trim() ? (JSON.parse(result.stdout) as unknown) : undefined;
    return typeof integrity === "string" ? integrity : undefined;
  }
  const output = `${result.stdout}\n${result.stderr}`;
  if (/ERR_PNPM_PACKAGE_NOT_FOUND|ERR_PNPM_FETCH_404|E404/.test(output)) return undefined;
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
    onMain: await isOnMain(git.head),
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

  // Always the public registry, whatever a local .npmrc says. pnpm reads pnpm_config_*; npm_config_*
  // covers anything that shells out to npm. With NODE_AUTH_TOKEN set, a throwaway npmrc reads the
  // token from the environment, so it is never written to disk.
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    npm_config_registry: registry,
    pnpm_config_registry: registry,
  };
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
    // A scoped line such as `@moltenship:registry=…` in an npmrc beats the default registry, so
    // check both.
    for (const key of ["registry", "@moltenship:registry"]) {
      const configured = (
        await runOrThrow("vp", ["pm", "config", "get", key], { env })
      ).stdout.trim();
      if (key !== "registry" && (configured === "" || configured === "undefined")) continue;
      if (configured.replace(/\/?$/, "/") !== registry) {
        throw new Error(`pnpm's ${key} is ${configured}, not ${registry}. Nothing was published.`);
      }
    }

    // Look at all seven before publishing any. A re-run after a partial publish skips what is out,
    // but only if it is the tarball this dry run checked; otherwise npm would mix two builds.
    const published = new Map<string, string | undefined>();
    for (const { name, integrity } of manifest.packages) {
      const current = await publishedIntegrity(name, options.version, env);
      if (current !== undefined && current !== integrity) {
        throw new Error(
          `${name}@${options.version} is already on npm with different contents (${current}). Release a new version instead. Nothing was published.`,
        );
      }
      published.set(name, current);
    }

    for (const { name, file } of manifest.packages) {
      if (published.get(name) !== undefined) {
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
  const { flags } = parseArguments(
    process.argv.slice(2),
    ["provenance", "yes"],
    ["version", "tag", "manifest"],
  );
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
    // Tests only: point at a manifest that doesn't exist to exercise the refusal.
    manifestFile: value("manifest"),
  });
});
