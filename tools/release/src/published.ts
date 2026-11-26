import { createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import { gt, valid } from "semver";

import { npmRegistry } from "./config";
import { distTag, manifestPath, readManifest, type ReleaseManifest } from "./manifest";

/** The parts of npm's package document this check reads. */
export interface Packument {
  readonly "dist-tags"?: Readonly<Record<string, string>>;
  readonly versions?: Readonly<
    Record<
      string,
      {
        readonly dist?: {
          readonly integrity?: string;
          readonly attestations?: unknown;
          /** Where installers download the version from. */
          readonly tarball?: string;
        };
        /** Who published it; `trustedPublisher` is set when it came through npm trusted publishing. */
        readonly _npmUser?: { readonly trustedPublisher?: unknown };
      }
    >
  >;
}

export interface PublishedCheck {
  /** Wrong for good: other contents, no trusted publisher, or the tag elsewhere. Waiting won't help. */
  readonly problems: readonly string[];
  /** Not there yet: npm can take minutes to list a version it just took. */
  readonly pending: readonly string[];
  /** Fine, but worth saying, such as a tag a newer release has taken since. */
  readonly notes: readonly string[];
}

/**
 * Compares what npm serves with what the dry run checked: every package at the version, with the
 * tarball's integrity, under the dist-tag it went out with, from the trusted publisher and with
 * provenance: the evidence pnpm's `trustPolicy` ranks above provenance alone, which `1.0.0-rc.1`
 * has.
 * `packuments` maps each package to npm's document, or undefined when npm doesn't list it yet.
 * npm writes a version and its tags in one document, so once it lists the version, a tag that
 * points elsewhere stays there, unless a newer release moved it on.
 */
export function checkPublished(
  manifest: ReleaseManifest,
  options: { readonly version: string; readonly tag: string },
  packuments: ReadonlyMap<string, Packument | undefined>,
): PublishedCheck {
  const problems: string[] = [];
  const pending: string[] = [];
  const notes: string[] = [];
  if (manifest.status !== "passed") problems.push("The dry run didn't pass");
  if (manifest.version !== options.version) {
    problems.push(`The dry run checked ${manifest.version}, not ${options.version}`);
  }
  for (const { name, integrity } of manifest.packages) {
    const id = `${name}@${options.version}`;
    const packument = packuments.get(name);
    const published = packument?.versions?.[options.version];
    if (!packument || !published?.dist) {
      pending.push(`npm doesn't list ${id} yet`);
      continue;
    }
    const { dist } = published;
    if (dist.integrity !== integrity) {
      problems.push(
        `${id} on npm is ${dist.integrity ?? "without an integrity"}, not the tarball the dry run checked (${integrity})`,
      );
    }
    if (!(published._npmUser?.trustedPublisher && dist.attestations)) {
      problems.push(`${id} has no trusted publisher and provenance on npm`);
    }
    const tagged = packument["dist-tags"]?.[options.tag];
    if (tagged === options.version) continue;
    if (tagged !== undefined && valid(tagged) && gt(tagged, options.version)) {
      notes.push(`${name}'s "${options.tag}" tag has moved on to ${tagged}`);
    } else {
      problems.push(
        `${name}'s "${options.tag}" tag points at ${tagged ?? "nothing"}, not ${options.version}`,
      );
    }
  }
  return { problems, pending, notes };
}

/** npm's document for a package, or undefined while npm doesn't have it. */
export async function fetchPackument(name: string): Promise<Packument | undefined> {
  const response = await fetch(new URL(name.replace("/", "%2f"), npmRegistry), {
    headers: { accept: "application/json", "cache-control": "no-cache" },
    // A stalled request counts as one that failed, so the wait keeps to its deadline.
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`npm answered ${response.status} for ${name}`);
  return (await response.json()) as Packument;
}

/** How npm answered for a tarball: its status, and on a 200 the integrity of the bytes it sent. */
export interface TarballAnswer {
  readonly status: number;
  readonly integrity?: string;
}

/**
 * Downloads a tarball as an installer does. No `cache-control` header: npm's CDN went on
 * answering 404 for minutes after the packument listed a version (release run 45774483713), and
 * the request has to see what an install would.
 */
export async function fetchTarball(url: string): Promise<TarballAnswer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) {
    await response.body?.cancel();
    return { status: response.status };
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  return {
    status: response.status,
    integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
  };
}

/**
 * Waits until npm serves every package the dry run checked, and fails as soon as a package it
 * lists differs. Serving means both parts an install reads: the package document lists the
 * version as the dry run checked it, and its `dist.tarball` answers 200 with the dry run's bytes.
 * The release workflow's finish job runs it after publishing, before anything reads the release:
 * the push of main, which the docs site's registry follows, and the install job. A tarball npm
 * stored with other contents means the release must be deprecated and a new version released
 * (releasing.md).
 */
export async function waitForPublished(options: {
  readonly version: string;
  readonly manifestFile?: string;
  readonly timeoutMs?: number;
  readonly intervalMs?: number;
  readonly fetch?: (name: string) => Promise<Packument | undefined>;
  readonly fetchTarball?: (url: string) => Promise<TarballAnswer>;
  readonly log?: (line: string) => void;
}): Promise<void> {
  const {
    timeoutMs = 15 * 60_000,
    intervalMs = 30_000,
    fetch = fetchPackument,
    fetchTarball: download = fetchTarball,
    log = console.log,
  } = options;
  const manifest = await readManifest(options.manifestFile ?? manifestPath);
  if (!manifest)
    throw new Error("No dry-run manifest. vp run release runs the gate, which writes one.");
  const tag = distTag(options.version);
  const deadline = Date.now() + timeoutMs;
  let notes: readonly string[] = [];
  /** The packages whose tarball npm has served as the dry run checked it: no need to ask again. */
  const downloaded = new Set<string>();
  /** A registry hiccup is one more reason to wait, not a verdict. */
  const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));
  for (;;) {
    // All at once, so a round takes one request's timeout at most, well within the job's limit.
    const answers = await Promise.allSettled(manifest.packages.map(({ name }) => fetch(name)));
    const packuments = new Map<string, Packument | undefined>();
    const unreachable: string[] = [];
    answers.forEach((answer, index) => {
      if (answer.status === "fulfilled")
        packuments.set(manifest.packages[index]!.name, answer.value);
      else unreachable.push(reason(answer.reason));
    });
    const check = checkPublished(manifest, { version: options.version, tag }, packuments);
    if (check.problems.length > 0) {
      throw new Error(
        `npm doesn't serve what the dry run checked:\n- ${check.problems.join("\n- ")}`,
      );
    }
    notes = check.notes;

    // The tarball of each version npm lists, whose integrity checkPublished has just matched.
    const listed = manifest.packages.filter(
      ({ name }) =>
        !downloaded.has(name) &&
        packuments.get(name)?.versions?.[options.version]?.dist !== undefined,
    );
    const tarballs = await Promise.allSettled(
      listed.map(async ({ name }) => {
        const url = packuments.get(name)!.versions![options.version]!.dist!.tarball;
        return { url, answer: url === undefined ? undefined : await download(url) };
      }),
    );
    const tarballProblems: string[] = [];
    const tarballsPending: string[] = [];
    tarballs.forEach((settled, index) => {
      const { name, integrity } = listed[index]!;
      const id = `${name}@${options.version}`;
      if (settled.status === "rejected") {
        unreachable.push(`${id}'s tarball: ${reason(settled.reason)}`);
        return;
      }
      const { url, answer } = settled.value;
      if (answer === undefined) tarballsPending.push(`npm lists ${id} without a tarball URL yet`);
      else if (answer.status !== 200) {
        tarballsPending.push(`npm answers ${answer.status} for ${id}'s tarball, ${url}`);
      } else if (answer.integrity !== integrity) {
        tarballProblems.push(
          `${id}'s tarball, ${url}, is ${answer.integrity ?? "without an integrity"}, not the one the dry run checked (${integrity})`,
        );
      } else downloaded.add(name);
    });
    if (tarballProblems.length > 0) {
      throw new Error(
        `npm doesn't serve what the dry run checked:\n- ${tarballProblems.join("\n- ")}`,
      );
    }
    const waiting = [...unreachable, ...check.pending, ...tarballsPending];
    if (waiting.length === 0) break;
    if (Date.now() + intervalMs >= deadline) {
      throw new Error(
        `npm still doesn't serve the release after ${Math.round(timeoutMs / 60_000)} minutes:\n- ${waiting.join("\n- ")}`,
      );
    }
    log(`Waiting for npm: ${waiting.length} left, such as ${waiting[0]}`);
    await sleep(intervalMs);
  }
  for (const note of notes) log(note);
  log(
    `npm serves ${manifest.packages.length} packages at ${options.version} as the dry run checked them, tagged ${tag}, from the trusted publisher, with provenance, and each tarball downloads with the dry run's integrity.`,
  );
}
