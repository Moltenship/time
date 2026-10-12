/** Decodes RFC 6868 caret escapes. Any other caret sequence stays as written, as §3.2 asks. */
export function decodeParameterValue(raw: string): string {
  let caret = raw.indexOf("^");
  if (caret === -1) return raw;

  let decoded = "";
  let from = 0;
  while (caret !== -1 && caret < raw.length - 1) {
    const next = raw[caret + 1];
    const replacement = next === "n" ? "\n" : next === "^" ? "^" : next === "'" ? '"' : undefined;
    if (replacement === undefined) {
      caret = raw.indexOf("^", caret + 1);
    } else {
      decoded += raw.slice(from, caret) + replacement;
      from = caret + 2;
      caret = raw.indexOf("^", from);
    }
  }
  return decoded + raw.slice(from);
}

/**
 * RFC 6868-encodes a parameter value and quotes it when it holds `:`, `;` or `,`. Any line break,
 * CRLF included, becomes `^n`, since a raw one would end the content line.
 */
export function encodeParameterValue(value: string): string {
  const encoded = /[\n\r"^]/.test(value)
    ? value.replace(/\r\n|[\n\r"^]/g, (match) =>
        match === "^" ? "^^" : match === '"' ? "^'" : "^n",
      )
    : value;
  return /[,:;]/.test(encoded) ? `"${encoded}"` : encoded;
}
