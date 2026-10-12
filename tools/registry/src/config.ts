/** The registry's name in `registry.json`, and the namespace its items use for each other. */
export const registryName = "moltenship-time";
export const registryNamespace = "@moltenship";

/**
 * Where the docs site serves the built registry. Items reach each other through URLs under it, so
 * a build for another host (a local server, a custom domain) passes its own `baseUrl`, or sets
 * `REGISTRY_BASE_URL` for the docs build.
 */
export const defaultRegistryHomepage = "https://moltenship-time.vercel.app";
export const defaultRegistryBaseUrl = `${defaultRegistryHomepage}/r`;

/** Source manifests live one folder deep under `registry/`. */
export const registrySourceDirectory = "registry";

/** The workspace package that lists, and pins, every npm package registry source imports. */
export const registrySourcePackage = "registry/package.json";

/** Packages every consumer already has, so items never list them. */
export const consumerPackages: ReadonlySet<string> = new Set(["react", "react-dom"]);

/**
 * Drag and drop stays optional. Views edit through the native pointer layer in
 * `@moltenship/calendar` (ADR 0037), which does nothing until the app passes `onEventChange`; no
 * item may depend on, or import, a drag-and-drop library or the pointer package itself.
 */
export const dragAndDropPackages: readonly RegExp[] = [
  /^@dnd-kit\//u,
  /^@moltenship\/calendar-dnd$/u,
];
