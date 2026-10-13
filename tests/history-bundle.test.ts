import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { build } from "vite-plus";
import { afterAll, beforeAll, expect, test } from "vite-plus/test";

/**
 * Undo and redo are opt-in (#227): an app that doesn't import them must bundle none of their code.
 * The facade re-exports them, as it does the pointer adapter, so a bundle of its other exports is
 * built from workspace source, minified, and must keep no module from the history's files.
 */
const facadeEntry = resolve("packages/calendar/src/index.ts");
const historyExports = ["createEventHistory", "useCalendarHistory", "useCalendarHistoryShortcuts"];
const isHistoryModule = (id: string) =>
  /\/packages\/calendar-(core|react)\/src\/history(\/|\.ts$|-shortcuts\.ts$)/.test(
    id.replaceAll("\\", "/"),
  );

let directory: string;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "moltenship-history-bundle-"));
});

afterAll(async () => {
  await rm(directory, { force: true, recursive: true });
});

/** Bundles some of the facade's named exports; returns the modules that kept code, with sizes. */
async function bundledModules(names: readonly string[], file: string) {
  await writeFile(
    join(directory, file),
    `export { ${names.join(", ")} } from "@moltenship/calendar";\n`,
  );
  const output = await build({
    configFile: false,
    envFile: false,
    logLevel: "silent",
    resolve: { alias: { "@moltenship/calendar": facadeEntry } },
    root: directory,
    build: {
      write: false,
      minify: true,
      lib: { entry: join(directory, file), formats: ["es"], fileName: "bundle" },
      rollupOptions: { external: [/^react(-dom)?($|\/)/] },
    },
  });
  const [result] = Array.isArray(output) ? output : [output];
  if (!result || !("output" in result)) throw new Error("The bundle check expected a build result");
  const modules = new Map<string, number>();
  for (const chunk of result.output) {
    if (chunk.type !== "chunk") continue;
    for (const [id, module] of Object.entries(chunk.modules)) {
      if (module.renderedLength > 0) modules.set(id, module.renderedLength);
    }
  }
  return modules;
}

test(
  "an app that doesn't import the history bundles none of its code",
  { timeout: 60_000 },
  async () => {
    const facade = Object.keys((await import(facadeEntry)) as Record<string, unknown>);
    expect(facade).toEqual(expect.arrayContaining(historyExports));

    const base = await bundledModules(
      facade.filter((name) => !historyExports.includes(name)),
      "base-entry.mjs",
    );
    expect([...base.keys()].filter(isHistoryModule)).toEqual([]);
    // The bundle saw the facade at all: it kept the transaction engine every editable root uses.
    expect([...base.keys()].some((id) => id.includes("event-transactions"))).toBe(true);

    // A bundle of the history exports keeps them, which shows the check can see the history.
    const history = await bundledModules(historyExports, "history-entry.mjs");
    expect([...history.keys()].filter(isHistoryModule).length).toBeGreaterThan(0);
  },
);
