import { setTimeout as sleep } from "node:timers/promises";

import { npmRegistry } from "./config";
import { distTag, manifestPath, readManifest, type ReleaseManifest } from "./manifest";
import { parseArguments, runMain } from "./workspace";

/** The parts of npm's package document this check reads. */
export interface Packument {
  readonly "dist-tags"?: Readonly<Record<string, string>>;
  readonly versions?: Readonly<
    Record<
      string,
      { readonly dist?: { readonly integrity?: string; readonly attestations?: unknown } }
    >
  >;
}

export interface PublishedCheck {
  /** Wrong for good: npm has other contents, or no provenance. Waiting won't help. */
  readonly problems: readonly string[];
  /** Not there yet: npm can take minutes to list a version it just took. */
  readonly pending: readonly string[];
}

/**
 * Compares what npm serves with what the dry run checked: every package at the version, with the
 * tarball's integrity, under the dist-tag it went out with, and with provenance when it was signed.
 * `packuments` maps each package to npm's document, or undefined when npm doesn't list it yet.
 */
export function checkPublished(
  manifest: ReleaseManifest,
  options: { readonly version: string; readonly tag: string; readonly provenance: boolean },
  packuments: ReadonlyMap<string, Packument | undefined>,
): PublishedCheck {
  const problems: string[] = [];
  const pending: string[] = [];
  if (manifest.status !== "passed") problems.push("The dry run didn't pass");
  if (manifest.version !== options.version) {
    problems.push(`The dry run checked ${manifest.version}, not ${options.version}`);
  }
  for (const { name, integrity } of manifest.packages) {
    const id = `${name}@${options.version}`;
    const packument = packuments.get(name);
    const dist = packument?.versions?.[options.version]?.dist;
    if (!dist) {
      pending.push(`npm doesn't list ${id} yet`);
      continue;
    }
    if (dist.integrity !== integrity) {
      problems.push(
        `${id} on npm is ${dist.integrity ?? "without an integrity"}, not the tarball the dry run checked (${integrity})`,
      );
    }
    if (options.provenance && !dist.attestations) problems.push(`${id} has no provenance on npm`);
    const tagged = packument["dist-tags"]?.[options.tag];
    if (tagged !== options.version) {
      pending.push(`${name}'s "${options.tag}" tag points at ${tagged ?? "nothing"} yet`);
    }
  }
  return { problems, pending };
}

/** npm's document for a package, or undefined while npm doesn't have it. */
export async function fetchPackument(name: string): Promise<Packument | undefined> {
  const response = await fetch(new URL(name.replace("/", "%2f"), npmRegistry), {
    headers: { accept: "application/json", "cache-control": "no-cache" },
  });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`npm answered ${response.status} for ${name}`);
  return (await response.json()) as Packument;
}

/**
 * Waits until npm serves every package the dry run checked, then fails on any difference. Runs
 * after the publish step, in the release workflow or by hand. A tarball npm stored with other
 * contents means the release must be deprecated and a new version released (releasing.md).
 */
export async function waitForPublished(options: {
  readonly version: string;
  readonly tag?: string;
  readonly provenance: boolean;
  readonly manifestFile?: string;
  readonly timeoutMs?: number;
  readonly intervalMs?: number;
  readonly fetch?: (name: string) => Promise<Packument | undefined>;
  readonly log?: (line: string) => void;
}): Promise<void> {
  const {
    timeoutMs = 15 * 60_000,
    intervalMs = 30_000,
    fetch = fetchPackument,
    log = console.log,
  } = options;
  const manifest = await readManifest(options.manifestFile ?? manifestPath);
  if (!manifest) throw new Error("No dry-run manifest. Get the release run's `release` artifact.");
  const tag = distTag(options.version, options.tag);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const packuments = new Map<string, Packument | undefined>();
    const unreachable: string[] = [];
    for (const { name } of manifest.packages) {
      try {
        packuments.set(name, await fetch(name));
      } catch (error) {
        // A registry hiccup is one more reason to wait, not a verdict.
        unreachable.push(error instanceof Error ? error.message : String(error));
      }
    }
    const { problems, pending } = checkPublished(
      manifest,
      { version: options.version, tag, provenance: options.provenance },
      packuments,
    );
    if (problems.length > 0) {
      throw new Error(`npm doesn't serve what the dry run checked:\n- ${problems.join("\n- ")}`);
    }
    const waiting = [...unreachable, ...pending];
    if (waiting.length === 0) break;
    if (Date.now() + intervalMs >= deadline) {
      throw new Error(
        `npm still doesn't serve the release after ${Math.round(timeoutMs / 60_000)} minutes:\n- ${waiting.join("\n- ")}`,
      );
    }
    log(`Waiting for npm: ${waiting.length} left, such as ${waiting[0]}`);
    await sleep(intervalMs);
  }
  for (const { name } of manifest.packages) {
    log(`${name}@${options.version}: the dry run's tarball, tagged ${tag}`);
  }
  log(
    `npm serves ${manifest.packages.length} packages at ${options.version} as the dry run checked them${options.provenance ? ", with provenance" : ""}.`,
  );
}

runMain(import.meta, async () => {
  const { flags } = parseArguments(
    process.argv.slice(2),
    ["provenance"],
    ["version", "tag", "manifest"],
  );
  const value = (key: string) =>
    typeof flags.get(key) === "string" ? (flags.get(key) as string) : undefined;
  const version = value("version");
  if (!version) {
    throw new Error(
      "Usage: vp run release:published --version <version> [--tag <tag>] [--provenance] [--manifest <path>]",
    );
  }
  await waitForPublished({
    version,
    tag: value("tag"),
    provenance: flags.has("provenance"),
    // Another run's manifest, such as the `release` artifact of a release run.
    manifestFile: value("manifest"),
  });
});
