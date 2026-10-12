import type { IcsComponent, IcsProperty } from "../types";
import { encodeParameterValue } from "./parameters";

const MAX_OCTETS = 75;

export function stringifyComponents(components: readonly IcsComponent[]): string {
  const lines: string[] = [];
  for (const component of components) writeComponent(component, lines);
  return lines.join("");
}

function writeComponent(component: IcsComponent, lines: string[]): void {
  lines.push(foldLine(`BEGIN:${component.name}`));
  for (const property of component.properties) lines.push(foldLine(formatProperty(property)));
  for (const child of component.components) writeComponent(child, lines);
  lines.push(foldLine(`END:${component.name}`));
}

function formatProperty(property: IcsProperty): string {
  let line = property.name;
  for (const name in property.parameters) {
    const values = property.parameters[name];
    if (values === undefined) continue;
    // An empty list is written as a bare name, which parses back to an empty list.
    line +=
      values.length === 0 ? `;${name}` : `;${name}=${values.map(encodeParameterValue).join(",")}`;
  }
  return `${line}:${property.value}`;
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
