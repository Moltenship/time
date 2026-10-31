import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

const registry = join(import.meta.dirname, "..");
const flavour = "stylex-";

function filesOf(folder: string): string[] {
  return readdirSync(folder, { recursive: true, encoding: "utf8" })
    .filter((file) => statSync(join(folder, file)).isFile())
    .filter((file) => /\.tsx?$/u.test(file) || file === "registry-item.json")
    .toSorted();
}

function read(item: string, file: string): string {
  return readFileSync(join(registry, item, file), "utf8");
}

interface Manifest {
  readonly dependencies?: readonly string[];
  readonly files?: readonly { readonly path: string; readonly target: string }[];
  readonly name: string;
  readonly registryDependencies?: readonly string[];
}

const manifestOf = (item: string) => JSON.parse(read(item, "registry-item.json")) as Manifest;

const items = readdirSync(registry).filter(
  (name) =>
    existsSync(join(registry, name, "registry-item.json")) &&
    !name.startsWith(flavour) &&
    name !== "calendar-theme",
);
const sourceFiles = (item: string) =>
  filesOf(join(registry, item)).filter((file) => file !== "registry-item.json");

function exportsOf(source: string): string[] {
  const named = source.matchAll(
    /^export (?:declare )?(?:default )?(?:async )?(?:abstract )?(?:function\*?|const|let|class|type|interface|enum) (\w+)/gmu,
  );
  const lists = source.matchAll(/^export (?:type )?\{([^}]*)\}/gmu);
  return [
    ...[...named].map(([, name]) => name!),
    ...[...lists].flatMap(([, list]) =>
      list!
        .split(",")
        .map((part) =>
          part
            .trim()
            .split(/\s+as\s+/u)
            .at(-1)!
            .replace(/^type /u, ""),
        )
        .filter(Boolean),
    ),
  ].toSorted();
}

const dataSlots = (source: string) =>
  [
    ...new Set([...source.matchAll(/data-slot"?[=:]\s*\{?"([^"]+)"/gu)].map(([, slot]) => slot!)),
  ].toSorted();

const withoutFlavour = (source: string) => source.replaceAll("@registry/stylex-", "@registry/");

describe("the StyleX flavour keeps in step with the Tailwind source", () => {
  test("every item has a StyleX item with the same files", () => {
    expect(items.length).toBeGreaterThan(10);
    for (const item of items) {
      expect(sourceFiles(`${flavour}${item}`), item).toEqual(sourceFiles(item));
    }
  });

  test("the files export the same names", () => {
    for (const item of items) {
      for (const file of sourceFiles(item)) {
        const expected = exportsOf(read(item, file)).filter(
          // The Tailwind preview's class has no StyleX equal; its styles are on the element.
          (name) => !(file === "preview-check.ts" && name === "draftCheckClassName"),
        );
        expect(exportsOf(read(`${flavour}${item}`, file)), `${item}/${file}`).toEqual(expected);
      }
    }
  });

  // The flavour also has the slots of the `ui/` parts it builds with Base UI itself.
  test("each item renders the data-slot attributes of its source", () => {
    for (const item of items) {
      const slots = (folder: string) =>
        [
          ...new Set(sourceFiles(folder).flatMap((file) => dataSlots(read(folder, file)))),
        ].toSorted();
      expect(slots(`${flavour}${item}`), item).toEqual(expect.arrayContaining(slots(item)));
    }
  });

  test("files with no styles are copies, with their imports changed", () => {
    for (const item of items) {
      for (const file of sourceFiles(item)) {
        const source = read(item, file);
        const hasStyles = /\bcn\(|class[nN]ame|<[A-Z]|\.\.\/ui\//u.test(source);
        if (file.endsWith(".tsx") || hasStyles) continue;
        // Drops the class the Tailwind preview adds, as above.
        if (file === "preview-check.ts") continue;
        expect(withoutFlavour(read(`${flavour}${item}`, file)), `${item}/${file}`).toEqual(source);
      }
    }
  });

  test("the flavour uses neither Tailwind's helpers nor the Tailwind source", () => {
    const flavourItems = [...items.map((item) => `${flavour}${item}`), `${flavour}calendar-theme`];
    for (const item of flavourItems) {
      for (const file of sourceFiles(item)) {
        const source = read(item, file);
        const imports = [...source.matchAll(/from "([^"]+)"/gu)].map(([, name]) => name!);
        const wrong = imports.filter(
          (name) =>
            name === "cn" ||
            name === "class-variance-authority" ||
            (name.startsWith("@registry/") && !name.startsWith(`@registry/${flavour}`)),
        );
        expect(wrong, `${item}/${file}`).toEqual([]);
        // A Tailwind utility left in a class name, which nothing here would style.
        expect(source, `${item}/${file}`).not.toMatch(/className="[^"]*\b(?:flex|grid|text-|bg-)/u);
      }
    }
  });

  test("popups and other animations respect reduced motion", () => {
    for (const item of items) {
      for (const file of sourceFiles(`${flavour}${item}`)) {
        const source = read(`${flavour}${item}`, file);
        if (source.includes("animationName:")) {
          expect(source, `${item}/${file}`).toContain("prefers-reduced-motion");
        }
      }
    }
  });

  test("the manifests differ only by the flavour's names and dependencies", () => {
    for (const item of items) {
      const source = manifestOf(item);
      const stylex = manifestOf(`${flavour}${item}`);
      expect(stylex.name).toBe(`${flavour}${item}`);
      expect(
        stylex.registryDependencies?.every((name) => name.startsWith("@moltenship/stylex-")),
      ).not.toBe(false);
      expect(stylex.dependencies ?? []).not.toContain("cn");
      expect(
        stylex.files?.map(({ target }) => target.replace("calendar-stylex/", "calendar/")),
      ).toEqual(source.files?.map(({ target }) => target));
    }
  });
});
