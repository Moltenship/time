import type { IcsIssue } from "@moltenship/ics";
import { useDeferredValue, useId, useMemo, useRef, useState } from "react";

import { formatIssuePath, parsePlayground } from "./parse";
import { sampleIcs } from "./sample";

const paneHeader = "flex h-11 shrink-0 items-center justify-between gap-3 border-b px-3";
const focusRing =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:ring-inset";

// The text offsets of a 1-based line, as the parser counts lines: one per line break.
function lineRange(text: string, line: number): readonly [number, number] {
  let start = 0;
  for (let current = 1; current < line; current += 1) {
    const next = text.indexOf("\n", start);
    if (next === -1) return [text.length, text.length];
    start = next + 1;
  }
  const end = text.indexOf("\n", start);
  return [start, end === -1 ? text.length : end];
}

function SeverityBadge({ severity }: { readonly severity: IcsIssue["severity"] }) {
  return (
    <span
      className={`shrink-0 self-start rounded px-1.5 py-0.5 font-medium ${
        severity === "error" ? "bg-fd-error/10 text-fd-error" : "bg-brand/15 text-fd-foreground"
      }`}
    >
      {severity}
    </span>
  );
}

/** Selects the issue's line in the text, since the textarea has no line numbers. */
function LineButton({
  line,
  onSelect,
}: {
  readonly line: number;
  readonly onSelect: (line: number) => void;
}) {
  return (
    <button
      aria-label={`Go to line ${line}`}
      className="rounded text-fd-muted-foreground underline decoration-fd-border underline-offset-2 hover:text-fd-foreground focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:outline-none"
      onClick={() => onSelect(line)}
      type="button"
    >
      line {line}
    </button>
  );
}

/** Editable ICS text on the left, its issues and typed result on the right. */
export default function IcsPlayground() {
  const [text, setText] = useState(sampleIcs);
  const deferredText = useDeferredValue(text);
  const result = useMemo(() => parsePlayground(deferredText), [deferredText]);
  const stale = text !== deferredText;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const inputId = `${id}-input`;
  const issuesId = `${id}-issues`;
  const resultId = `${id}-result`;

  function goToLine(line: number) {
    const textarea = textareaRef.current;
    if (textarea === null) return;
    const [start, end] = lineRange(textarea.value, line);
    textarea.focus();
    textarea.setSelectionRange(start, end);
    const lineHeight = Number.parseFloat(getComputedStyle(textarea).lineHeight) || 20;
    textarea.scrollTop = Math.max(0, (line - 1) * lineHeight - textarea.clientHeight / 3);
    textarea.scrollLeft = 0;
  }

  return (
    <div className="grid h-full grid-rows-[18rem_minmax(0,1fr)] text-sm @2xl:grid-cols-2 @2xl:grid-rows-1">
      <div className="flex min-h-0 min-w-0 flex-col border-b @2xl:border-r @2xl:border-b-0">
        <div className={paneHeader}>
          <label className="font-medium" htmlFor={inputId}>
            ICS text
          </label>
          <button
            className="rounded-md px-2 py-1 text-xs text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:outline-none"
            onClick={() => setText(sampleIcs)}
            type="button"
          >
            Reset sample
          </button>
        </div>
        <textarea
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          className={`min-h-0 flex-1 resize-none bg-fd-card p-3 font-mono text-xs leading-5 text-fd-foreground ${focusRing}`}
          id={inputId}
          onChange={(event) => setText(event.target.value)}
          ref={textareaRef}
          spellCheck={false}
          value={text}
          wrap="off"
        />
      </div>

      <div
        className={`flex min-h-0 min-w-0 flex-col transition-opacity ${stale ? "opacity-70" : ""}`}
      >
        <div className={paneHeader}>
          <span className="font-medium" id={issuesId}>
            Issues
          </span>
          <p aria-live="polite" className="text-xs text-fd-muted-foreground" role="status">
            {result.summary}
          </p>
        </div>
        {result.issues.length === 0 ? (
          <p className="shrink-0 border-b px-3 py-3 text-xs text-fd-muted-foreground">
            No issues. Delete a DTSTART line to see one.
          </p>
        ) : (
          <ol aria-labelledby={issuesId} className="max-h-40 shrink-0 overflow-auto border-b">
            {result.issues.map((issue, index) => (
              <li className="flex gap-2 border-b px-3 py-2 text-xs last:border-b-0" key={index}>
                <SeverityBadge severity={issue.severity} />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="flex flex-wrap items-center gap-x-2">
                    <code className="font-mono">{issue.code}</code>
                    {issue.line === undefined ? null : (
                      <LineButton line={issue.line} onSelect={goToLine} />
                    )}
                  </p>
                  <p className="text-fd-foreground">{issue.message}</p>
                  {issue.path.length === 0 ? null : (
                    <p className="font-mono break-all text-fd-muted-foreground">
                      {formatIssuePath(issue.path)}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
        <div className={paneHeader}>
          <span className="font-medium" id={resultId}>
            Result
          </span>
          <code className="text-xs text-fd-muted-foreground">calendars</code>
        </div>
        <pre
          aria-labelledby={resultId}
          className={`min-h-0 flex-1 overflow-auto bg-fd-card p-3 font-mono text-xs leading-5 text-fd-foreground ${focusRing}`}
          tabIndex={0}
        >
          {result.json}
        </pre>
      </div>
    </div>
  );
}
