import { fileURLToPath } from "node:url";

import type { Plugin } from "vite-plus";

/** Resolves from the Solid registry's package, which depends on the Solid facade. */
const solidRegistryPackage = fileURLToPath(
  new URL("../../../registry/solid/package.json", import.meta.url),
);

/**
 * Runs the Solid registry's source in place, as tests, the a11y suite and the Solid demo do. A
 * shared file imports the facade as `@moltenship/calendar` (ADR 0279, point 3); the Solid build
 * rewrites it to `@moltenship/calendar-solid`, and this does the same at run time. Without it the
 * name would resolve, from `registry/shared`, to the React facade.
 */
export function solidRegistrySource(): Plugin {
  return {
    name: "registry:solid-source",
    enforce: "pre",
    resolveId(source, importer, options) {
      if (source !== "@moltenship/calendar" || importer?.includes("/registry/shared/") !== true) {
        return null;
      }
      return this.resolve("@moltenship/calendar-solid", solidRegistryPackage, {
        ...options,
        skipSelf: true,
      });
    },
  };
}
