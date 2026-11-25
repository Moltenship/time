"use client";

import { CheckIcon, CopyIcon } from "@/components/icons";
import { Fragment, useEffect, useState } from "react";

export default function InstallCommand({
  command,
  label = "Copy the command",
}: {
  readonly command: string;
  /** The copy button's accessible name, which says which command when a page has two. */
  readonly label?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);

  return (
    <div className="inline-flex min-h-11 max-w-full items-center gap-3 rounded-lg border bg-fd-card py-1.5 pr-1.5 pl-4 text-left font-mono text-[0.8125rem] shadow-xs">
      <span aria-hidden="true" className="text-fd-muted-foreground select-none">
        $
      </span>
      {/* A long command wraps on a narrow screen, at its spaces and never inside a word. */}
      <code className="min-w-0">
        {command.split(" ").map((word, index) => (
          // oxlint-disable-next-line react/no-array-index-key -- the words of a fixed string
          <Fragment key={index}>
            {index === 0 ? "" : " "}
            <span className="whitespace-nowrap">{word}</span>
          </Fragment>
        ))}
      </code>
      <button
        aria-label={copied ? "Copied" : label}
        className="grid size-8 shrink-0 place-items-center rounded-md text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
        onClick={() => {
          void navigator.clipboard.writeText(command).then(() => setCopied(true));
        }}
        type="button"
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
    </div>
  );
}
