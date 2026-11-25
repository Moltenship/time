import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parseSync } from "vite-plus";
import { describe, expect, test } from "vite-plus/test";

// The React and Solid kits are twins (ADR 0279, point 10): the same controls, exporting the same
// names, taking the same props from the views, and drawn from the same shared look files. An app
// that swaps a control in one framework's kit swaps the same file, with the same props, in the
// other. The a11y run's kit-twins check compares what the controls render.

const registry = join(import.meta.dirname, "..");
const reactKit = join(registry, "calendar-ui");
const solidKit = join(registry, "solid", "calendar-ui");

/** The kit's controls that come to Solid with the views that use them (ADR 0279, S6). */
const pending = ["dialog", "toast"];

/** The icons are the Solid kit's own until lucide-solid supports Solid 2.0. */
const solidOnly = ["icons"];

/**
 * Element attributes a Solid control declares again, because `@solidjs/web` types them more
 * loosely than ui-sdk's parts take them. React's controls take them from `ComponentProps`.
 */
const retyped = new Set(["disabled", "style", "type"]);

const controls = (folder: string) =>
  readdirSync(folder)
    .filter((file) => file.endsWith(".tsx"))
    .map((file) => file.slice(0, -".tsx".length))
    .toSorted();

interface Control {
  readonly exports: readonly string[];
  readonly props: ReadonlyMap<string, readonly string[]>;
  readonly shared: readonly string[];
}

interface Node {
  readonly type: string;
  readonly [key: string]: unknown;
}

const nameOf = (node: unknown) => {
  const { name, value } = (node ?? {}) as { name?: unknown; value?: unknown };
  return typeof name === "string" ? name : typeof value === "string" ? value : undefined;
};

function read(folder: string, name: string): Control {
  const path = join(folder, `${name}.tsx`);
  const { program } = parseSync(path, readFileSync(path, "utf8"), { lang: "tsx" }) as unknown as {
    program: { body: readonly Node[] };
  };
  const exports: string[] = [];
  const props = new Map<string, readonly string[]>();
  const shared: string[] = [];
  for (const statement of program.body) {
    if (statement.type === "ImportDeclaration") {
      const specifier = nameOf(statement.source) ?? "";
      if (specifier.startsWith("@registry/shared/")) shared.push(specifier);
      continue;
    }
    if (statement.type !== "ExportNamedDeclaration") continue;
    const declaration = statement.declaration as Node | null;
    if (declaration === null) {
      for (const specifier of statement.specifiers as readonly Node[]) {
        exports.push(nameOf(specifier.exported) ?? "");
      }
    } else if (declaration.type === "VariableDeclaration") {
      for (const { id } of declaration.declarations as readonly Node[])
        exports.push(nameOf(id) ?? "");
    } else {
      const exported = nameOf(declaration.id) ?? "";
      exports.push(exported);
      if (declaration.type === "TSInterfaceDeclaration") {
        const { body } = declaration.body as { body: readonly Node[] };
        props.set(
          exported,
          body.flatMap((member) => {
            const key = nameOf(member.key);
            return key === undefined ? [] : [key];
          }),
        );
      }
    }
  }
  return { exports: exports.toSorted(), props, shared: shared.toSorted() };
}

/** A React member's name in Solid: `class` for `className`. */
const inSolid = (member: string) => (member === "className" ? "class" : member);

test("the Solid kit has React's controls, less those still to come", () => {
  expect(controls(solidKit).filter((name) => !solidOnly.includes(name))).toEqual(
    controls(reactKit).filter((name) => !pending.includes(name)),
  );
});

describe.each(controls(solidKit).filter((name) => !solidOnly.includes(name)))("%s", (name) => {
  const react = read(reactKit, name);
  const solid = read(solidKit, name);

  test("exports React's names", () => {
    expect(solid.exports).toEqual(react.exports);
  });

  test("takes the props React's takes, by the same names", () => {
    for (const [interfaceName, reactMembers] of react.props) {
      const expected = reactMembers.map(inSolid);
      const solidMembers = solid.props.get(interfaceName) ?? [];
      const extra = solidMembers.filter((member) => !expected.includes(member));
      expect(
        solidMembers.filter((member) => !extra.includes(member)).toSorted(),
        interfaceName,
      ).toEqual(expected.toSorted());
      expect(
        extra.filter((member) => !retyped.has(member)),
        interfaceName,
      ).toEqual([]);
    }
  });

  test("draws its look from React's shared files", () => {
    expect(solid.shared).toEqual(react.shared);
    expect(solid.shared).toContain(`@registry/shared/calendar-ui/${name}.styles`);
  });
});
