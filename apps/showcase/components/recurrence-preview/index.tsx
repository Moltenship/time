import { RecurrencePreviewIsland } from "./island";

/**
 * Recurring events in the live week view: drag an occurrence, or select one and delete it, and the
 * scope dialog asks which events of the series the change applies to. The frame is sized on the
 * server, so the calendar loading into it never shifts the page.
 */
export function RecurrencePreview() {
  return (
    <figure className="not-prose my-6">
      <div className="h-[34rem] overflow-hidden rounded-xl border bg-fd-background text-left shadow-sm">
        <RecurrencePreviewIsland />
      </div>
      <figcaption className="mt-3 text-center text-sm text-fd-muted-foreground">
        Live, in your time zone. Drag an occurrence, or select one and delete it, then pick which
        events the change applies to.
      </figcaption>
    </figure>
  );
}
