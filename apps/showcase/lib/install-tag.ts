import manifest from "@moltenship/calendar/package.json" with { type: "json" };

/** The npm tag a pre-release is published under, which `tools/release` calls its dist-tag. */
export const preReleaseTag = "next";

/**
 * The npm tag the install commands name for the docs of `version`: `next` for a pre-release such
 * as `2.0.0-beta.2`, and none for a stable version, which `latest` serves. It matches `distTag`
 * in `tools/release/src/manifest.ts`, the tag the release publishes the version under.
 */
export function installTagFor(version: string): string | undefined {
  // Semver marks a pre-release with a hyphen after the patch number. Build metadata follows a plus.
  return version.split("+")[0]!.includes("-") ? preReleaseTag : undefined;
}

/**
 * The npm tag the docs' install commands name, for React's docs and Solid's alike. Nobody sets
 * it: it follows the version of `@moltenship/calendar` the site is built with. That is the
 * workspace's package here and on Vercel, and the packed tarball in the release gate's copy
 * outside the workspace. So the release commit that bumps the packages to a stable version takes
 * the tag off the site, and the next pre-release puts it back.
 *
 * The pages write their commands without a tag (`pnpm add @moltenship/calendar`), and
 * `lib/remark-framework.ts` adds it when it compiles a page, to the page, its Markdown and the
 * search index. The landing page and `/llms.txt` read it from here too.
 *
 * A sentence that says why a command names a tag goes in `<PreRelease>…</PreRelease>`. The same
 * step drops those blocks when there is no tag, so a stable version takes the tag and its
 * explanations off the site together.
 */
export const installTag: string | undefined = installTagFor(manifest.version);

// A command is one line that starts with one of these. `tests/install-tag.test.ts` fails when a
// page installs a Time package in another form (`npm i`, a line continued with `\`), which would
// reach the reader without the tag.
const installCommand = /^\s*(?:pnpm add|npm install|yarn add|bun add)\b/u;
/** A Time package with no version or tag after its name. */
const untagged = /@moltenship\/[a-z][a-z-]*(?![\w@/.-])/gu;

/** `name` as an install command names it, such as `@moltenship/calendar@next`. */
export function tagged(name: string, tag: string | undefined): string {
  return tag === undefined ? name : `${name}@${tag}`;
}

/**
 * Adds the tag to each Time package in the install commands of `text`, which may be one command
 * or a code block with other lines around them. A package that already names a version or a tag
 * keeps it. The tag is an argument, not a default, so that `undefined` means none.
 */
export function withInstallTag(text: string, tag: string | undefined): string {
  if (tag === undefined) return text;
  return text
    .split("\n")
    .map((line) =>
      installCommand.test(line) ? line.replace(untagged, (name) => `${name}@${tag}`) : line,
    )
    .join("\n");
}
