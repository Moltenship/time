import { HistoryPreviewIsland } from "./island";

/**
 * The week view with undo and redo buttons in its toolbar, the undo toast and its keys: move,
 * resize, create or delete a meeting, then take it back. The frame is sized on the server, so
 * the calendar loading into it never shifts the page.
 */
export function HistoryPreview() {
  return (
    <figure className="not-prose my-6">
      <div className="h-[34rem] overflow-hidden rounded-xl border bg-fd-background text-left shadow-sm">
        <HistoryPreviewIsland />
      </div>
      <figcaption className="mt-3 text-center text-sm text-fd-muted-foreground">
        Live. Drag, resize, create or delete a meeting, then undo it from the toast, the toolbar, or
        with ⌘Z or Ctrl+Z.
      </figcaption>
    </figure>
  );
}
