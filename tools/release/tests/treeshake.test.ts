import { describe, expect, test } from "vite-plus/test";

import { featureProblems, moduleSections, sourceProblems } from "../src/treeshake";

const feature = {
  name: "the history",
  exports: ["createHistory"],
  files: ["src/history.ts", "src/history-types.ts"],
  markers: ["canRedo", "whenSettled"],
};

describe("featureProblems", () => {
  test("passes when only the feature's bundle has its markers", () => {
    expect(featureProblems(feature, "function x(){}", "a.canRedo;b.whenSettled")).toEqual([]);
  });

  test("names markers left in the other bundle, and markers the feature's bundle lacks", () => {
    expect(featureProblems(feature, "a.canRedo", "b.whenSettled")).toEqual([
      '@moltenship/calendar without the history still bundles "canRedo"',
      'a bundle of the history has no "canRedo", so the check can\'t see the feature',
    ]);
  });
});

describe("sourceProblems", () => {
  test("passes when only the feature's bundle has code from its files", () => {
    expect(
      sourceProblems(
        feature,
        new Map([
          ["src/root.ts", "var a = 1;"],
          ["src/history.ts", ""],
        ]),
        new Map([["src/history.ts", "function undo() {}"]]),
      ),
    ).toEqual([]);
  });

  test("names files left in the other bundle, and a feature bundle without its files", () => {
    expect(
      sourceProblems(
        feature,
        new Map([["src/history.ts", "var snapshot = Object.freeze({});"]]),
        new Map(),
      ),
    ).toEqual([
      "@moltenship/calendar without the history, bundled from source, keeps code from src/history.ts: var snapshot = Object.freeze({});",
      "a source bundle of the history has none of its files, so the check can't see them",
    ]);
  });
});

describe("moduleSections", () => {
  test("splits a bundle by module, without imports and the bundle's exports", () => {
    const code = [
      "// src/history.ts",
      'import { useMemo } from "react";',
      "",
      "// src/root.ts",
      "import {",
      "  useState",
      '} from "react";',
      "var root = 1;",
      "export {",
      "  root",
      "};",
    ].join("\n");
    expect(moduleSections(code)).toEqual(
      new Map([
        ["src/history.ts", ""],
        ["src/root.ts", "var root = 1;"],
      ]),
    );
  });
});
