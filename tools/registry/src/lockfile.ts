import { parseAllDocuments } from "yaml";

/**
 * Checks that an app's pnpm lockfile installed our packages from the tarballs the local registry
 * served: every `@moltenship` package with a served tarball's hash, and every runtime package
 * there. A package from anywhere else, such as npm once a version is published, fails.
 */
export function servedPackageProblems(
  lockfile: string,
  served: ReadonlyMap<string, string>,
  runtime: readonly string[],
): string[] {
  // pnpm writes the package manager's own lockfile as a first document.
  const entries = parseAllDocuments(lockfile).flatMap((document) =>
    Object.entries(
      (
        document.toJS() as {
          readonly packages?: Record<
            string,
            { readonly resolution?: { readonly integrity?: string } }
          >;
        } | null
      )?.packages ?? {},
    ),
  );
  const installed = new Set<string>();
  const problems: string[] = [];
  for (const [key, entry] of entries) {
    const name = /^(@moltenship\/[^@]+)@/u.exec(key)?.[1];
    if (name === undefined) continue;
    installed.add(name);
    const integrity = entry.resolution?.integrity;
    if (!served.has(name))
      problems.push(`${key} is installed, but the local registry has no ${name}`);
    else if (integrity !== served.get(name)) {
      problems.push(`${key} is installed with ${integrity ?? "no hash"}, not the served tarball's`);
    }
  }
  for (const name of runtime) {
    if (!installed.has(name)) problems.push(`pnpm-lock.yaml has no ${name}`);
  }
  return problems;
}
