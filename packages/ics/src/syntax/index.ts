// Syntax layer: text ⇄ `IcsComponent` tree. Owned by the syntax work package.

import type { IcsComponent, IcsIssue } from "../types";

export interface IcsComponentsResult {
  /** Top-level components, normally VCALENDARs. */
  readonly components: readonly IcsComponent[];
  readonly issues: readonly IcsIssue[];
}

/** Splits iCalendar text into a lossless component tree, collecting syntax issues. */
export function parseIcsComponents(text: string): IcsComponentsResult {
  void text;
  throw new Error("not implemented: parseIcsComponents");
}

/** Writes components back as iCalendar text: CRLF line ends, folded at 75 octets. */
export function stringifyIcsComponents(components: IcsComponent | readonly IcsComponent[]): string {
  void components;
  throw new Error("not implemented: stringifyIcsComponents");
}
