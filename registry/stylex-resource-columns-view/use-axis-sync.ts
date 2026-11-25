import { useCallback, useState, type RefObject } from "react";

import { createAxisSync } from "@registry/shared/resource-columns-view/axis-sync";

/**
 * The axis sync (`axis-sync.ts`) in a React component: attach `followX` or `followY` as the ref of
 * each element that follows the body's scroll, and call `sync` on the body's scroll events.
 */
export function useAxisSync(bodyRef: RefObject<HTMLElement | null>) {
  const [axes] = useState(() => createAxisSync(() => bodyRef.current));
  const followX = useCallback(
    (element: HTMLElement | null) => (element === null ? undefined : axes.follow(element, "x")),
    [axes],
  );
  const followY = useCallback(
    (element: HTMLElement | null) => (element === null ? undefined : axes.follow(element, "y")),
    [axes],
  );
  return { followX, followY, sync: axes.sync };
}
