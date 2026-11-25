import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

// The Solid registry's items and their React twins (ADR 0279, point 3): one look, one set of
// words and one layout, in shared files both list, so the Solid files hold only Solid.

const registry = join(import.meta.dirname, "..");
const solid = join(registry, "solid");

interface Manifest {
  readonly files?: readonly { readonly path: string; readonly target: string }[];
  readonly registryDependencies?: readonly string[];
}

const manifestOf = (folder: string) =>
  JSON.parse(readFileSync(join(folder, "registry-item.json"), "utf8")) as Manifest;
const shared = (manifest: Manifest) =>
  (manifest.files ?? []).filter(({ path }) => path.startsWith("registry/shared/"));

const solidItems = readdirSync(solid).filter((name) =>
  existsSync(join(solid, name, "registry-item.json")),
);

test("the Solid registry has the items ported so far", () => {
  expect(solidItems.toSorted()).toEqual([
    "base-tokens",
    "calendar",
    "calendar-history-toast",
    "calendar-theme",
    "calendar-ui",
    "list-view",
    "month-view",
    "recurrence-scope-dialog",
    "time-grid-view",
    "year-view",
  ]);
});

describe.each(solidItems.filter((name) => existsSync(join(registry, name, "registry-item.json"))))(
  "%s",
  (name) => {
    const react = manifestOf(join(registry, name));
    const own = manifestOf(join(solid, name));

    test("lists every shared file its React twin lists, at the same target", () => {
      expect(shared(own)).toEqual(shared(react));
    });

    test("installs the items its React twin installs", () => {
      expect(own.registryDependencies ?? []).toEqual(react.registryDependencies ?? []);
    });

    test("installs its files where its React twin installs them", () => {
      const reactTargets = new Set((react.files ?? []).map(({ target }) => target));
      const missing = (own.files ?? [])
        .map(({ target }) => target)
        .filter((target) => !reactTargets.has(target));
      // The Solid icons are inline SVG in the kit until lucide-solid supports Solid 2.0.
      expect(missing).toEqual(name === "calendar-ui" ? ["@components/calendar/ui/icons.tsx"] : []);
    });

    test("holds no class strings of its own: they come from the shared .styles.ts files", () => {
      for (const { path } of own.files ?? []) {
        if (!path.startsWith("registry/solid/")) continue;
        const source = readFileSync(join(registry, "..", path), "utf8");
        // A Tailwind class list is a string with a space and a utility in it.
        expect(source, path).not.toMatch(/class="[^"]*\s[^"]*"/u);
        expect(source, path).not.toMatch(/["'`](?:flex|grid|absolute|relative|sticky) [a-z]/u);
      }
    });
  },
);
