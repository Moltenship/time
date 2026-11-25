import { llmsIndex } from "@/lib/llms";
import { siteLink, siteUrl } from "@/lib/llms-format";

export const revalidate = false;

const notes = [
  `Every link below is a page as Markdown. Any page of ${siteUrl}/docs has one: add \`.md\` to its URL. ${siteUrl}/llms-full.txt is every page in one file.`,
  "The same pages ship in the npm package since 2.0, a pre-release that `@moltenship/calendar@next` installs. They are at `node_modules/@moltenship/calendar/docs`, so a coding agent can read the docs for the installed version without the network. `npx skills add Moltenship/time --skill moltenship-time` installs a skill for coding agents.",
];

export function GET(): Response {
  return new Response(llmsIndex(siteLink, notes), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
