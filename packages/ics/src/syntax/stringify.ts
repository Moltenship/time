import type { IcsComponent, IcsProperty } from "../types";
import { encodeParameterValue } from "./parameters";

const MAX_OCTETS = 75;

export function stringifyComponents(components: readonly IcsComponent[]): string {
  const lines: string[] = [];
  // A stack rather than recursion: parsed trees can nest deeper than the call stack. A string is
  // the name of a component whose END is due.
  const pending: (IcsComponent | string)[] = [...components].reverse();
  while (pending.length > 0) {
    const item = pending.pop()!;
    if (typeof item === "string") {
      lines.push(foldLine(`END:${item}`));
      continue;
    }
    assertNoLineBreak(item.name, () => `Component name ${JSON.stringify(item.name)}`);
    lines.push(foldLine(`BEGIN:${item.name}`));
    for (const property of item.properties) lines.push(foldLine(formatProperty(property)));
    pending.push(item.name);
    for (let index = item.components.length - 1; index >= 0; index -= 1) {
      pending.push(item.components[index]!);
    }
  }
  return lines.join("");
}

function formatProperty(property: IcsProperty): string {
  const { name } = property;
  assertNoLineBreak(name, () => `Property name ${JSON.stringify(name)}`);
  let line = name;
  for (const parameter in property.parameters) {
    const values = property.parameters[parameter];
    if (values === undefined) continue;
    assertNoLineBreak(parameter, () => `Parameter name ${JSON.stringify(parameter)} of ${name}`);
    // An empty list is written as a bare name, which parses back to an empty list.
    line +=
      values.length === 0
        ? `;${parameter}`
        : `;${parameter}=${values.map(encodeParameterValue).join(",")}`;
  }
  assertNoLineBreak(property.value, () => `Value of ${name}`);
  return `${line}:${property.value}`;
}

// A raw CR or LF would end the content line and leave the rest as a broken line of its own.
function assertNoLineBreak(text: string, subject: () => string): void {
  if (text.includes("\n") || text.includes("\r")) {
    throw new RangeError(`${subject()} contains a line break, which iCalendar text can't hold`);
  }
}

/**
 * Folds a line into physical lines of at most 75 UTF-8 octets, each ending in CRLF. Continuation
 * lines start with a space that counts toward their 75. Breaks fall between code points only.
 */
export function foldLine(line: string): string {
  // Each UTF-16 unit takes at most 3 octets.
  if (line.length * 3 <= MAX_OCTETS) return `${line}\r\n`;

  let folded = "";
  let start = 0;
  let octets = 0;
  let index = 0;
  while (index < line.length) {
    const code = line.charCodeAt(index);
    let units = 1;
    let size: number;
    if (code < 0x80) size = 1;
    else if (code < 0x800) size = 2;
    else if (code >= 0xd800 && code <= 0xdbff && isLowSurrogate(line.charCodeAt(index + 1))) {
      size = 4;
      units = 2;
    } else size = 3;

    if (octets + size > MAX_OCTETS) {
      folded += `${line.slice(start, index)}\r\n `;
      start = index;
      octets = 1;
    }
    octets += size;
    index += units;
  }
  return `${folded}${line.slice(start)}\r\n`;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}
