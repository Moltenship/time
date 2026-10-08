import type { LiveCalendarProps, PreviewView } from "./calendar";
import PreviewIsland from "./island";

export interface CalendarPreviewProps extends Partial<LiveCalendarProps> {
  /** Tailwind classes for the frame's size; replaces the default for the view. */
  readonly size?: string;
}

// Heights that fit the docs column; the day view is phone-width.
const frameSizes: Record<PreviewView, string> = {
  agenda: "h-[30rem]",
  day: "mx-auto h-[36rem] max-w-sm",
  month: "h-[36rem]",
  week: "h-[32rem]",
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
        <PreviewIsland view={view} {...props} />
      </div>
      <figcaption className="mt-3 text-center text-sm text-fd-muted-foreground">
        {view === "agenda" && props.switcher !== true
          ? "Live, in your time zone."
          : "Live, in your time zone. Drag to move, resize or create events."}
      </figcaption>
    </figure>
  );
}
