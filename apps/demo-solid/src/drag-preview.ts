/**
 * How pointer drags preview where they land, each view's `dragPreview`: stepping from slot to slot,
 * or following the pointer over a landing box. The React demo's setting (apps/demo/src/drag-preview.ts).
 */
export type DragPreview = "free" | "snapped";

export const dragPreviewOptions = [
  { label: "Snap to grid", value: "snapped" },
  { label: "Free", value: "free" },
] as const satisfies readonly { readonly label: string; readonly value: DragPreview }[];

/** Reads `?drag=free`; anything else is the default, snapped. */
export function readDragPreview(search: string): DragPreview {
  return new URLSearchParams(search).get("drag") === "free" ? "free" : "snapped";
}

/** `?drag=free` for free drags; the default leaves the parameter out. */
export function writeDragPreview(href: string, preview: DragPreview): string {
  const url = new URL(href);
  if (preview === "free") url.searchParams.set("drag", "free");
  else url.searchParams.delete("drag");
  return url.toString();
}
