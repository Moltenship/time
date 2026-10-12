import { useEffect, useId, useState } from "react";

import { focusRing, Segmented } from "./controls";
import { themeCss, type Theme, type ThemeSource } from "./theme";

const extents = [
  { label: "Changed tokens", value: "changed" },
  { label: "All tokens", value: "full" },
] as const;

/** The theme as CSS to paste into an app, with only the changed tokens or all of them. */
export function CssOutput({
  source,
  theme,
}: {
  readonly source: ThemeSource;
  readonly theme: Theme;
}) {
  const id = useId();
  const [extent, setExtent] = useState<(typeof extents)[number]["value"]>("changed");
  const [status, setStatus] = useState("");
  const css = themeCss(source, theme, { full: extent === "full" });

  useEffect(() => {
    if (status === "") return;
    const timeout = setTimeout(() => setStatus(""), 2000);
    return () => clearTimeout(timeout);
  }, [status]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(css);
      setStatus("Copied");
    } catch {
      setStatus("Couldn't copy. Select the text instead.");
    }
  }

  return (
    <section aria-labelledby={id} className="rounded-xl border bg-fd-card">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <h3 className="me-auto text-sm font-medium text-fd-foreground" id={id}>
          CSS
        </h3>
        <span aria-live="polite" className="text-sm text-fd-muted-foreground" role="status">
          {status}
        </span>
        <Segmented
          label="Tokens to copy"
          onValueChange={setExtent}
          options={extents}
          value={extent}
        />
        <button
          className={`rounded-md bg-fd-primary px-3 py-1.5 text-sm font-medium text-fd-primary-foreground transition-opacity hover:opacity-90 ${focusRing}`}
          onClick={copy}
          type="button"
        >
          Copy CSS
        </button>
      </div>
      <pre
        aria-labelledby={id}
        className={`max-h-[32rem] overflow-auto p-4 font-mono text-xs leading-5 text-fd-foreground ${focusRing}`}
        tabIndex={0}
      >
        {css}
      </pre>
    </section>
  );
}
