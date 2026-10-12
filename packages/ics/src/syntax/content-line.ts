import { decodeParameterValue } from "./parameters";

const COLON = 0x3a;
const COMMA = 0x2c;
const EQUALS = 0x3d;
const QUOTE = 0x22;
const SEMICOLON = 0x3b;

export interface ContentLine {
  readonly name: string;
  readonly parameters: Record<string, string[]>;
  /** Tolerated deviations, each worth a warning. */
  readonly problems: readonly string[] | undefined;
  readonly value: string;
}

/**
 * Splits `name *(";" param) ":" value`, or returns `undefined` when the line isn't one: no name,
 * no colon outside quotes, or a parameter name with characters a name can't have. Tolerated, and
 * listed in `problems`: a parameter without `=` (kept with no values), an unterminated quote or a
 * stray one (kept as a literal character), and text after a closing quote (appended to the value).
 */
export function parseContentLine(text: string): ContentLine | undefined {
  const length = text.length;
  let position = scanName(text, 0);
  if (position === 0) return undefined;

  const name = text.slice(0, position).toUpperCase();
  // Without a prototype, `parameters.constructor` is `undefined` like any other absent name.
  const parameters: Record<string, string[]> = Object.create(null);
  let problems: string[] | undefined;

  while (position < length) {
    const code = text.charCodeAt(position);
    if (code === COLON) return { name, parameters, problems, value: text.slice(position + 1) };
    if (code !== SEMICOLON) return undefined;

    const nameStart = position + 1;
    position = scanName(text, nameStart);
    if (position === nameStart) return undefined;
    const parameterName = text.slice(nameStart, position).toUpperCase();
    // A repeated parameter adds to the values it already has.
    const values = (parameters[parameterName] ??= []);

    const separator = text.charCodeAt(position);
    if (separator === SEMICOLON || separator === COLON) {
      (problems ??= []).push(`Parameter ${parameterName} has no "="; kept without a value`);
      continue;
    }
    if (separator !== EQUALS) return undefined;
    position += 1;

    for (;;) {
      let raw: string;
      const close = text.charCodeAt(position) === QUOTE ? text.indexOf('"', position + 1) : -1;
      if (close !== -1) {
        raw = text.slice(position + 1, close);
        position = close + 1;
        if (position >= length) return undefined;
        if (!isValueEnd(text.charCodeAt(position))) {
          const end = scanParameterText(text, position);
          raw += text.slice(position, end);
          position = end;
          (problems ??= []).push(`Parameter ${parameterName} has text after its closing quote`);
        }
      } else {
        const end = scanParameterText(text, position);
        raw = text.slice(position, end);
        position = end;
        if (raw.includes('"')) {
          (problems ??= []).push(`Parameter ${parameterName} has a stray double quote`);
        }
      }
      values.push(decodeParameterValue(raw));
      if (text.charCodeAt(position) !== COMMA) break;
      position += 1;
    }
  }
  return undefined;
}

function scanName(text: string, start: number): number {
  let position = start;
  while (position < text.length && isNameCode(text.charCodeAt(position))) position += 1;
  return position;
}

function scanParameterText(text: string, start: number): number {
  let position = start;
  while (position < text.length && !isValueEnd(text.charCodeAt(position))) position += 1;
  return position;
}

function isValueEnd(code: number): boolean {
  return code === COMMA || code === SEMICOLON || code === COLON;
}

function isNameCode(code: number): boolean {
  return (
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a) ||
    (code >= 0x30 && code <= 0x39) ||
    code === 0x2d
  );
}
