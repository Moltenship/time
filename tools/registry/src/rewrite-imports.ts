/**
 * Registry source imports shared files through `@registry/<folder>/<file>`. Consumers don't have
 * that alias, so the build rewrites each import to the path shadcn understands: `@/components/…`
 * for a file that lands under the `components` alias, which `shadcn add` then rewrites to the
 * consumer's own alias, and `@/components/ui/…` for stock shadcn components, which it rewrites to
 * the `ui` alias.
 */
const registryImport = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])(@registry\/[^"']+)\2/gu;

export interface ConsumerImportResolver {
  /** `@registry/calendar/event-chip` → `@/components/calendar/event-chip`. */
  (specifier: string): string;
}

export function rewriteRegistryImports(
  source: string,
  resolveImport: ConsumerImportResolver,
): string {
  return source.replaceAll(
    registryImport,
    (_match, keyword: string, quote: string, specifier: string) =>
      `${keyword}${quote}${resolveImport(specifier)}${quote}`,
  );
}

/** The import a consumer writes for a file at `target`: `@components/a/b.tsx` → `@/components/a/b`. */
export function consumerImportForTarget(target: string): string {
  const match = /^@(components|ui|lib|hooks)\/(.+?)(?:\.tsx?)?$/u.exec(target);
  if (!match) throw new Error(`Target ${target} isn't under an alias, so nothing can import it`);
  const [, alias, path] = match;
  const base = alias === "ui" ? "components/ui" : alias;
  return `@/${base}/${path}`;
}
