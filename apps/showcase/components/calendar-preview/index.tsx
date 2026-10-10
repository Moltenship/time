import type { LiveCalendarProps, PreviewView } from "./calendar";
import PreviewIsland, { ResourcePreviewIsland } from "./island";

export interface CalendarPreviewProps extends Partial<Omit<LiveCalendarProps, "view">> {
  /** Tailwind classes for the frame's size; replaces the default for the view. */
  readonly size?: string;
  /** A view of the main preview, or `"resources"` for resource columns of rooms and people. */
  readonly view?: PreviewView | "resources";
}

// Heights that fit the docs column; the day view is phone-width.
const frameSizes: Record<PreviewView | "resources", string> = {
  agenda: "h-[30rem]",
  day: "mx-auto h-[36rem] max-w-sm",
  month: "h-[36rem]",
  resources: "h-[36rem]",
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
        {view === "resources" ? (
          <ResourcePreviewIsland />
        ) : (
          <PreviewIsland view={view} {...props} />
        )}
      </div>
      <figcaption className="mt-3 text-center text-sm text-fd-muted-foreground">
        {props.announcements === true
          ? "Live, in your time zone. Tab into the calendar or click a day, then try the keys below."
          : view === "agenda" && props.switcher !== true
            ? "Live, in your time zone."
            : view === "resources"
              ? "Live, in your time zone. Drag events between rooms and people, or resize and create them."
              : "Live, in your time zone. Drag to move, resize or create events."}
      </figcaption>
    </figure>
  );
}
