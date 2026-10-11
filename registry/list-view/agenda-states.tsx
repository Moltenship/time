import { useRovingFocus, type PlainDateInterval } from "@moltenship/calendar";
import { CalendarX2Icon, LoaderCircleIcon } from "lucide-react";
import { useId } from "react";

import { cn } from "cn";

import type { AgendaFormats } from "./agenda-day";

/** A spinner that stays still when the system asks for reduced motion. */
function Spinner({ className }: { readonly className: string }) {
  return (
    <LoaderCircleIcon
      aria-hidden
      className={cn("text-muted-foreground motion-safe:animate-spin", className)}
    />
  );
}

/**
 * The weeks from the anchor date without events, or still loading, in place of the list. Still
 * the agenda's one tab stop: Up and Page Up from it page back, and Down and Page Down page on, so
 * keyboard paging can cross empty weeks.
 */
export function EmptyAgenda({
  dates,
  loading,
  start,
}: {
  /** The weeks from the anchor date, as text. */
  readonly dates: string;
  readonly loading: boolean;
  /** The anchor date, which the empty state stands in for. */
  readonly start: Temporal.PlainDate;
}) {
  const roving = useRovingFocus({ date: start, kind: "day" });
  const id = useId();

  return (
    <div
      role="group"
      aria-busy={loading || undefined}
      aria-labelledby={id}
      {...roving}
      onKeyDown={(event) => {
        // Only for paging: the agenda has no cells, so Space must not start an event here.
        if (event.key === " ") event.preventDefault();
      }}
      className="flex flex-col items-center gap-2 rounded-lg p-4 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
    >
      {loading ? (
        <Spinner className="mb-1 size-10" />
      ) : (
        <CalendarX2Icon aria-hidden className="mb-1 size-10 text-muted-foreground/60" />
      )}
      <div id={id} className="flex flex-col gap-2">
        <p className="font-medium">{loading ? "Loading events" : "No events"}</p>
        <p className="text-sm text-muted-foreground">
          {loading
            ? `Fetching what's scheduled for ${dates}.`
            : `Nothing is scheduled for ${dates}.`}
        </p>
      </div>
    </div>
  );
}

/**
 * What the end of a scrolling agenda says, after the last loaded day: that events are loading, or
 * that nothing more is scheduled through the last loaded date.
 */
export function AgendaEndMessage({
  empty,
  formats,
  loading,
}: {
  /** The loaded dates after the last day; `null` when the last day is the last date loaded. */
  readonly empty: PlainDateInterval | null;
  readonly formats: AgendaFormats;
  readonly loading: boolean;
}) {
  return (
    <p className="px-3 py-4 text-center text-sm text-muted-foreground sm:px-6">
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <Spinner className="size-4" />
          Loading events…
        </span>
      ) : empty === null ? null : (
        `Nothing more is scheduled through ${formats.date.format(empty.end.subtract({ days: 1 }))}.`
      )}
    </p>
  );
}
