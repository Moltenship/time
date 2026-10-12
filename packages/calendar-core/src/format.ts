/**
 * Intl output with thin and narrow no-break spaces as plain ones. Runtimes disagree on them: Node
 * 26 puts thin spaces around a range's dash, "Oct 12 – 18", where Chrome puts plain ones, so text
 * rendered on the server would not match the browser's when it hydrates.
 */
export function withAsciiSpaces(text: string): string {
  return text.replace(/[\u2009\u202F]/gu, " ");
}
