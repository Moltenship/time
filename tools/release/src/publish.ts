import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { gte } from "semver";

import { npmRegistry as registry } from "./config";
import { distTag, manifestPath, publishProblems, readManifest, tarballIntegrity } from "./manifest";
import { tarballDirectory } from "./pack";
import { lastLine, nextTagCommand, pointNext } from "./next-tag";
import { pinnedNpm } from "./npm";
import { fetchPackument } from "./published";
import { gitState, isOnMain, readPublishedPackages, run, runOrThrow } from "./workspace";

/** The first npm that publishes through trusted publishing (docs.npmjs.com/trusted-publishers). */
export const trustedPublishingNpm = "11.5.1";

/** Where and how a release runs npm, as `withNpm` gives it. */
export interface NpmPlace {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  /** The command that starts npm, before npm's own arguments: the pinned npm (`npm.ts`). */
  readonly command: readonly [string, ...string[]];
  readonly version: string;
}

/** The command and arguments that run `npm <args>` in `place`. */
export function npmCall(
  place: Pick<NpmPlace, "command">,
  args: readonly string[],
): readonly [string, readonly string[]] {
  const [command, ...prefix] = place.command;
  return [command, [...prefix, ...args]];
}

/**
 * Runs `action` with a place to run the pinned npm in. npm runs outside the workspace, whose
 * devEngines pins pnpm, and reads an empty npmrc: no token, no project or user config, and the
 * public registry.
 */
async function withNpm<T>(action: (npm: NpmPlace) => Promise<T>): Promise<T> {
  const cwd = await mkdtemp(join(tmpdir(), "moltenship-publish-"));
  const userconfig = join(cwd, ".npmrc");
  await writeFile(userconfig, "");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    npm_config_registry: registry,
    npm_config_userconfig: userconfig,
  };
  delete env.NODE_AUTH_TOKEN;
  delete env.NPM_TOKEN;
  try {
    const { command } = pinnedNpm;
    const version = (
      await runOrThrow(...npmCall({ command }, ["--version"]), { cwd, env })
    ).stdout.trim();
    return await action({ cwd, env, command, version });
  } finally {
    await rm(cwd, { force: true, recursive: true });
  }
}

/**
 * Publishes the tarballs the release gate checked, and nothing else, with npm trusted publishing:
 * npm trades the job's OIDC token for a short-lived publish token and signs provenance, so there
 * is no npm token anywhere. The release workflow's publish job runs it, after the gate.
 *
 * It refuses unless the dry-run manifest matches HEAD, the version and every tarball, on a clean
 * tree on main or right on top of it. Safe to run again: a version npm serves is skipped when it's
 * the tarball the gate checked, and stops the run when it isn't, so the eleven on npm never mix two
 * builds. With `dryRun`, it checks all of that and npm's state, publishes nothing, and returns what
 * a release would refuse instead of throwing.
 */
