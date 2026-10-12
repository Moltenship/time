import { GoogleCalendarPreviewIsland } from "./island";

/**
 * The sync guide's calendar against an in-memory Google Calendar API, with buttons that change
 * events "in Google", expire the sync token and rate-limit requests, and a log of the requests.
 * The frame is sized on the server, so the calendar loading into it never shifts the page.
 */
export function GoogleCalendarPreview() {
  return (
    <figure className="not-prose my-6">
      <div className="h-[46rem] overflow-hidden rounded-xl border bg-fd-background text-left shadow-sm">
        <GoogleCalendarPreviewIsland />
      </div>
      <figcaption className="mt-3 text-center text-sm text-fd-muted-foreground">
        Live, in your time zone, against a fake Calendar API in your browser. Change events here or
        “in Google”, and watch the requests.
      </figcaption>
    </figure>
  );
}
