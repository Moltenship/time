import { readFile, readdir, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import parsePackageArgument from "npm-package-arg";
import { validRange } from "semver";
import { registryItemSchema } from "shadcn/schema";

const publicRuntimePackages = new Set([
  "@moltenship/calendar",
  "@moltenship/calendar-core",
  "@moltenship/calendar-dnd",
  "@moltenship/calendar-react",
  "@moltenship/calendar-temporal",
]);

const standardCssVariables = new Set([
  "accent",
  "accent-foreground",
  "background",
  "border",
  "card",
  "card-foreground",
  "destructive",
  "foreground",
  "input",
  "muted",
  "muted-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "radius",
  "ring",
  "secondary",
  "secondary-foreground",
]);

const acceptedDependencyTypes = new Set(["alias", "range", "tag", "version"]);
const acceptedRegistryDependency = /^(?:[a-z0-9]+(?:-[a-z0-9]+)*|@[a-z0-9-]+\/[a-z0-9-]+)$/;

export interface RegistryValidationIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface RegistryValidationReport {
  readonly valid: boolean;
  readonly manifests: number;
  readonly targets: number;
  readonly issues: readonly RegistryValidationIssue[];
}

export interface RegistryValidationOptions {
  readonly workspaceRoot: string;
}

export interface RegistryItemValidation {
  readonly issues: RegistryValidationIssue[];
  readonly name: string | null;
  readonly targets: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function issue(code: string, path: string, message: string): RegistryValidationIssue {
  return { code, path, message };
}

function isWithinWorkspace(workspaceRoot: string, path: string): boolean {
  const resolvedRoot = resolve(workspaceRoot);
  const resolvedPath = resolve(resolvedRoot, path);
  const pathFromRoot = relative(resolvedRoot, resolvedPath);
  return pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot);
}

function isSafeTarget(target: string): boolean {
  const normalized = target.startsWith("~/") ? target.slice(2) : target;
  return (
    normalized.length > 0 &&
    !isAbsolute(normalized) &&
    !normalized.includes("\\") &&
    !normalized.split("/").some((part) => part === "" || part === "." || part === "..")
  );
}

function validateDependencies(
  dependencies: readonly string[] | undefined,
  manifestPath: string,
  field: "dependencies" | "devDependencies",
): RegistryValidationIssue[] {
  const issues: RegistryValidationIssue[] = [];
  const seen = new Set<string>();

  for (const [index, dependency] of (dependencies ?? []).entries()) {
    const path = `${manifestPath}.${field}[${index}]`;
    try {
      const parsed = parsePackageArgument(dependency);
      if (!parsed.name || !acceptedDependencyTypes.has(parsed.type)) {
        issues.push(
          issue("invalid-dependency", path, `Dependency must resolve from npm: ${dependency}`),
        );
      } else if (seen.has(parsed.name)) {
        issues.push(
          issue("duplicate-dependency", path, `Dependency is declared twice: ${parsed.name}`),
        );
      } else {
        seen.add(parsed.name);
      }
    } catch {
      issues.push(
        issue("invalid-dependency", path, `Dependency is not a valid npm argument: ${dependency}`),
      );
    }
  }

  return issues;
}

function validateRegistryDependencies(
  dependencies: readonly string[] | undefined,
  manifestPath: string,
): RegistryValidationIssue[] {
  return (dependencies ?? []).flatMap((dependency, index) => {
    if (
      acceptedRegistryDependency.test(dependency) ||
      dependency.startsWith("https://") ||
      dependency.startsWith("http://")
    ) {
      return [];
    }
    return [
      issue(
        "invalid-registry-dependency",
        `${manifestPath}.registryDependencies[${index}]`,
        `Registry dependency must be a shadcn item name, namespaced item, or URL: ${dependency}`,
      ),
    ];
  });
}

function validateCssVariables(cssVars: unknown, manifestPath: string): RegistryValidationIssue[] {
  if (cssVars === undefined) return [];
  if (!isRecord(cssVars)) {
    return [issue("invalid-css-vars", `${manifestPath}.cssVars`, "cssVars must be an object")];
  }

  const issues: RegistryValidationIssue[] = [];
  for (const [mode, variables] of Object.entries(cssVars)) {
    if (!isRecord(variables)) continue;
    for (const [name, value] of Object.entries(variables)) {
      const path = `${manifestPath}.cssVars.${mode}.${name}`;
      if (!standardCssVariables.has(name) && !name.startsWith("calendar-")) {
        issues.push(
          issue(
            "invalid-css-variable",
            path,
            `CSS variable must use a standard shadcn token or the calendar-* namespace: ${name}`,
          ),
        );
      }
      if (typeof value !== "string" || value.trim().length === 0) {
        issues.push(
          issue("invalid-css-value", path, "CSS variable values must be non-empty strings"),
        );
      }
    }
  }
  return issues;
}

function validateCompatibility(
  meta: unknown,
  manifestPath: string,
  runtimeDependencyNames: ReadonlySet<string>,
): RegistryValidationIssue[] {
  const metadata = isRecord(meta) ? meta : null;
  const compatibility =
    metadata && isRecord(metadata.compatibility) ? metadata.compatibility : null;
  if (!compatibility || Object.keys(compatibility).length === 0) {
    return [
      issue(
        "missing-compatibility",
        `${manifestPath}.meta.compatibility`,
        "Compatibility metadata must declare at least one runtime package and minimum range",
      ),
    ];
  }

  const issues: RegistryValidationIssue[] = [];
  for (const [runtimePackage, range] of Object.entries(compatibility)) {
    const path = `${manifestPath}.meta.compatibility.${runtimePackage}`;
    if (!publicRuntimePackages.has(runtimePackage)) {
      issues.push(
        issue(
          "invalid-compatibility-package",
          path,
          `Unsupported runtime package: ${runtimePackage}`,
        ),
      );
    }
    if (!runtimeDependencyNames.has(runtimePackage)) {
      issues.push(
        issue(
          "missing-compatible-dependency",
          path,
          `Compatibility package must also appear in dependencies: ${runtimePackage}`,
        ),
      );
    }
    const trimmedRange = typeof range === "string" ? range.trim() : null;
    const normalizedRange = trimmedRange ? validRange(trimmedRange) : null;
    if (!normalizedRange || trimmedRange === "*") {
      issues.push(
        issue(
          "invalid-compatibility-range",
          path,
          `Compatibility must be a non-floating semver range: ${String(range)}`,
        ),
      );
    }
  }
  return issues;
}

async function validateParsedItem(
  item: ReturnType<typeof registryItemSchema.parse>,
  manifestPath: string,
  workspaceRoot: string,
): Promise<RegistryItemValidation> {
  const issues: RegistryValidationIssue[] = [];
  const files = item.files ?? [];
  const targets: string[] = [];

  if (files.length === 0) {
    issues.push(
      issue("missing-files", `${manifestPath}.files`, "Registry items must declare source files"),
    );
  }

  for (const [index, file] of files.entries()) {
    const path = `${manifestPath}.files[${index}]`;
    if (!isWithinWorkspace(workspaceRoot, file.path)) {
      issues.push(
        issue(
          "invalid-source-path",
          `${path}.path`,
          `Source path escapes the workspace: ${file.path}`,
        ),
      );
    } else {
      try {
        const source = await stat(resolve(workspaceRoot, file.path));
        if (!source.isFile()) throw new Error("not a file");
      } catch {
        issues.push(
          issue("missing-source-file", `${path}.path`, `Source file does not exist: ${file.path}`),
        );
      }
    }

    if (!file.target) {
      issues.push(
        issue(
          "missing-target",
          `${path}.target`,
          "Every registry file must declare an explicit target",
        ),
      );
    } else if (!isSafeTarget(file.target)) {
      issues.push(
        issue(
          "invalid-target",
          `${path}.target`,
          `Target must stay inside the consumer project: ${file.target}`,
        ),
      );
    } else {
      targets.push(file.target);
    }
  }

  const runtimeDependencyNames = new Set<string>();
  for (const dependency of item.dependencies ?? []) {
    try {
      const name = parsePackageArgument(dependency).name;
      if (name) runtimeDependencyNames.add(name);
    } catch {
      // The dependency validator reports the actionable error.
    }
  }

  issues.push(
    ...validateDependencies(item.dependencies, manifestPath, "dependencies"),
    ...validateDependencies(item.devDependencies, manifestPath, "devDependencies"),
    ...validateRegistryDependencies(item.registryDependencies, manifestPath),
    ...validateCssVariables(item.cssVars, manifestPath),
    ...validateCompatibility(item.meta, manifestPath, runtimeDependencyNames),
  );

  return { issues, name: item.name, targets };
}

export async function validateRegistryItemFile(
  manifestPath: string,
  { workspaceRoot }: RegistryValidationOptions,
): Promise<RegistryItemValidation> {
  let input: unknown;
  try {
    input = JSON.parse(await readFile(resolve(workspaceRoot, manifestPath), "utf8"));
  } catch (error) {
    return {
      issues: [
        issue("invalid-json", manifestPath, `Unable to read registry item: ${String(error)}`),
      ],
      name: null,
      targets: [],
    };
  }

  const parsed = registryItemSchema.safeParse(input);
  if (!parsed.success) {
    return {
      issues: parsed.error.issues.map((schemaIssue) =>
        issue(
          "shadcn-schema",
          `${manifestPath}.${schemaIssue.path.join(".")}`,
          schemaIssue.message,
        ),
      ),
      name: isRecord(input) && typeof input.name === "string" ? input.name : null,
      targets: [],
    };
  }

  return validateParsedItem(parsed.data, manifestPath, workspaceRoot);
}

async function findRegistryManifests(directory: string, workspaceRoot: string): Promise<string[]> {
  const absoluteDirectory = resolve(workspaceRoot, directory);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const manifests: string[] = [];
  for (const entry of entries) {
    const relativePath = `${directory}/${entry.name}`;
    if (entry.name === "node_modules") continue;
    if (entry.isDirectory()) {
      manifests.push(...(await findRegistryManifests(relativePath, workspaceRoot)));
    } else if (entry.name === "registry-item.json") {
      manifests.push(relativePath);
    }
  }
  return manifests;
}

export async function validateRegistryWorkspace(
  workspaceRoot: string,
  manifestPaths?: readonly string[],
): Promise<RegistryValidationReport> {
  const paths = manifestPaths ?? (await findRegistryManifests("registry", workspaceRoot));
  const results = await Promise.all(
    paths.map(async (manifestPath) => ({
      manifestPath,
      validation: await validateRegistryItemFile(manifestPath, { workspaceRoot }),
    })),
  );
  const issues = results.flatMap(({ validation }) => validation.issues);
  const targetOwners = new Map<string, string>();

  for (const { manifestPath, validation } of results) {
    for (const target of validation.targets) {
      const owner = targetOwners.get(target);
      if (owner) {
        issues.push(
          issue("duplicate-target", manifestPath, `Target ${target} is already owned by ${owner}`),
        );
      } else {
        targetOwners.set(target, manifestPath);
      }
    }
  }

  return {
    valid: issues.length === 0,
    manifests: paths.length,
    targets: targetOwners.size,
    issues,
  };
}
