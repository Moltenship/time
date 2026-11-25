/**
 * Checks the demo's build has its three pages, each with the scripts and stylesheets it links: the
 * Tailwind page at `/`, the StyleX page at `/stylex/`, and the Solid demo at `/solid/`, which
 * the build builds from apps/demo-solid (vite.config.ts). The PR gate runs it after `ci:build`.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));

/** Each page and the path its own assets live under. */
const pages = [
  { assets: "/assets/", page: "index.html" },
  { assets: "/assets/", page: "stylex/index.html" },
  { assets: "/solid/assets/", page: "solid/index.html" },
] as const;

const problems: string[] = [];
for (const { assets, page } of pages) {
  if (!existsSync(`${dist}${page}`)) {
    problems.push(`dist/${page} is missing`);
    continue;
  }
  const html = readFileSync(`${dist}${page}`, "utf8");
  const entries = [...html.matchAll(/<script type="module"[^>]*\ssrc="([^"]+)"/gu)].map(
    (match) => match[1] ?? "",
  );
  if (entries.length === 0) problems.push(`dist/${page} has no module script`);
  const linked = [
    ...entries,
    ...[...html.matchAll(/<link rel="(?:stylesheet|modulepreload)"[^>]*\shref="([^"]+)"/gu)].map(
      (match) => match[1] ?? "",
    ),
  ];
  for (const path of linked) {
    if (!path.startsWith(assets)) problems.push(`dist/${page} links ${path}, outside ${assets}`);
    else if (!existsSync(`${dist}${path.slice(1)}`))
      problems.push(`dist/${page} links ${path}, which is missing`);
  }
}

if (problems.length > 0) {
  console.error(`The demo's build is missing parts of its pages:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(
  `The demo's build has its ${pages.length} pages and every script and stylesheet they link.`,
);
