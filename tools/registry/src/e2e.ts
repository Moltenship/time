import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { parse } from "yaml";

import { buildRegistry } from "./build";
import { checkBuiltRegistry, fullItemName, importsOf, runtimeProblems } from "./check";
import type { RegistryManifest } from "./compatibility";
import {
  defaultRegistryBaseUrl,
  dragAndDropPackages,
  frameworkBaseUrl,
  registryNamespace,
  solidRegistry,
} from "./config";
import { itemClosure } from "./items";
import { servedPackageProblems } from "./lockfile";
import { packRuntimePackages } from "./packages";
import { startLocalRegistryServer, type LocalRegistryServer } from "./server";

/**
 * The install test. Clean Vite and Next.js apps made by `shadcn init` run
 * `shadcn add <url>/calendar-full.json` against a registry built and served locally, then
 * typecheck and build. A clean Solid 2.0 app, set up by hand as the Solid docs say (no
 * `shadcn init`), adds the Solid registry's items by its namespace and builds too (ADR 0279,
 * point 4). Needs the network for npm and shadcn's own components.
 *
 * - `REGISTRY_E2E_PACKAGES=local` (default): the runtime packages are packed from the workspace,
 *   so the test checks the registry against the code beside it, and served from a local npm
 *   registry for the `@moltenship` scope. `npm` installs the published packages instead.
 * - `REGISTRY_E2E_TARBALLS=<dir>`: serve these tarballs instead of packing, such as a release dry
 *   run's. Either way, each app's lockfile must have our packages with the served tarballs' hashes.
 * - `REGISTRY_E2E_APPS=vite,next,solid`: which apps to make.
 * - `REGISTRY_E2E_KEEP=1`: keep the temporary folder to look at the apps; `failed`: only when an app
 *   fails.
 *
 * It prints `REGISTRY_E2E <json>` when both apps pass, with the hash of each tarball it served, and
 * `REGISTRY_E2E_FAILED <json>` naming each app that failed and its step.
 */

const workspaceRoot = resolve(import.meta.dirname, "../../..");
const fixture = resolve(import.meta.dirname, "../consumers/calendar-page.tsx");
/** The Solid app's page, `components.json` and stylesheet, which the docs include. */
// The Solid docs show these files, so the test installs what a reader copies.
const solidConsumer = resolve(import.meta.dirname, "../../../apps/showcase/content/examples/solid");
const shadcn = createRequire(import.meta.url).resolve("shadcn");
/** shadcn picks the package manager from the user agent, as `pnpm dlx shadcn` would set it. */
const pnpmUserAgent = `pnpm/${process.env.npm_config_user_agent?.match(/pnpm\/(\S+)/u)?.[1] ?? "12"} node/${process.version}`;

interface App {
  readonly name: "vite" | "next";
  /** The `components` alias the app uses; Vite uses a non-default one to prove targets follow it. */
  readonly componentsAlias: string;
  /** Where that alias points, from the app's root. */
  readonly componentsDir: string;
  readonly css: string;
  readonly page: string;
  /** Applies the setup the Installation docs ask for, and mounts the page. */
  readonly setUp: (root: string) => Promise<void>;
  readonly typecheck: readonly (readonly string[])[];
}

async function edit(path: string, change: (source: string) => string): Promise<void> {
  const source = await readFile(path, "utf8");
  const changed = change(source);
  if (changed === source) throw new Error(`Nothing changed in ${path}`);
  await writeFile(path, changed);
}

/**
 * The Next.js app's page, a Server Component. Besides mounting the client page, it imports every
 * registry module that page does, straight from the server, as an app may. Next.js fails the
 * build on a component's hooks unless it declares its client boundary (#190).
 */
async function serverPage(): Promise<string> {
  const modules = importsOf(await readFile(fixture, "utf8")).filter((specifier) =>
    specifier.startsWith("@/components/calendar/"),
  );
  return [
    ...modules.map((specifier) => `import "${specifier}";`),
    'import CalendarPage from "./calendar-page";',
    "",
    "export default function Page() {",
    "  return <CalendarPage />;",
    "}",
    "",
  ].join("\n");
}

