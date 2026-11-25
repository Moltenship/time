/**
 * The toolbar's classes, one place for every framework's markup: each name is the element it
 * styles. Restyle the toolbar here.
 */

export const calendarToolbarClass = "flex h-14 shrink-0 items-center gap-0.5 px-2 sm:gap-2 sm:px-4";

/** Today: an icon on a phone, the word from `sm` up. */
export const calendarTodayClass = "rounded-full max-sm:w-8 max-sm:px-0 sm:px-4";
export const calendarTodayIconClass = "sm:hidden";
export const calendarTodayTextClass = "max-sm:hidden";

export const calendarStepsClass = "flex items-center";
export const calendarStepClass = "rounded-full";
/** The step arrows point to the inline start and end, so they turn in right-to-left text. */
export const calendarStepIconClass = "rtl:rotate-180";

/**
 * On a phone or a small tablet, upright or turned, a long title such as a week across two years
 * wraps onto a second line.
 */
export const calendarTitleClass =
  "min-w-0 text-base max-lg:line-clamp-2 max-lg:leading-tight max-lg:text-balance sm:text-xl lg:truncate";

/** The trailing actions, such as the view switcher. */
export const calendarActionsClass = "ms-auto flex shrink-0 items-center gap-1 sm:gap-2";

/** The view switcher's trigger, and the shortcut beside each view's name in its list. */
export const viewSwitcherTriggerClass = "rounded-full sm:w-26";
export const viewSwitcherShortcutClass = "ms-auto font-sans text-xs text-muted-foreground";
