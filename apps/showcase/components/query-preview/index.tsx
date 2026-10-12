import { QueryPreviewIsland } from "./island";

/**
 * The TanStack Query guide's calendar, loading from a pretend server as you navigate and saving
 * your changes to it. The frame is sized on the server, so the calendar loading into it never
 * shifts the page.
 */
export function QueryPreview() {
  return (
    <figure className="not-prose my-6">
      <div className="h-[36rem] overflow-hidden rounded-xl border bg-fd-background text-left shadow-sm">
        <QueryPreviewIsland />
      </div>
      <figcaption className="mt-3 text-center text-sm text-fd-muted-foreground">
        Live, from a pretend server that takes 0.7 seconds to answer. Go to other weeks and months,
        and drag, resize or create events.
      </figcaption>
    </figure>
  );
}