export async function publish(options: {
  readonly version: string;
  readonly dryRun?: boolean;
  readonly manifestFile?: string;
  readonly log?: (line: string) => void;
}): Promise<readonly string[]> {
  const { version, log = console.log } = options;
  const manifest = await readManifest(options.manifestFile ?? manifestPath);
  const git = await gitState();
  const packages = await readPublishedPackages();
  const problems = publishProblems({
    manifest,
    version,
    head: git.head,
    clean: git.clean,
    onMain: (await isOnMain(git.head)) || (await isOnMain(`${git.head}^`)),
    expectedPackages: packages.map(({ manifest: { name } }) => name),
    tarballIntegrity: await tarballIntegrity(manifest),
  });
  if (!manifest || (problems.length > 0 && !options.dryRun)) {
    throw new Error(`Refusing to publish:\n- ${problems.join("\n- ")}`);
  }
  const tag = distTag(version);

  return withNpm(async (place) => {
    const { cwd, env, version: npm } = place;
    if (!gte(npm, trustedPublishingNpm)) {
      throw new Error(
        `npm ${npm} can't publish through trusted publishing; it needs ${trustedPublishingNpm}.`,
      );
    }

    // Look at all eleven before publishing any.
    const pending: (typeof manifest.packages)[number][] = [];
    for (const entry of manifest.packages) {
      const current = (await fetchPackument(entry.name))?.versions?.[version]?.dist?.integrity;
      if (current === undefined) pending.push(entry);
      else if (current !== entry.integrity) {
        throw new Error(
          `${entry.name}@${version} is already on npm with different contents (${current}). Release a new version instead. Nothing was published.`,
        );
      } else log(`${entry.name}@${version} is on npm already; skipping it.`);
    }
    if (pending.length === 0) {
      log(`npm serves all ${manifest.packages.length} packages at ${version} already.`);
      return problems;
    }

    const summary = `${pending.length} packages at ${version} with the "${tag}" tag`;
    log(`Ready to publish ${summary}, through trusted publishing, with provenance:`);
    for (const { file } of pending) log(`  ${file}`);
    const publishArgs = (file: string) => [
      "publish",
      join(tarballDirectory, file),
      "--access",
      "public",
      "--tag",
      tag,
      "--provenance",
      "--registry",
      registry,
    ];
    if (options.dryRun) {
      // The release's own command, with npm's --dry-run: npm reads each tarball, checks the tag
      // and the version against the registry, and stops before it uploads. Where the job can mint
      // an OIDC token it trades it too; the dry-run job can't, and the check job asked npm for
      // each package's trusted publisher instead. What npm refuses is a problem to report.
      const refused: string[] = [];
      for (const { name, file } of pending) {
        const result = await run(...npmCall(place, [...publishArgs(file), "--dry-run"]), {
          cwd,
          env,
        });
        if (result.code !== 0) {
          refused.push(
            `npm publish --dry-run refused ${name}@${version}: ${lastLine(`${result.stdout}\n${result.stderr}`)}`,
          );
        }
      }
      if (refused.length === 0) {
        log(
          `npm ${npm} took all ${pending.length} for npm publish --dry-run. A release would publish them now, with that npm.`,
        );
      }
      return [...problems, ...refused];
    }
    for (const { name, file } of pending) {
      await runOrThrow(...npmCall(place, publishArgs(file)), { cwd, env, inherit: true });
      log(`Published ${name}@${version}.`);
    }
    log(`Published ${summary}.`);
    return problems;
  });
}

/** What `moveNextTag` works with; a test gives it its own. */
export interface NextTagParts {
  /** The published packages' names. */
  readonly names: () => Promise<readonly string[]>;
  /** A place to run npm in, the command that starts it, and its version, as `withNpm` gives them. */
  readonly npm: typeof withNpm;
  readonly run: typeof run;
  readonly tagged: (name: string) => Promise<string | undefined>;
}

const nextTagParts: NextTagParts = {
  names: async () => (await readPublishedPackages()).map(({ manifest }) => manifest.name),
  npm: withNpm,
  run,
  tagged: async (name) => (await fetchPackument(name))?.["dist-tags"]?.next,
};

/**
 * After the publish, for a stable version: points `next` at it too, so an `@next` command in
 * someone's notes installs the release and not the last pre-release (`next-tag.ts`). A step of
 * the publish job runs it, through trusted publishing as the publish does. It returns the step
 * that is left for the owner when npm can't or won't move the tag here, and never throws: the
 * packages are out.
 */
export async function moveNextTag(
  options: {
    readonly version: string;
    readonly dryRun?: boolean;
    readonly log?: (line: string) => void;
  },
  parts: NextTagParts = nextTagParts,
): Promise<string | undefined> {
  const { version, dryRun = false, log = console.log } = options;
  let names: readonly string[] | undefined;
  try {
    const published = await parts.names();
    names = published;
    return await parts.npm((place) =>
      pointNext(
        { version, names: published, dryRun },
        {
          npm: place.version,
          tagged: parts.tagged,
          // Without a credential npm could wait for a login nobody gives, so each call is cut off.
          add: (name, to, timeout) =>
            parts.run(
              ...npmCall(place, [
                "dist-tag",
                "add",
                `${name}@${to}`,
                "next",
                "--registry",
                registry,
              ]),
              { cwd: place.cwd, env: place.env, signal: AbortSignal.timeout(timeout) },
            ),
          sleep: (milliseconds) => sleep(milliseconds),
          log,
          now: Date.now,
        },
      ),
    );
  } catch (error) {
    const command =
      names === undefined
        ? `npm dist-tag add <package>@${version} next, for each published package`
        : nextTagCommand(names, version);
    return `Couldn't look at the next tag (${error instanceof Error ? error.message : String(error)}). If it names a version before ${version}, @next installs that. Logged in to npm, run: ${command}`;
  }
}
