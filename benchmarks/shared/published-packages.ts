import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";

// Workspace packages export their TypeScript source, which Vite and the type checker read but Node
// can't run. Loaded with `node --import`, this resolves each `@moltenship/*` package to the
// production bundle its build wrote: the entry its `publishConfig.exports` publishes.

interface PublishedManifest {
  readonly publishConfig?: {
    readonly exports?: { readonly "."?: { readonly import?: string } };
  };
}

const workspacePackage = /^@moltenship\/[^/]+$/;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!workspacePackage.test(specifier)) return nextResolve(specifier, context);

    const manifestUrl = nextResolve(`${specifier}/package.json`, context).url;
    const manifest = JSON.parse(readFileSync(new URL(manifestUrl), "utf8")) as PublishedManifest;
    const entry = manifest.publishConfig?.exports?.["."]?.import;
    if (entry === undefined) throw new Error(`${specifier} publishes no import entry.`);
    return { format: "module", shortCircuit: true, url: new URL(entry, manifestUrl).href };
  },
});
