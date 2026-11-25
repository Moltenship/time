/**
 * The npm tag the docs' install commands name: `next` while 2.0 is a pre-release, and `undefined`
 * once `latest` is the version these docs describe. It is the one place the tag is written, for
 * React's docs and Solid's alike. The pages write their commands without it
 * (`pnpm add @moltenship/calendar`), and `lib/remark-framework.ts` adds it when it compiles a
 * page, to the page, its Markdown and the search index. The landing page reads it from here too.
 *
 * A sentence that says why a command names a tag goes in `<PreRelease>…</PreRelease>`. The same
 * step drops those blocks when this is `undefined`, so one edit here takes the tag and its
 * explanations off the site.
 */
export const installTag: string | undefined = "next";

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
