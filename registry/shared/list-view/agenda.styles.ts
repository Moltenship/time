import { cn } from "cn";

/**
 * The agenda's classes, one place for every framework's markup: each name is the element it
 * styles. Restyle the agenda here.
 */

/** The element that scrolls the days, and holds the keyboard. */
export const agendaScrollClass = "relative h-full overflow-y-auto";
/** The view's dates without events, in place of the list. */
export const emptyAgendaViewClass = "flex h-full items-center justify-center p-6 text-center";
export const agendaListClass = "relative";
/** A scrolling agenda's empty state, among the days or at the end of the list. */
export const scrollingAgendaEmptyClass = "flex flex-1 items-center justify-center p-6 text-center";

/** A row the virtualizer places: a day, or a scrolling agenda's empty row. The last has no rule. */
export function agendaRowClass(last: boolean): string {
  return cn("absolute inset-x-0", !last && "border-b border-calendar-grid");
}

/** The end of a scrolling agenda, a viewport tall. */
export const agendaEndRowClass = "absolute inset-x-0 flex flex-col";

export const agendaDayClass = "flex gap-3 px-3 py-2 sm:gap-6 sm:px-6";
/** The day's weekday and date, which stick to the top while its events scroll past. */
export const agendaDateColumnClass =
  "sticky top-0 flex w-12 shrink-0 flex-col items-center gap-0.5 self-start pt-1";

export function agendaWeekdayClass(isToday: boolean): string {
  return cn(
    "text-[0.6875rem] font-medium uppercase",
    isToday ? "text-calendar-today" : "text-muted-foreground",
  );
}

export function agendaDateClass(isToday: boolean): string {
  return cn(
    "flex size-9 items-center justify-center rounded-full text-lg tabular-nums hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
    isToday && "bg-calendar-today text-calendar-today-foreground hover:bg-calendar-today/90",
  );
}

export const agendaEventsClass = "flex min-w-0 flex-1 flex-col gap-0.5 py-1";

/**
 * An event's row, on the event chip's classes. Muted text turns accent-foreground on the hover
 * fill: muted on accent falls short of 4.5:1.
 */
export const agendaItemClass =
  "group/event w-full gap-x-3 gap-y-0.5 border-s-0 bg-transparent py-1.5 text-sm font-normal text-foreground hover:bg-accent hover:brightness-100 max-sm:flex-col max-sm:items-start";
export const agendaTimeColumnClass = "flex shrink-0 items-center gap-2 sm:w-44";
/** The event's colour, as a dot. */
export const agendaDotClass = "size-2.5 shrink-0 rounded-full bg-calendar-event-border";
export const agendaAllDayClass =
  "rounded-full bg-calendar-event px-2 py-0.5 text-xs font-medium text-calendar-event-foreground";
export const agendaTimeClass =
  "text-muted-foreground tabular-nums group-hover/event:text-accent-foreground max-sm:text-xs";
export const agendaTitleColumnClass =
  "flex min-w-0 flex-1 items-baseline gap-2 max-sm:w-full max-sm:pl-4.5";
export const agendaTitleClass = "truncate font-medium";
/** The event's icon, sized for the row's larger text. */
export const agendaEventIconClass = "size-3.5 [&_svg]:size-3.5";
export const agendaDayOfClass =
  "shrink-0 text-xs text-muted-foreground group-hover/event:text-accent-foreground";

/** A spinner that stays still when the system asks for reduced motion. */
export function agendaSpinnerClass(className: string): string {
  return cn("text-muted-foreground motion-safe:animate-spin", className);
}

export const emptyAgendaClass =
  "flex flex-col items-center gap-2 rounded-lg p-4 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";
export const emptyAgendaIconClass = "mb-1 size-10 text-muted-foreground/60";
export const emptyAgendaSpinnerClass = "mb-1 size-10";
export const emptyAgendaTextClass = "flex flex-col gap-2";
export const emptyAgendaTitleClass = "font-medium";
export const emptyAgendaDetailClass = "text-sm text-muted-foreground";

export const agendaEndClass = "px-3 py-4 text-center text-sm text-muted-foreground sm:px-6";
export const agendaEndLoadingClass = "inline-flex items-center gap-2";
export const agendaEndSpinnerClass = "size-4";
