import { DndKitPreviewIsland } from "./island";

/**
 * The dnd-kit guide's backlog and week. The frame is sized on the server, so the calendar loading
 * into it never shifts the page.
 */
export function DndKitPreview() {
  return (
    <figure className="not-prose my-6">
      <div className="h-[36rem] overflow-hidden rounded-xl border bg-fd-background text-left shadow-sm">
        <DndKitPreviewIsland />
      </div>
      <figcaption className="mt-3 text-center text-sm text-fd-muted-foreground">
        Live. Drag a task onto the week, and a meeting back to the backlog. The all-day row takes no
        meetings.
      </figcaption>
    </figure>
  );
}
