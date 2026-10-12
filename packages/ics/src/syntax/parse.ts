import type { IcsIssue, IcsIssueCode, IcsIssueSeverity, IcsParameters } from "../types";
import { parseContentLine } from "./content-line";
import { forEachUnfoldedLine } from "./lines";

interface ComponentDraft {
  components: ComponentDraft[];
  line: number;
  name: string;
  properties: PropertyDraft[];
}

interface PropertyDraft {
  line: number;
  name: string;
  parameters: IcsParameters;
  value: string;
}

export interface ParsedComponents {
  readonly components: ComponentDraft[];
  readonly issues: IcsIssue[];
}

export function parseComponents(text: string): ParsedComponents {
  const roots: ComponentDraft[] = [];
  const stack: ComponentDraft[] = [];
  // Open components per name, so an END that matches none is rejected without walking the stack.
  const openCounts = new Map<string, number>();
  const issues: IcsIssue[] = [];
  let hasContent = false;
  // The property the previous line produced, which a stray non-content line continues.
  let lastProperty: PropertyDraft | undefined;

  const report = (
    severity: IcsIssueSeverity,
    code: IcsIssueCode,
    message: string,
    line: number,
    component: string | undefined,
    property?: string,
  ) => {
    const issue: { -readonly [K in keyof IcsIssue]: IcsIssue[K] } = {
      code,
      line,
      message,
      path: [],
      severity,
    };
    if (component !== undefined) issue.component = component;
    if (property !== undefined) issue.property = property;
    issues.push(issue);
  };

  const close = (component: ComponentDraft) => {
    const count = openCounts.get(component.name)!;
    if (count === 1) openCounts.delete(component.name);
    else openCounts.set(component.name, count - 1);
  };

  forEachUnfoldedLine(text, (content, line) => {
    hasContent = true;
    const current = stack.at(-1);
    const parsed = parseContentLine(content);

    if (parsed === undefined) {
      // Producers that write raw newlines into long values leave the rest of the value on lines
      // of its own. `\n` keeps the raw value one escaped line that TEXT decoding turns back into
      // a line break.
      if (lastProperty !== undefined) {
        lastProperty.value += `\\n${content}`;
        report(
          "warning",
          "invalid-content-line",
          `Line is not a content line; appended to ${lastProperty.name} as a line break`,
          line,
          current?.name,
          lastProperty.name,
        );
      } else {
        report(
          "warning",
          "invalid-content-line",
          current === undefined
            ? "Line outside any component is not a content line; dropped"
            : "Line is not a content line and follows no property; dropped",
          line,
          current?.name,
        );
      }
      return;
    }

    if (parsed.name === "BEGIN" || parsed.name === "END") {
      lastProperty = undefined;
      const name = parsed.value.trim().toUpperCase();
      if (name === "") {
        report(
          "warning",
          "invalid-structure",
          `${parsed.name} without a component name; ignored`,
          line,
          current?.name,
        );
        return;
      }

      if (parsed.name === "BEGIN") {
        const component: ComponentDraft = { components: [], line, name, properties: [] };
        (current === undefined ? roots : current.components).push(component);
        stack.push(component);
        openCounts.set(name, (openCounts.get(name) ?? 0) + 1);
        return;
      }

      if (!openCounts.has(name)) {
        report(
          "warning",
          "invalid-structure",
          `END:${name} has no matching BEGIN; ignored`,
          line,
          name,
        );
        return;
      }
      for (;;) {
        const component = stack.pop()!;
        close(component);
        if (component.name === name) break;
        report(
          "warning",
          "invalid-structure",
          `${component.name} from line ${component.line} is closed by END:${name}`,
          line,
          component.name,
        );
      }
      return;
    }

    for (const problem of parsed.problems ?? []) {
      report("warning", "invalid-content-line", problem, line, current?.name, parsed.name);
    }

    if (current === undefined) {
      lastProperty = undefined;
      report(
        "warning",
        "invalid-structure",
        `${parsed.name} is outside any component; dropped`,
        line,
        undefined,
        parsed.name,
      );
      return;
    }

    lastProperty = { line, name: parsed.name, parameters: parsed.parameters, value: parsed.value };
    current.properties.push(lastProperty);
  });

  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const component = stack[index]!;
    report(
      "warning",
      "invalid-structure",
      `${component.name} is never closed; closed at the end of the text`,
      component.line,
      component.name,
    );
  }

  if (roots.length === 0 && hasContent) {
    // Most likely not iCalendar at all, such as an HTML error page: line-level noise would bury
    // the one issue that matters.
    return {
      components: [],
      issues: [
        {
          code: "invalid-structure",
          message: "The text contains no iCalendar component",
          path: [],
          severity: "error",
        },
      ],
    };
  }

  return { components: roots, issues };
}
