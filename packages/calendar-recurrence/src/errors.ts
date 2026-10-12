/** The `RecurrenceIssue` code a rule error becomes in the series layer. */
export type RecurrenceRuleErrorCode = "invalid-rule" | "invalid-time-zone" | "unsupported-rule";

/** Why `expandRecurrenceRule` can't expand a rule. */
export class RecurrenceRuleError extends RangeError {
  readonly code: RecurrenceRuleErrorCode;

  constructor(code: RecurrenceRuleErrorCode, message: string) {
    super(message);
    this.name = "RecurrenceRuleError";
    this.code = code;
  }
}
