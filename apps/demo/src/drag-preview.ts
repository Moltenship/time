import { useEffect, useState } from "react";

import type { SettingField } from "./settings";

/**
 * How pointer drags preview where they land, the option on trial in the views (`dragPreview`):
 * stepping from slot to slot, or following the pointer over a landing box.
 */
export type DemoDragPreview = "free" | "snapped";

const dragPreviewOptions = [
  {
    description: "The preview steps from slot to slot as you drag.",
    label: "Snap to grid",
    value: "snapped",
  },
  {
    description: "The event follows the pointer; a box shows where it lands when you let go.",
    label: "Free",
    value: "free",
  },
] as const satisfies readonly {
  readonly description: string;
  readonly label: string;
  readonly value: DemoDragPreview;
}[];

/** Reads `?drag=free`; anything else is the default, snapped. */
export function readDragPreview(search: string): DemoDragPreview {
  return new URLSearchParams(search).get("drag") === "free" ? "free" : "snapped";
}

/** `?drag=free` for free drags; the default leaves the parameter out. */
export function writeDragPreview(href: string, preview: DemoDragPreview): string {
  const url = new URL(href);
  if (preview === "free") url.searchParams.set("drag", "free");
  else url.searchParams.delete("drag");
  return url.toString();
}

/** The drag preview, initialised from the URL and mirrored back into it, so a link keeps it. */
export function useDragPreview() {
  const [preview, setPreview] = useState(() => readDragPreview(window.location.search));

  useEffect(() => {
    history.replaceState(history.state, "", writeDragPreview(window.location.href, preview));
  }, [preview]);

  return [preview, setPreview] as const;
}

/** The select for the drag preview, beside the other settings. */
export function dragPreviewField(
  preview: DemoDragPreview,
  onChange: (preview: DemoDragPreview) => void,
): SettingField {
  return {
    items: dragPreviewOptions,
    label: "Dragging",
    onValueChange: (value) => {
      const option = dragPreviewOptions.find((candidate) => candidate.value === value);
      if (option !== undefined) onChange(option.value);
    },
    value: preview,
  };
}
