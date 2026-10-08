"use client";

import { CheckIcon, CopyIcon } from "@/components/icons";
import { useEffect, useState } from "react";

export default function InstallCommand({ command }: { readonly command: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);

  return (
    <div className="inline-flex h-11 max-w-full items-center gap-3 rounded-lg border bg-fd-card pr-1.5 pl-4 font-mono text-sm shadow-xs">
      <span aria-hidden="true" className="text-fd-muted-foreground select-none">
        $
      </span>
      <code className="truncate">{command}</code>
      <button
        aria-label={copied ? "Copied" : "Copy install command"}
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
