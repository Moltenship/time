// Syntax layer: text ⇄ `IcsComponent` tree. Values stay raw; decoding them is the values layer's job.

import type { IcsComponent, IcsIssue } from "../types";
import { parseComponents } from "./parse";
import { stringifyComponents } from "./stringify";

export interface IcsComponentsResult {
  /** Top-level components, normally VCALENDARs. */
  readonly components: readonly IcsComponent[];
  readonly issues: readonly IcsIssue[];
}

/** Splits iCalendar text into a lossless component tree, collecting syntax issues. */
export function parseIcsComponents(text: string): IcsComponentsResult {
  return parseComponents(text);
}

/**
 * Writes components back as iCalendar text: CRLF line ends, folded at 75 octets. Parameter values
 * are RFC 6868-encoded, so they may hold line breaks; values are written as they are.
 *
 * @throws {RangeError} When a component name, property name, parameter name or property value
 *   contains CR or LF, which would end the content line. The message names the property. Escape
 *   line breaks in TEXT values as `\n` first.
 */
export function stringifyIcsComponents(components: IcsComponent | readonly IcsComponent[]): string {
  return stringifyComponents(isComponentList(components) ? components : [components]);
}

function isComponentList(
  components: IcsComponent | readonly IcsComponent[],
): components is readonly IcsComponent[] {
  return Array.isArray(components);
}
