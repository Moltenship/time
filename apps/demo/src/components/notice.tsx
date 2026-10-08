import { useCallback, useEffect, useState } from "react";

/** A message that dismisses itself after a few seconds. */
export function useNotice() {
  const [notice, setNotice] = useState<{ readonly id: number; readonly text: string } | null>(null);

  useEffect(() => {
    if (notice === null) return;
    const timer = setTimeout(() => setNotice(null), 4_000);
    return () => clearTimeout(timer);
  }, [notice]);

  const show = useCallback((text: string) => setNotice({ id: Date.now(), text }), []);
  return [notice?.text ?? null, show] as const;
}

/** A polite live region, mounted up front so screen readers announce each message. */
export function Notice({ text }: { readonly text: string | null }) {
  return (
    <div
      aria-live="polite"
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 lg:bottom-6"
    >
      {text !== null && (
        <p className="rounded-lg bg-foreground px-4 py-2.5 text-sm text-background shadow-lg animate-in fade-in-0 slide-in-from-bottom-2">
          {text}
        </p>
      )}
    </div>
  );
}
