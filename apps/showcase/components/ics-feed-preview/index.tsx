import { IcsFeedCalendarIsland, IcsFeedSourceIsland } from "./island";

/**
 * A sample ICS feed for the visitor's week, parsed in the browser and shown in the live week view
 * in their time zone, with its source below. The frame is sized on the server, so the calendar
 * loading into it never shifts the page.
 */
export function IcsFeedPreview() {
  return (
    <div className="not-prose my-6">
      <figure>
        <div className="h-[32rem] overflow-hidden rounded-xl border bg-fd-background text-left shadow-sm">
          <IcsFeedCalendarIsland />
        </div>
        <figcaption className="mt-3 text-center text-sm text-fd-muted-foreground">
          Live, in your time zone. Parsed in your browser from the ICS feed below.
        </figcaption>
      </figure>
      <details className="group mt-4 rounded-xl border bg-fd-card text-sm">
        <summary className="cursor-pointer px-4 py-3 font-medium select-none">
          The feed’s ICS source
        </summary>
        <div className="border-t p-2">
          <IcsFeedSourceIsland />
        </div>
      </details>
    </div>
  );
}
