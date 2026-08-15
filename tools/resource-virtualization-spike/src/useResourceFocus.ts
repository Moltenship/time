import type { VirtualItem, Virtualizer } from "@tanstack/react-virtual";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";

import type { LabResource } from "./model";

interface ResourceFocusOptions {
  readonly resourceAxisRef: RefObject<HTMLDivElement | null>;
  readonly resources: readonly LabResource[];
  readonly rowVirtualizer: Virtualizer<HTMLDivElement, HTMLDivElement>;
  readonly viewportRef: RefObject<HTMLDivElement | null>;
  readonly virtualRows: readonly VirtualItem[];
}

export function useResourceFocus({
  resourceAxisRef,
  resources,
  rowVirtualizer,
  viewportRef,
  virtualRows,
}: ResourceFocusOptions) {
  const retainFocusRef = useRef(false);
  const pendingFocusRef = useRef(false);
  const [activeResourceId, setActiveResourceId] = useState(resources[0]?.id ?? "");

  useLayoutEffect(() => {
    if (!pendingFocusRef.current && !retainFocusRef.current) {
      return;
    }

    const activeElement = document.activeElement;
    const shouldRestore =
      pendingFocusRef.current || activeElement === document.body || activeElement === null;
    const node = resourceAxisRef.current?.querySelector<HTMLElement>(
      `[data-resource-id="${activeResourceId}"]`,
    );
    if (node !== undefined && node !== null && shouldRestore) {
      node.focus({ preventScroll: true });
      pendingFocusRef.current = false;
    }
  }, [activeResourceId, resourceAxisRef, virtualRows]);

  const focusResource = useCallback(
    (index: number) => {
      const safeIndex = Math.max(0, Math.min(index, resources.length - 1));
      const resource = resources[safeIndex];
      if (resource === undefined) {
        return;
      }

      retainFocusRef.current = true;
      pendingFocusRef.current = true;
      setActiveResourceId(resource.id);
      rowVirtualizer.scrollToIndex(safeIndex, { align: "center" });
      viewportRef.current?.dispatchEvent(new Event("scroll", { bubbles: true }));
    },
    [resources, rowVirtualizer, viewportRef],
  );

  const handleResourceKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        focusResource(index + 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        focusResource(index - 1);
      } else if (event.key === "Home") {
        event.preventDefault();
        focusResource(0);
      } else if (event.key === "End") {
        event.preventDefault();
        focusResource(resources.length - 1);
      }
    },
    [focusResource, resources.length],
  );

  const handleResourceBlur = useCallback(
    (event: FocusEvent<HTMLButtonElement>) => {
      if (
        event.relatedTarget instanceof Node &&
        !resourceAxisRef.current?.contains(event.relatedTarget)
      ) {
        retainFocusRef.current = false;
      }
    },
    [resourceAxisRef],
  );

  const handleResourceFocus = useCallback((resourceId: string) => {
    retainFocusRef.current = true;
    setActiveResourceId(resourceId);
  }, []);

  return Object.freeze({
    activeResourceId,
    focusResource,
    handleResourceBlur,
    handleResourceFocus,
    handleResourceKeyDown,
  });
}
