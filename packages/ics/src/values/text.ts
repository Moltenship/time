import type { IcsValueType } from "../types";
import { invalid, success, type IcsDecodeResult } from "./result";

const ESCAPES: ReadonlyMap<string, string> = new Map([
  [",", ","],
  [";", ";"],
  ["N", "\n"],
  ["\\", "\\"],
  ["n", "\n"],
]);

export function decodeText(raw: string): IcsDecodeResult<string> {
  if (!raw.includes("\\")) {
    return success(raw);
  }

  const unknown = new Set<string>();
  const warnings: string[] = [];
  const text = raw.replaceAll(/\\(.?)/gsu, (escape, next: string) => {
    if (next === "") {
      warnings.push("TEXT ends in a lone backslash; kept it");
      return escape;
    }
    // Writers escape `:` and `"` as if TEXT were a parameter; the character they meant is clear.
    const unescaped = ESCAPES.get(next);
    if (unescaped === undefined) {
      unknown.add(escape);
    }
    return unescaped ?? next;
  });

  if (unknown.size > 0) {
    warnings.unshift(
      `TEXT has escapes RFC 5545 doesn't define (${[...unknown].join(" ")}); dropped their backslashes`,
    );
  }
  return success(text, warnings.map(invalid));
}

export function encodeText(text: string): string {
  return text.replaceAll(/\r\n|[\r\n\\;,]/g, (char) =>
    char === "\\" || char === ";" || char === "," ? `\\${char}` : "\\n",
  );
}

/**
 * Splits a list value on its separating commas. Only TEXT escapes commas, and `\\,` there is an
 * escaped backslash before a separator. RECUR uses commas inside its parts, so it never splits.
 */
export function splitList(type: IcsValueType, raw: string): string[] {
  if (type === "RECUR") {
    return [raw];
  }

  if (type !== "TEXT" || !raw.includes("\\")) {
    return raw.split(",");
  }

  const items: string[] = [];
  let start = 0;
  for (let index = 0; index < raw.length; index += 1) {
    if (raw[index] === "\\") {
      index += 1;
    } else if (raw[index] === ",") {
      items.push(raw.slice(start, index));
      start = index + 1;
    }
  }
  items.push(raw.slice(start));
  return items;
}
