const SPACE = 0x20;
const TAB = 0x09;
const BOM = 0xfeff;

/**
 * Calls `onLine` with each unfolded line and the 1-based physical line it starts on. Accepts CRLF,
 * LF and lone CR. Blank physical lines are skipped without ending a folded line, so files whose
 * line ends got doubled (`\r\r\n`) still unfold; whitespace-only logical lines are skipped too.
 * Each doubled end counts as two physical lines, a lone CR and then a CRLF, so line numbers in
 * such files come out about twice what the producer meant.
 */
export function forEachUnfoldedLine(
  text: string,
  onLine: (content: string, line: number) => void,
): void {
  const length = text.length;
  let position = text.charCodeAt(0) === BOM ? 1 : 0;
  let physical = 0;
  // Cached so that a file using only one kind of line break isn't rescanned for the other.
  let nextLf = -2;
  let nextCr = -2;
  let parts: string[] = [];
  let partsLine = 0;

  const flush = () => {
    if (parts.length === 0) return;
    const content = parts.length === 1 ? parts[0]! : parts.join("");
    parts = [];
    if (!isBlank(content)) onLine(content, partsLine);
  };

  while (position < length) {
    physical += 1;
    if (nextLf !== -1 && nextLf < position) nextLf = text.indexOf("\n", position);
    if (nextCr !== -1 && nextCr < position) nextCr = text.indexOf("\r", position);

    let end = length;
    let next = length;
    if (nextCr !== -1 && (nextLf === -1 || nextCr < nextLf)) {
      end = nextCr;
      next = nextLf === nextCr + 1 ? nextCr + 2 : nextCr + 1;
    } else if (nextLf !== -1) {
      end = nextLf;
      next = nextLf + 1;
    }

    if (end > position) {
      const first = text.charCodeAt(position);
      if ((first === SPACE || first === TAB) && parts.length > 0) {
        parts.push(text.slice(position + 1, end));
      } else {
        flush();
        parts.push(text.slice(position, end));
        partsLine = physical;
      }
    }
    position = next;
  }
  flush();
}

function isBlank(content: string): boolean {
  const first = content.charCodeAt(0);
  if (first !== SPACE && first !== TAB) return false;
  return content.trim() === "";
}
