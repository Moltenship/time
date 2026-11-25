import { llmsIndex } from "@/lib/llms";
import { siteLink, siteUrl } from "@/lib/llms-format";

export const revalidate = false;

const notes = [
  `The docs exist once for React, at ${siteUrl}/docs/react, and once for Solid, at ${siteUrl}/docs/solid. Read the set for the framework your app uses. Each section below names its framework. A page about a package that needs no framework, such as the ICS parser, reads the same in both.`,
  `Every link below is a page as Markdown. Any docs page has one: add \`.md\` to its URL. ${siteUrl}/llms-full.txt is React's docs in one file, followed by the pages of Solid's docs that differ.`,
  "Since 2.0 the npm package ships React's pages, at `node_modules/@moltenship/calendar/docs`, so a coding agent can read the docs for the installed version without the network. `@moltenship/calendar@next` installs 2.0. `npx skills add Moltenship/time --skill moltenship-time` installs a skill for coding agents.",
];

export function GET(): Response {
  return new Response(llmsIndex(siteLink, notes), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
