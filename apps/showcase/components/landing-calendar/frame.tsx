// Shared by the live calendar and its fallback so swapping one for the other never shifts layout.
export const calendarFrameClass =
  "flex h-[34rem] flex-col overflow-hidden rounded-xl border bg-fd-background text-left shadow-2xl shadow-black/5 sm:h-[40rem] dark:shadow-black/40";

export const calendarCaptionClass =
  "mt-3 min-h-5 text-center text-sm text-balance text-fd-muted-foreground";

/** Static stand-in while Temporal and the calendar load in the browser. */
export function CalendarSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading calendar">
      <div className={calendarFrameClass}>
        <div className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
          <span className="h-8 w-20 rounded-full bg-fd-muted" />
          <span className="h-5 w-40 rounded-md bg-fd-muted" />
        </div>
        <div className="flex-1 bg-[linear-gradient(to_bottom,var(--color-fd-border)_1px,transparent_1px)] bg-size-[100%_3rem]" />
      </div>
      <p className={calendarCaptionClass} />
    </div>
  );
}