/**
 * Names ui-sdk's layer before Tailwind, as the Installation docs ask, so the kit's controls keep
 * their look. It fails when the stylesheet doesn't import Tailwind, rather than add the line
 * somewhere the docs don't say.
 */
function withUiSdkLayer(css: string): string {
  return css.replace(/^@import ["']tailwindcss["'];?$/mu, (line) => `@layer ui-sdk;\n${line}`);
}

/** Temporal's types ship in TypeScript's `ESNext` library, as the Installation docs say. */
function withEsNextLib(tsconfig: string): string {
  return tsconfig.replace(/"lib":\s*\[[^\]]*\]/u, '"lib": ["ESNext", "DOM", "DOM.Iterable"]');
}

const apps: readonly App[] = [
  {
    name: "vite",
    componentsAlias: "@/shared/components",
    componentsDir: "src/shared/components",
    css: "src/index.css",
    page: "src/calendar-page.tsx",
    setUp: async (root) => {
      await edit(join(root, "tsconfig.app.json"), withEsNextLib);
      await writeFile(
        join(root, "src/App.tsx"),
        'import CalendarPage from "./calendar-page";\n\nexport default function App() {\n  return <CalendarPage />;\n}\n',
      );
    },
    typecheck: [["exec", "tsc", "-b"]],
  },
  {
    name: "next",
    componentsAlias: "@/components",
    componentsDir: "components",
    css: "app/globals.css",
    page: "app/calendar-page.tsx",
    setUp: async (root) => {
      // The Next.js template ships TypeScript 5, whose ESNext library has no Temporal types. The
      // Installation docs ask for TypeScript 6 or later.
      await run("pnpm", ["add", "--save-dev", "typescript@^6"], root);
      await writeFile(join(root, "app/page.tsx"), await serverPage());
    },
    typecheck: [
      ["exec", "next", "typegen"],
      ["exec", "tsc", "--noEmit"],
    ],
  },
];

function log(app: string, message: string): void {
  console.log(`[${app}] ${message}`);
}

async function run(
  command: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv = {},
): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, CI: "1", NEXT_TELEMETRY_DISABLED: "1", NO_COLOR: "1", ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise(output);
      else
        reject(
          new Error(
            `${command} ${args.join(" ")} failed in ${cwd} (${code}):\n${output.slice(-6000)}`,
          ),
        );
    });
  });
}

async function listFiles(directory: string): Promise<string[]> {
  if (!existsSync(directory)) return [];
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(directory.length + 1))
    .sort();
}

async function installedVersions(
  root: string,
  names: readonly string[],
): Promise<Record<string, string>> {
  const versions: Record<string, string> = {};
  for (const name of names) {
    try {
      const manifest = JSON.parse(
        await readFile(join(root, "node_modules", name, "package.json"), "utf8"),
      ) as { readonly version: string };
      versions[name] = manifest.version;
    } catch {
      // Missing: verifyInstall reports it.
    }
  }
  return versions;
}

