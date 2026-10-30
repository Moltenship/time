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
