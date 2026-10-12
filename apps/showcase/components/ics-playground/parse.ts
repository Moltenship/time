import { parseIcs, type IcsIssue } from "@moltenship/ics";

export interface PlaygroundResult {
  /** The parse issues in the order `parseIcs` reports them. */
  readonly issues: readonly IcsIssue[];
  /** The typed calendars as indented JSON. Temporal values become ISO strings via `toJSON`. */
  readonly json: string;
  /** The issue count in words, such as "1 warning" or "No issues". */
  readonly summary: string;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** "No issues", "1 warning", "2 errors and 1 warning". */
export function describeIssues(issues: readonly IcsIssue[]): string {
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.length - errors;
  const parts = [
    ...(errors > 0 ? [plural(errors, "error")] : []),
    ...(warnings > 0 ? [plural(warnings, "warning")] : []),
  ];
  return parts.length === 0 ? "No issues" : parts.join(" and ");
}

/** Where an issue lands in the result, written as a property path: `calendars[0].events[3].start`. */
export function formatIssuePath(path: IcsIssue["path"]): string {
  return path
    .map((segment, index) =>
      typeof segment === "number" ? `[${segment}]` : index === 0 ? segment : `.${segment}`,
    )
    .join("");
}

/** What the playground shows for a piece of ICS text: `parseIcs` with no options. */
export function parsePlayground(text: string): PlaygroundResult {
  const { calendars, issues } = parseIcs(text);
  return {
    issues,
    json: JSON.stringify(calendars, null, 2),
    summary: describeIssues(issues),
  };
}
