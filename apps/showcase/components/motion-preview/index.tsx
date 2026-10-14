import { MotionPreviewIsland } from "./island";

/**
 * The Motion guide's week: a meeting grows into its card when clicked, and a card follows each
 * drag. The frame is sized on the server, so the calendar loading into it never shifts the page.
 */
export function MotionPreview() {
  return (
    <figure className="not-prose my-6">
      <div className="h-[34rem] overflow-hidden rounded-xl border bg-fd-background text-left shadow-sm">
        <MotionPreviewIsland />
      </div>
      <figcaption className="mt-3 text-center text-sm text-fd-muted-foreground">
        Live. Click a meeting, then close its card. Drag a meeting to another time.
      </figcaption>
    </figure>
  );
}
