import { readFile, readdir, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import parsePackageArgument from "npm-package-arg";
import { registryItemSchema } from "shadcn/schema";

import {
  dragAndDropPackages,
  registryNamespace,
  registrySourceDirectory,
  registrySourcePackage,
} from "./config";

/** Tokens a stock shadcn theme defines. Items may set these or `calendar-*` tokens, nothing else. */
export const standardCssVariables: ReadonlySet<string> = new Set([
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

/**
 * Targets start with one of shadcn's alias placeholders, so files land under the consumer's own
 * `components.json` aliases, or with `~/` for a path from the project root.
 */
const aliasTargetPrefixes = ["@components/", "@ui/", "@lib/", "@hooks/", "~/"] as const;
const shadcnItemName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const namespacedItem = new RegExp(`^${registryNamespace}/([a-z0-9]+(?:-[a-z0-9]+)*)$`, "u");

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
  /** Our items this one installs, by name. */
  readonly itemDependencies: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function issue(code: string, path: string, message: string): RegistryValidationIssue {
  return { code, path, message };
}

function isWithinWorkspace(workspaceRoot: string, path: string): boolean {
  const resolvedRoot = resolve(workspaceRoot);
  const pathFromRoot = relative(resolvedRoot, resolve(resolvedRoot, path));
  return pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot);
}

function isSafeTarget(target: string): boolean {
  const prefix = aliasTargetPrefixes.find((candidate) => target.startsWith(candidate));
  if (!prefix) return false;
  const rest = target.slice(prefix.length);
  return (
    rest.length > 0 &&
    !rest.includes("\\") &&
    !rest.split("/").some((part) => part === "" || part === "." || part === "..")
  );
}

async function isFile(workspaceRoot: string, path: string): Promise<boolean> {
  if (!isWithinWorkspace(workspaceRoot, path)) return false;
  try {
    return (await stat(resolve(workspaceRoot, path))).isFile();
  } catch {
    return false;
  }
}

async function readDeclaredPackages(workspaceRoot: string): Promise<ReadonlySet<string>> {
  const manifest = JSON.parse(
    await readFile(resolve(workspaceRoot, registrySourcePackage), "utf8"),
  ) as { readonly dependencies?: Record<string, string> };
  return new Set(Object.keys(manifest.dependencies ?? {}));
}

function validateDependencies(
  dependencies: readonly string[] | undefined,
  manifestPath: string,
  declaredPackages: ReadonlySet<string>,
): RegistryValidationIssue[] {
  const issues: RegistryValidationIssue[] = [];
  const seen = new Set<string>();

  for (const [index, dependency] of (dependencies ?? []).entries()) {
    const path = `${manifestPath}.dependencies[${index}]`;
    let parsed: ReturnType<typeof parsePackageArgument>;
    try {
      parsed = parsePackageArgument(dependency);
    } catch {
      issues.push(
        issue("invalid-dependency", path, `Dependency is not a valid npm argument: ${dependency}`),
      );
      continue;
    }
    if (!parsed.name || !["range", "tag", "version"].includes(parsed.type)) {
      issues.push(
        issue("invalid-dependency", path, `Dependency must resolve from npm: ${dependency}`),
      );
      continue;
    }
    if (seen.has(parsed.name)) {
      issues.push(
        issue("duplicate-dependency", path, `Dependency is declared twice: ${parsed.name}`),
      );
      continue;
    }
    seen.add(parsed.name);
    if (dependency !== parsed.name) {
      issues.push(
        issue(
          "versioned-dependency",
          path,
          `List ${parsed.name} without a version; the build adds ours from the workspace`,
        ),
      );
    }
    if (dragAndDropPackages.some((pattern) => pattern.test(parsed.name!))) {
      issues.push(
        issue(
          "drag-and-drop-dependency",
          path,
          `Drag and drop stays optional, so no item may depend on ${parsed.name}`,
        ),
      );
    }
    if (!declaredPackages.has(parsed.name)) {
      issues.push(
        issue(
          "undeclared-dependency",
          path,
          `${parsed.name} is not a dependency of ${registrySourcePackage}, so registry source can't import it`,
        ),
      );
    }
  }

  return issues;
}

function validateRegistryDependencies(
  dependencies: readonly string[] | undefined,
  manifestPath: string,
): { issues: RegistryValidationIssue[]; itemDependencies: string[] } {
  const issues: RegistryValidationIssue[] = [];
  const itemDependencies: string[] = [];
  for (const [index, dependency] of (dependencies ?? []).entries()) {
    const ownItem = namespacedItem.exec(dependency);
    if (ownItem) {
      itemDependencies.push(ownItem[1]!);
    } else if (!shadcnItemName.test(dependency)) {
      issues.push(
        issue(
          "invalid-registry-dependency",
          `${manifestPath}.registryDependencies[${index}]`,
          `Use a stock shadcn component name or ${registryNamespace}/<item>; the build turns our items into URLs: ${dependency}`,
        ),
      );
    }
  }
  return { issues, itemDependencies };
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
      const tokenName = mode === "theme" ? name.replace(/^color-/u, "") : name;
      if (!standardCssVariables.has(tokenName) && !tokenName.startsWith("calendar-")) {
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

async function validateMeta(
  meta: unknown,
  manifestPath: string,
  workspaceRoot: string,
): Promise<RegistryValidationIssue[]> {
  if (!isRecord(meta)) return [];
  const issues: RegistryValidationIssue[] = [];
  if ("compatibility" in meta) {
    issues.push(
      issue(
        "generated-compatibility",
        `${manifestPath}.meta.compatibility`,
        "The build writes meta.compatibility from the workspace versions; remove it here",
      ),
    );
  }
  if ("stylesheet" in meta) {
    const stylesheet = meta.stylesheet;
    if (
      typeof stylesheet !== "string" ||
      !stylesheet.endsWith(".css") ||
      !(await isFile(workspaceRoot, stylesheet))
    ) {
      issues.push(
        issue(
          "missing-stylesheet",
          `${manifestPath}.meta.stylesheet`,
          `meta.stylesheet must name a CSS file in the workspace: ${String(stylesheet)}`,
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
  declaredPackages: ReadonlySet<string>,
): Promise<RegistryItemValidation> {
  const issues: RegistryValidationIssue[] = [];
  const files = item.files ?? [];
  const targets: string[] = [];
  const registryDependencies = validateRegistryDependencies(
    item.registryDependencies,
    manifestPath,
  );

  // A composition such as calendar-full owns no files and installs other items instead.
  const isComposition =
    item.type === "registry:item" && registryDependencies.itemDependencies.length > 0;
  if (files.length === 0 && !isComposition) {
    issues.push(
      issue("missing-files", `${manifestPath}.files`, "Registry items must declare source files"),
    );
  }
  if (files.length > 0 && isComposition) {
    issues.push(
      issue(
        "composition-files",
        `${manifestPath}.files`,
        "A registry:item that composes other items must not own files",
      ),
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
    } else if (!(await isFile(workspaceRoot, file.path))) {
      issues.push(
        issue("missing-source-file", `${path}.path`, `Source file does not exist: ${file.path}`),
      );
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
          `Target must start with ${aliasTargetPrefixes.join(", ")} and stay inside it: ${file.target}`,
        ),
      );
    } else {
      targets.push(file.target);
    }
  }

  issues.push(
    ...validateDependencies(item.dependencies, manifestPath, declaredPackages),
    ...(item.devDependencies?.length
      ? [
          issue(
            "unsupported-dev-dependencies",
            `${manifestPath}.devDependencies`,
            "Registry source needs no dev dependencies, and the build doesn't ship them",
          ),
        ]
      : []),
    ...registryDependencies.issues,
    ...validateCssVariables(item.cssVars, manifestPath),
    ...(await validateMeta(item.meta, manifestPath, workspaceRoot)),
  );

  return {
    issues,
    name: item.name,
    targets,
    itemDependencies: registryDependencies.itemDependencies,
  };
}

export async function validateRegistryItemFile(
  manifestPath: string,
  { workspaceRoot }: RegistryValidationOptions,
  declaredPackages?: ReadonlySet<string>,
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
      itemDependencies: [],
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
      itemDependencies: [],
    };
  }

  return validateParsedItem(
    parsed.data,
    manifestPath,
    workspaceRoot,
    declaredPackages ?? (await readDeclaredPackages(workspaceRoot)),
  );
}

/** Every `registry-item.json` one folder below `registry/`, in a stable order. */
export async function findRegistryManifests(workspaceRoot: string): Promise<string[]> {
  const entries = await readdir(resolve(workspaceRoot, registrySourceDirectory), {
    withFileTypes: true,
  });
  const manifests: string[] = [];
  for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
    const manifestPath = `${registrySourceDirectory}/${entry.name}/registry-item.json`;
    if (await isFile(workspaceRoot, manifestPath)) manifests.push(manifestPath);
  }
  return manifests.sort();
}

export async function validateRegistryWorkspace(
  workspaceRoot: string,
  manifestPaths?: readonly string[],
): Promise<RegistryValidationReport> {
  const paths = manifestPaths ?? (await findRegistryManifests(workspaceRoot));
  const declaredPackages = await readDeclaredPackages(workspaceRoot);
  const results = await Promise.all(
    paths.map(async (manifestPath) => ({
      manifestPath,
      validation: await validateRegistryItemFile(manifestPath, { workspaceRoot }, declaredPackages),
    })),
  );
  const issues = results.flatMap(({ validation }) => validation.issues);
  const targetOwners = new Map<string, string>();
  const names = new Set(results.map(({ validation }) => validation.name));

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
    for (const dependency of validation.itemDependencies) {
      if (!names.has(dependency)) {
        issues.push(
          issue(
            "unknown-registry-item",
            `${manifestPath}.registryDependencies`,
            `${registryNamespace}/${dependency} is not an item in this registry`,
          ),
        );
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
