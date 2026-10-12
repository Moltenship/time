import type { IcsIssue } from "./types";

/** Thrown by a strict parser when it finds error-severity issues. */
export class IcsParseError extends Error {
  readonly issues: readonly IcsIssue[];

  constructor(issues: readonly IcsIssue[]) {
    const [first] = issues;
    const more = issues.length > 1 ? ` (and ${issues.length - 1} more)` : "";
    super(first ? `${first.message}${more}` : "Invalid iCalendar data");
    this.name = "IcsParseError";
    this.issues = issues;
  }
}
