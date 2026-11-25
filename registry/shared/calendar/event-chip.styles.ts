/**
 * The event chip's classes, for every framework's chip: the base event surface of every view,
 * with a tinted fill, an accent edge and readable text.
 *
 * `data-dragging` marks the event a pointer drag is moving; its preview follows the pointer.
 * `data-grabbed` marks the event a keyboard gesture is moving; it moves with the keys.
 * `data-invalid` and `data-warning` mark a preview the policies would reject or flag.
 */
export const eventChipClass =
  "flex min-w-0 items-center gap-1.5 overflow-hidden rounded-md border-s-3 border-calendar-event-border bg-calendar-event px-2 py-1 text-start text-xs leading-tight font-medium text-calendar-event-foreground transition-[filter,box-shadow] hover:brightness-[0.97] focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring data-dragging:opacity-40 data-grabbed:z-20 data-grabbed:shadow-lg data-invalid:ring-2 data-invalid:ring-calendar-invalid data-pending:opacity-60 data-warning:ring-2 data-warning:ring-calendar-warning dark:hover:brightness-110";

/** The icon before an event's title, in the chip's text colour. */
export const eventIconClass =
  "me-1 inline-flex size-3 shrink-0 items-center justify-center align-[-0.125em] [&_svg]:size-3 [&_svg]:shrink-0";
