import { describe, expect, test } from "vite-plus/test";

import { registryProblems, type RegistryCompatibility } from "../src/registry";

function registry(version: string, range = `^${version}`): RegistryCompatibility {
  return {
    runtime: { "@moltenship/calendar": version },
    items: [
      {
        name: "month-view",
        compatibility: { "@moltenship/calendar": range },
        dependencies: ["@base-ui/react", `@moltenship/calendar@${range}`],
      },
    ],
  };
}

const packed = (version: string) => new Map([["@moltenship/calendar", version]]);

describe("registry against the release", () => {
  test("a registry built for the packed version passes, prereleases included", () => {
    expect(registryProblems(registry("1.0.0-rc.1"), packed("1.0.0-rc.1"))).toEqual([]);
    expect(registryProblems(registry("1.0.0"), packed("1.0.0"))).toEqual([]);
  });

  test("a registry built for another version fails", () => {
    expect(registryProblems(registry("0.0.0"), packed("1.0.0"))).toEqual([
      "the registry is built for @moltenship/calendar@0.0.0, not 1.0.0",
      "month-view asks for @moltenship/calendar@^0.0.0, which 1.0.0 doesn't satisfy",
      "month-view asks for @moltenship/calendar@^0.0.0, which 1.0.0 doesn't satisfy",
    ]);
  });

  test("a registry that names no calendar version fails, rather than passing vacuously", () => {
    expect(registryProblems({ runtime: {}, items: [] }, packed("1.0.0"))).toEqual([
      "the registry names no @moltenship/calendar version, so nothing ties it to the release",
    ]);
  });

  test("a runtime package that doesn't publish fails", () => {
    expect(registryProblems(registry("1.0.0"), new Map())).toEqual([
      "the registry needs @moltenship/calendar, which doesn't publish",
    ]);
  });
});
