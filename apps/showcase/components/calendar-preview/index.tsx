import type { LiveCalendarProps, PreviewView } from "./calendar";
import PreviewIsland, { OverlapPreviewIsland, ResourcePreviewIsland } from "./island";

export interface CalendarPreviewProps extends Partial<Omit<LiveCalendarProps, "view">> {
  /** Tailwind classes for the frame's size; replaces the default for the view. */
  readonly size?: string;
  /**
   * A view of the main preview, or a view of rooms and people: `"resources"` for resource columns,
   * `"timeline"` and `"timeline-day"` for the resource timeline over a week or a day.
   */
  readonly view?: PreviewView | ResourceView;
}

type ResourceView = "resources" | "timeline" | "timeline-day";

// Heights that fit the docs column; the day view is phone-width.
const frameSizes: Record<PreviewView | ResourceView, string> = {
  agenda: "h-[30rem]",
  day: "mx-auto h-[36rem] max-w-sm",
  month: "h-[36rem]",
  resources: "h-[36rem]",
  timeline: "h-[32rem]",
  "timeline-day": "h-[32rem]",
  week: "h-[32rem]",
  "scrolling-3-day": "h-[32rem]",
  "scrolling-day": "mx-auto h-[36rem] max-w-sm",
  "scrolling-month": "h-[36rem]",
  "scrolling-week": "h-[32rem]",
};

/**
 * The registry views, live: navigate, drag, resize and create. The frame is sized on the server,
 * so the calendar loading into it never shifts the page.
 */
export function CalendarPreview({ size, view = "week", ...props }: CalendarPreviewProps) {
  return (
    <figure className="not-prose my-6">
      <div
        className={`overflow-hidden rounded-xl border bg-fd-background text-left shadow-sm ${size ?? frameSizes[view]}`}
      >
        {view === "resources" ? (
          <ResourcePreviewIsland />
        ) : view === "timeline" || view === "timeline-day" ? (
          <ResourcePreviewIsland view={view === "timeline" ? "timeline-week" : "timeline-day"} />
        ) : (
          <PreviewIsland view={view} {...props} />
        )}
      </div>
      <figcaption className="mt-3 text-center text-sm text-fd-muted-foreground">
        {props.announcements === true
          ? "Live, in your time zone. Tab into the calendar or click a day, then try the keys below."
          : view === "agenda" && props.switcher !== true
            ? "Live, in your time zone."
            : view === "resources" || view === "timeline" || view === "timeline-day"
              ? "Live, in your time zone. Drag events between rooms and people, or resize and create them."
              : view.startsWith("scrolling-")
                ? "Live, in your time zone. Scroll or swipe through the days, and drag to move, resize or create events."
                : "Live, in your time zone. Drag to move, resize or create events."}
      </figcaption>
    </figure>
  );
}

/** Three busy days in the time grid, with a live toggle between the overlap layouts. */
export function OverlapLayoutPreview() {
  return (
    <figure className="not-prose my-6">
      <div className="h-[32rem] overflow-hidden rounded-xl border bg-fd-background text-left shadow-sm">
        <OverlapPreviewIsland />
      </div>
      <figcaption className="mt-3 text-center text-sm text-fd-muted-foreground">
        Live. Switch the layout, or drag events to see the others make room.
      </figcaption>
    </figure>
  );
}
