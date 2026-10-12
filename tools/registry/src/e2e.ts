import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { buildRegistry } from "./build";
import { checkBuiltRegistry, fullItemName, importsOf } from "./check";
import {
  describeIncompatibility,
  findIncompatibleItems,
  type RegistryManifest,
} from "./compatibility";
import { dragAndDropPackages } from "./config";
import { itemClosure } from "./items";
import { packRuntimePackages } from "./packages";
import { startLocalRegistryServer } from "./server";

/**
 * The install test. Clean Vite and Next.js apps made by `shadcn init` run
 * `shadcn add <url>/calendar-full.json` against a registry built and served locally, then
 * typecheck and build. Needs the network for npm and shadcn's own components.
 *
 * - `REGISTRY_E2E_PACKAGES=local` (default): the runtime packages aren't on npm yet, so they are
 *   packed from the workspace and served from a local npm registry for the `@moltenship` scope.
 *   `npm` installs the published packages instead, once they exist.
 * - `REGISTRY_E2E_TARBALLS=<dir>`: serve these tarballs instead of packing, such as a release dry
 *   run's.
 * - `REGISTRY_E2E_APPS=vite,next`: which apps to make.
 * - `REGISTRY_E2E_KEEP=1`: keep the temporary folder to look at the apps.
 */

const workspaceRoot = resolve(import.meta.dirname, "../../..");
const fixture = resolve(import.meta.dirname, "../consumers/calendar-page.tsx");
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
      await writeFile(
        join(root, "app/page.tsx"),
        'import CalendarPage from "./calendar-page";\n\nexport default function Page() {\n  return <CalendarPage />;\n}\n',
      );
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
      // Missing: reported as incompatible.
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

  const versions = await installedVersions(root, Object.keys(manifest.runtime));
  problems.push(
    ...findIncompatibleItems(manifest, versions, [fullItemName]).map(describeIncompatibility),
  );

  const css = await readFile(join(root, app.css), "utf8");
  for (const token of ["--calendar-grid:", "--color-calendar-event:", '[data-color="blue"]']) {
    if (!css.includes(token)) problems.push(`${app.css} has no ${token}`);
  }
  return problems;
}

async function testApp(
  app: App,
  directory: string,
  registryUrl: string,
  manifest: RegistryManifest,
  npmRegistry: string | null,
): Promise<{ readonly app: string; readonly files: number; readonly seconds: number }> {
  const started = performance.now();
  // Each app gets its own temporary folder: `shadcn init` clones its template into one named by the
  // current millisecond, which two apps starting together would share.
  const temporary = join(directory, `${app.name}-tmp`);
  await mkdir(temporary, { recursive: true });
  const env = { npm_config_user_agent: pnpmUserAgent, TMPDIR: temporary };
  const root = join(directory, app.name);

  log(app.name, "shadcn init");
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
  if (npmRegistry) {
    // The packed runtime packages, for the @moltenship scope only.
    await writeFile(join(root, ".npmrc"), `@moltenship:registry=${npmRegistry}\n`);
  }
  if (app.componentsAlias !== "@/components") {
    await edit(join(root, "components.json"), (source) =>
      source.replace('"components": "@/components"', `"components": "${app.componentsAlias}"`),
    );
  }

  log(app.name, `shadcn add ${registryUrl}/${fullItemName}.json`);
  await run(
    process.execPath,
    [shadcn, "add", `${registryUrl}/${fullItemName}.json`, "--yes"],
    root,
    env,
  );

  const problems = await verifyInstall(app, root, manifest);
  if (problems.length > 0) {
    throw new Error(
      `[${app.name}] the install is wrong:\n${problems.map((line) => `- ${line}`).join("\n")}`,
    );
  }

  await app.setUp(root);
  const page = (await readFile(fixture, "utf8")).replaceAll(
    "@/components/calendar/",
    `${app.componentsAlias}/calendar/`,
  );
  await mkdir(dirname(join(root, app.page)), { recursive: true });
  await writeFile(join(root, app.page), page);

  log(app.name, "typecheck");
  for (const args of app.typecheck) await run("pnpm", args, root, env);
  log(app.name, "build");
  await run("pnpm", ["run", "build"], root, env);

  const seconds = Math.round((performance.now() - started) / 1000);
  log(app.name, `passed in ${seconds}s`);
  return { app: app.name, files: expectedFiles(manifest).length, seconds };
}

const packageSource = process.env.REGISTRY_E2E_PACKAGES ?? "local";
if (packageSource !== "local" && packageSource !== "npm") {
  throw new Error(`REGISTRY_E2E_PACKAGES must be "local" or "npm", not "${packageSource}"`);
}
const wantedApps = (process.env.REGISTRY_E2E_APPS ?? "vite,next").split(",");
const directory = await mkdtemp(join(tmpdir(), "time-registry-e2e-"));
const siteDir = join(directory, "site");
let tarballDir: string | undefined;

try {
  if (packageSource === "local") {
    tarballDir = process.env.REGISTRY_E2E_TARBALLS
      ? resolve(process.env.REGISTRY_E2E_TARBALLS)
      : join(directory, "tarballs");
    if (!process.env.REGISTRY_E2E_TARBALLS) {
      await mkdir(tarballDir, { recursive: true });
      const packed = await packRuntimePackages(workspaceRoot, ["@moltenship/calendar"], tarballDir);
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
    console.log(`Serving ${manifest.items.length} items at ${registryUrl}`);

    // Both apps finish before the server stops and the folder goes, even when one fails.
    const settled = await Promise.allSettled(
      apps
        .filter(({ name }) => wantedApps.includes(name))
        .map((app) =>
          testApp(
            app,
            directory,
            registryUrl,
            manifest,
            packageSource === "local" ? server.npmRegistry : null,
          ),
        ),
    );
    const failures = settled.flatMap((result) =>
      result.status === "rejected"
        ? [result.reason instanceof Error ? result.reason.message : String(result.reason)]
        : [],
    );
    if (failures.length > 0) throw new Error(failures.join("\n\n"));
    const results = settled.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    console.log(`REGISTRY_E2E ${JSON.stringify({ packages: packageSource, apps: results })}`);
  } finally {
    await server.close();
  }
} finally {
  if (process.env.REGISTRY_E2E_KEEP === "1") console.log(`Kept ${directory}`);
  else await rm(directory, { force: true, recursive: true });
}