/** What `shadcn add calendar-full` should write under the components alias, and nothing else. */
function expectedFiles(manifest: RegistryManifest): string[] {
  const byName = new Map(manifest.items.map((item) => [item.name, item]));
  return itemClosure(fullItemName, byName, ({ items }) => items)
    .flatMap(({ targets }) => targets)
    .map((target) => target.replace(/^@components\//u, ""))
    .sort();
}

async function verifyInstall(
  app: App,
  root: string,
  manifest: RegistryManifest,
  served: ReadonlyMap<string, string> | null,
): Promise<string[]> {
  const problems: string[] = [];
  const componentsDir = join(root, app.componentsDir);
  const expected = expectedFiles(manifest);
  const calendarFiles = await listFiles(join(componentsDir, "calendar"));
  const installed = calendarFiles.map((file) => `calendar/${file}`);
  if (installed.join() !== expected.join()) {
    const missing = expected.filter((file) => !installed.includes(file));
    const extra = installed.filter((file) => !expected.includes(file));
    problems.push(
      `calendar files differ: missing ${missing.join(", ") || "none"}; extra ${extra.join(", ") || "none"}`,
    );
  }

  for (const file of installed) {
    const source = await readFile(join(componentsDir, file), "utf8");
    for (const specifier of importsOf(source)) {
      if (specifier.startsWith("@registry/")) problems.push(`${file} imports ${specifier}`);
      if (
        app.componentsAlias !== "@/components" &&
        specifier.startsWith("@/components/") &&
        !specifier.startsWith("@/components/ui/")
      ) {
        problems.push(`${file} imports ${specifier}, not the app's ${app.componentsAlias} alias`);
      }
    }
  }

  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
    readonly dependencies?: Record<string, string>;
    readonly devDependencies?: Record<string, string>;
  };
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  for (const name of Object.keys(dependencies)) {
    if (dragAndDropPackages.some((pattern) => pattern.test(name))) {
      problems.push(`package.json depends on ${name}, but drag and drop stays optional`);
    }
  }
  for (const name of Object.keys(manifest.runtime)) {
    if (!dependencies[name]) problems.push(`package.json doesn't depend on ${name}`);
  }

  if (served) {
    const lockfile = await readFile(join(root, "pnpm-lock.yaml"), "utf8");
    problems.push(...servedPackageProblems(lockfile, served, Object.keys(manifest.runtime)));
  }

  // calendar-full's range covers its whole install, so it holds for every item.
  const versions = await installedVersions(root, Object.keys(manifest.runtime));
  const full = manifest.items.find(({ name }) => name === fullItemName)!;
  problems.push(...runtimeProblems(fullItemName, full.compatibility, versions, "the app"));

  const css = await readFile(join(root, app.css), "utf8");
  for (const token of ["--calendar-grid:", "--color-calendar-event:", '[data-color="blue"]']) {
    if (!css.includes(token)) problems.push(`${app.css} has no ${token}`);
  }
  return problems;
}

/** An app's failure, with the step it failed at. */
class AppFailure extends Error {
  readonly app: string;
  readonly step: string;

  constructor(app: string, step: string, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.app = app;
    this.step = step;
  }
}

async function testApp(
  app: App,
  directory: string,
  registryUrl: string,
  manifest: RegistryManifest,
  /** The local npm registry for the `@moltenship` scope, or none to install from npm. */
  local: Pick<LocalRegistryServer, "npmRegistry" | "integrity"> | null,
): Promise<{ readonly app: string; readonly files: number; readonly seconds: number }> {
  const started = performance.now();
  // Each app gets its own temporary folder: `shadcn init` clones its template into one named by the
  // current millisecond, which two apps starting together would share.
  const temporary = join(directory, `${app.name}-tmp`);
  await mkdir(temporary, { recursive: true });
  const env = { npm_config_user_agent: pnpmUserAgent, TMPDIR: temporary };
  const root = join(directory, app.name);
  let step = "";
  const begin = (name: string, message = name) => {
    step = name;
    log(app.name, message);
  };

  try {
    begin("shadcn init");
    await run(
      process.execPath,
      [
        shadcn,
        "init",
        "--template",
        app.name,
        "--base",
        "base",
        "--preset",
        "nova",
        "--name",
        app.name,
        "--yes",
        "--no-monorepo",
      ],
      directory,
      env,
    );
    if (local) {
      // The packed runtime packages, for the @moltenship scope only.
      await writeFile(join(root, ".npmrc"), `@moltenship:registry=${local.npmRegistry}\n`);
    }
    if (app.componentsAlias !== "@/components") {
      await edit(join(root, "components.json"), (source) =>
        source.replace('"components": "@/components"', `"components": "${app.componentsAlias}"`),
      );
    }

    begin("shadcn add", `shadcn add ${registryUrl}/${fullItemName}.json`);
    await run(
      process.execPath,
      [shadcn, "add", `${registryUrl}/${fullItemName}.json`, "--yes"],
      root,
      env,
    );

    step = "the install";
    const problems = await verifyInstall(app, root, manifest, local?.integrity ?? null);
    if (problems.length > 0) {
      throw new Error(`the install is wrong:\n${problems.map((line) => `- ${line}`).join("\n")}`);
    }

    step = "set up";
    await app.setUp(root);
    await edit(join(root, app.css), withUiSdkLayer);
    const page = (await readFile(fixture, "utf8")).replaceAll(
      "@/components/calendar/",
      `${app.componentsAlias}/calendar/`,
    );
    await mkdir(dirname(join(root, app.page)), { recursive: true });
    await writeFile(join(root, app.page), page);

    begin("typecheck");
    for (const args of app.typecheck) await run("pnpm", args, root, env);
    begin("build");
    await run("pnpm", ["run", "build"], root, env);
  } catch (error) {
    throw new AppFailure(app.name, step, error);
  }

  const seconds = Math.round((performance.now() - started) / 1000);
  log(app.name, `passed in ${seconds}s`);
  return { app: app.name, files: expectedFiles(manifest).length, seconds };
}

/** The Solid items the Solid app adds, by the registry's namespace, as the Solid docs do. */
const solidItems = [
  "base-tokens",
  "calendar-ui",
  "calendar",
  "list-view",
  "month-view",
  "resource-timeline-view",
  "scrolling-list-view",
  "scrolling-month-view",
  "scrolling-time-grid-view",
  "recurrence-scope-dialog",
  "calendar-history-toast",
  "time-grid-view",
  "year-view",
  "resource-columns-view",
] as const;

/** The versions the workspace builds and tests with, from its catalog. */
async function catalogVersion(name: string): Promise<string> {
  const workspace = parse(await readFile(join(workspaceRoot, "pnpm-workspace.yaml"), "utf8")) as {
    readonly catalog: Record<string, string>;
  };
  const version = workspace.catalog[name];
  if (version === undefined) throw new Error(`The catalog has no ${name}`);
  return version;
}

/**
 * A clean Solid 2.0 app with the four things the Solid docs ask for: Tailwind CSS 4, an `@/*` alias,
 * a hand-written `components.json` that names the registry, and TypeScript's ESNext library for
 * Temporal's types. Solid, Vite and Solid's compiler come at the workspace's versions.
 */
async function writeSolidApp(root: string, registryUrl: string): Promise<void> {
  await mkdir(join(root, "src"), { recursive: true });
  const versions = Object.fromEntries(
    await Promise.all(
      ["@solidjs/vite-plugin", "@solidjs/web", "@tailwindcss/vite", "solid-js", "tailwindcss"].map(
        async (name) => [name, await catalogVersion(name)] as const,
      ),
    ),
  );
  const files: Record<string, string> = {
    "package.json": JSON.stringify(
      {
        name: "solid",
        private: true,
        type: "module",
        scripts: { build: "vite build" },
        dependencies: {
          "@solidjs/web": versions["@solidjs/web"],
          "solid-js": versions["solid-js"],
        },
        devDependencies: {
          "@solidjs/vite-plugin": versions["@solidjs/vite-plugin"],
          "@tailwindcss/vite": versions["@tailwindcss/vite"],
          tailwindcss: versions["tailwindcss"],
          typescript: "^6",
          vite: "^8",
        },
      },
      null,
      2,
    ),
    "tsconfig.json": JSON.stringify(
      {
        compilerOptions: {
          target: "ESNext",
          module: "ESNext",
          moduleResolution: "bundler",
          lib: ["ESNext", "DOM", "DOM.Iterable"],
          jsx: "preserve",
          jsxImportSource: "@solidjs/web",
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          types: ["vite/client"],
          paths: { "@/*": ["./src/*"] },
        },
        include: ["src"],
      },
      null,
      2,
    ),
    "vite.config.ts": [
      'import solid from "@solidjs/vite-plugin";',
      'import tailwindcss from "@tailwindcss/vite";',
      'import { defineConfig } from "vite";',
      "",
      "export default defineConfig({",
      "  plugins: [solid(), tailwindcss()],",
      "  resolve: { tsconfigPaths: true },",
      "});",
      "",
    ].join("\n"),
    "index.html": [
      "<!doctype html>",
      '<html lang="en">',
      "  <body>",
      '    <div id="root"></div>',
      '    <script type="module" src="/src/main.tsx"></script>',
      "  </body>",
      "</html>",
      "",
    ].join("\n"),
    "src/main.tsx": [
      'import { render } from "@solidjs/web";',
      "",
      'import CalendarPage from "./calendar-page";',
      'import MonthPage from "./month-page";',
      'import ResourceColumnsPage from "./resource-columns-page";',
      'import ScrollingAgendaPage from "./scrolling-agenda-page";',
      'import ScrollingMonthPage from "./scrolling-month-page";',
      'import ScrollingWeekPage from "./scrolling-week-page";',
      'import TimelinePage from "./timeline-page";',
      'import UndoToastPage from "./undo-toast";',
      'import WeekAnnotations from "./week-annotations";',
      'import WeekPage from "./week-page";',
      'import YearPage from "./year-page";',
      'import "./app.css";',
      "",
      "// Each page by its hash: #annotations, #month, #resources, #scrolling-agenda, #scrolling-month,",
      "// #scrolling-week, #timeline, #week and #year are their docs pages, #undo the toast's,",
      "// anything else Installation's.",
      "const pages = {",
      '  "#annotations": WeekAnnotations,',
      '  "#month": MonthPage,',
      '  "#resources": ResourceColumnsPage,',
      '  "#scrolling-agenda": ScrollingAgendaPage,',
      '  "#scrolling-month": ScrollingMonthPage,',
      '  "#scrolling-week": ScrollingWeekPage,',
      '  "#timeline": TimelinePage,',
      '  "#undo": UndoToastPage,',
      '  "#week": WeekPage,',
      '  "#year": YearPage,',
      "};",
      "",
      "render(",
      "  () => {",
      "    const Page = pages[location.hash as keyof typeof pages] ?? CalendarPage;",
      "    return <Page />;",
      "  },",
      '  document.getElementById("root")!,',
      ");",
      "",
    ].join("\n"),
  };
  for (const [path, content] of Object.entries(files)) {
    await writeFile(join(root, path), path.endsWith(".json") ? `${content}\n` : content);
  }
  // The files the docs show (apps/showcase/content/docs/solid), so the docs are what this tests.
  const components = await readFile(join(solidConsumer, "components.json"), "utf8");
  const published = frameworkBaseUrl(defaultRegistryBaseUrl, solidRegistry);
  if (!components.includes(`"${published}/{name}.json"`)) {
    throw new Error(`examples/solid/components.json names no ${published} registry`);
  }
  await writeFile(
    join(root, "components.json"),
    components.replace(published, frameworkBaseUrl(registryUrl, solidRegistry)),
  );
  await writeFile(
    join(root, "src/app.css"),
    await readFile(join(solidConsumer, "app.css"), "utf8"),
  );
  for (const page of [
    "calendar-page.tsx",
    "month-page.tsx",
    "resource-columns-page.tsx",
    "scrolling-agenda-page.tsx",
    "scrolling-month-page.tsx",
    "scrolling-week-page.tsx",
    "timeline-page.tsx",
    "undo-toast.tsx",
    "week-annotations.tsx",
    "week-page.tsx",
    "year-page.tsx",
  ]) {
    await writeFile(join(root, "src", page), await readFile(join(solidConsumer, page), "utf8"));
  }
}

/** What `shadcn add` of the Solid items should write under the components alias. */
function expectedSolidFiles(manifest: RegistryManifest): string[] {
  const byName = new Map(manifest.items.map((item) => [item.name, item]));
  return [
    ...new Set(
      solidItems.flatMap((name) =>
        itemClosure(name, byName, ({ items }) => items).flatMap(({ targets }) => targets),
      ),
    ),
  ]
    .map((target) => target.replace(/^@components\//u, ""))
    .sort();
}

async function verifySolidInstall(
  root: string,
  manifest: RegistryManifest,
  served: ReadonlyMap<string, string> | null,
): Promise<string[]> {
  const problems: string[] = [];
  const componentsDir = join(root, "src/components");
  const expected = expectedSolidFiles(manifest);
  const installed = (await listFiles(join(componentsDir, "calendar"))).map(
    (file) => `calendar/${file}`,
  );
  if (installed.join() !== expected.join()) {
    const missing = expected.filter((file) => !installed.includes(file));
    const extra = installed.filter((file) => !expected.includes(file));
    problems.push(
      `calendar files differ: missing ${missing.join(", ") || "none"}; extra ${extra.join(", ") || "none"}`,
    );
  }
  for (const file of installed) {
    const source = await readFile(join(componentsDir, file), "utf8");
    for (const specifier of importsOf(source)) {
      if (specifier.startsWith("@registry/")) problems.push(`${file} imports ${specifier}`);
      if (/^(?:react|react-dom|@moltenship\/calendar)$/u.test(specifier)) {
        problems.push(`${file} imports ${specifier}, which a Solid app doesn't have`);
      }
    }
  }

  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
    readonly dependencies?: Record<string, string>;
    readonly devDependencies?: Record<string, string>;
  };
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  for (const name of Object.keys(dependencies)) {
    if (/^(?:react|react-dom|lucide-react|@base-ui\/react)$/u.test(name)) {
      problems.push(`package.json depends on ${name}, which a Solid app never uses`);
    }
  }
  for (const name of Object.keys(manifest.runtime)) {
    if (!dependencies[name]) problems.push(`package.json doesn't depend on ${name}`);
  }
  if (served) {
    const lockfile = await readFile(join(root, "pnpm-lock.yaml"), "utf8");
    problems.push(...servedPackageProblems(lockfile, served, Object.keys(manifest.runtime)));
  }
  const versions = await installedVersions(root, Object.keys(manifest.runtime));
  const list = manifest.items.find(({ name }) => name === "list-view")!;
  problems.push(...runtimeProblems("list-view", list.compatibility, versions, "the app"));

  const css = await readFile(join(root, "src/app.css"), "utf8");
  for (const token of [
    "--calendar-grid:",
    "--color-calendar-event:",
    '[data-color="blue"]',
    "--background:",
    "@custom-variant dark",
  ]) {
    if (!css.includes(token)) problems.push(`src/app.css has no ${token}`);
  }
  return problems;
}

async function testSolidApp(
  directory: string,
  registryUrl: string,
  manifest: RegistryManifest,
  local: Pick<LocalRegistryServer, "npmRegistry" | "integrity"> | null,
): Promise<{ readonly app: string; readonly files: number; readonly seconds: number }> {
  const started = performance.now();
  const name = "solid";
  const temporary = join(directory, `${name}-tmp`);
  await mkdir(temporary, { recursive: true });
  const env = { npm_config_user_agent: pnpmUserAgent, TMPDIR: temporary };
  const root = join(directory, name);
  let step = "";
  const begin = (next: string, message = next) => {
    step = next;
    log(name, message);
  };

  try {
    begin("set up", "set up a clean Solid 2.0 app");
    await writeSolidApp(root, registryUrl);
    if (local) await writeFile(join(root, ".npmrc"), `@moltenship:registry=${local.npmRegistry}\n`);
    begin("install");
    await run("pnpm", ["install"], root, env);

    const items = solidItems.map((item) => `${registryNamespace}/${item}`);
    begin("shadcn add", `shadcn add ${items.join(" ")}`);
    await run(process.execPath, [shadcn, "add", ...items, "--yes"], root, env);

    step = "the install";
    const problems = await verifySolidInstall(root, manifest, local?.integrity ?? null);
    if (problems.length > 0) {
      throw new Error(`the install is wrong:\n${problems.map((line) => `- ${line}`).join("\n")}`);
    }

    begin("typecheck");
    await run("pnpm", ["exec", "tsc", "--noEmit"], root, env);
    begin("build");
    await run("pnpm", ["run", "build"], root, env);
  } catch (error) {
    throw new AppFailure(name, step, error);
  }

  const seconds = Math.round((performance.now() - started) / 1000);
  log(name, `passed in ${seconds}s`);
  return { app: name, files: expectedSolidFiles(manifest).length, seconds };
}

const packageSource = process.env.REGISTRY_E2E_PACKAGES ?? "local";
if (packageSource !== "local" && packageSource !== "npm") {
  throw new Error(`REGISTRY_E2E_PACKAGES must be "local" or "npm", not "${packageSource}"`);
}
const wantedApps = (process.env.REGISTRY_E2E_APPS ?? "vite,next,solid").split(",");
const keep = process.env.REGISTRY_E2E_KEEP;
const directory = await mkdtemp(join(tmpdir(), "time-registry-e2e-"));
const siteDir = join(directory, "site");
let tarballDir: string | undefined;
let failed = true;

try {
  if (packageSource === "local") {
    tarballDir = process.env.REGISTRY_E2E_TARBALLS
      ? resolve(process.env.REGISTRY_E2E_TARBALLS)
      : join(directory, "tarballs");
    if (!process.env.REGISTRY_E2E_TARBALLS) {
      await mkdir(tarballDir, { recursive: true });
      const packed = await packRuntimePackages(
        workspaceRoot,
        ["@moltenship/calendar", solidRegistry.facade],
        tarballDir,
      );
      console.log(`Packed ${packed.join(", ")}`);
    }
  }

  const server = await startLocalRegistryServer({ siteDir, tarballDir });
  try {
    const registryUrl = `${server.origin}/r`;
    const manifest = await buildRegistry({
      workspaceRoot,
      outDir: join(siteDir, "r"),
      baseUrl: registryUrl,
    });
    const issues = await checkBuiltRegistry({ outDir: join(siteDir, "r"), manifest });
    if (issues.length > 0)
      throw new Error(`The built registry failed its checks:\n${issues.join("\n")}`);
    const solidOut = join(siteDir, "r", solidRegistry.path);
    const solidManifest = await buildRegistry({
      workspaceRoot,
      outDir: solidOut,
      baseUrl: registryUrl,
      framework: solidRegistry,
    });
    const solidIssues = await checkBuiltRegistry({
      outDir: solidOut,
      manifest: solidManifest,
      framework: solidRegistry,
    });
    if (solidIssues.length > 0)
      throw new Error(`The built Solid registry failed its checks:\n${solidIssues.join("\n")}`);
    console.log(
      `Serving ${manifest.items.length} items at ${registryUrl} and ${solidManifest.items.length} at ${solidManifest.baseUrl}`,
    );

    // Both apps finish before the server stops and the folder goes, even when one fails.
    const local = packageSource === "local" ? server : null;
    const settled = await Promise.allSettled([
      ...apps
        .filter(({ name }) => wantedApps.includes(name))
        .map((app) => testApp(app, directory, registryUrl, manifest, local)),
      ...(wantedApps.includes("solid")
        ? [testSolidApp(directory, registryUrl, solidManifest, local)]
        : []),
    ]);
    const failures = settled.flatMap((result) => {
      if (result.status === "fulfilled") return [];
      const { reason } = result;
      return [reason instanceof AppFailure ? reason : new AppFailure("?", "?", reason)];
    });
    if (failures.length > 0) {
      for (const { app, step, message } of failures)
        console.error(`\n[${app}] ${step} failed: ${message}`);
      console.log(
        `REGISTRY_E2E_FAILED ${JSON.stringify(failures.map(({ app, step }) => ({ app, step })))}`,
      );
      process.exitCode = 1;
    } else {
      failed = false;
      const results = settled.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      const served = packageSource === "local" ? Object.fromEntries(server.integrity) : undefined;
      console.log(
        `REGISTRY_E2E ${JSON.stringify({ packages: packageSource, apps: results, served })}`,
      );
    }
  } finally {
    await server.close();
  }
} finally {
  if (keep === "1" || (keep === "failed" && failed)) console.log(`Kept ${directory}`);
  else await rm(directory, { force: true, recursive: true });
}
