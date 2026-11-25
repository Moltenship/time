import { useCalendarKeyboard, type CalendarKeyboardOptions } from "@moltenship/calendar-solid";

import { isViewNavigationKey } from "@registry/shared/calendar/view-keys";

/**
 * `useCalendarKeyboard` for the element around a view, as a ref: `<div ref={keyboard}>`.
 * Navigation keys are the view's even where it has nowhere to go, such as past the last event in
 * a column, so they don't fall through to shortcuts like "next period".
 */
export function useViewKeyboard(options?: CalendarKeyboardOptions): (element: HTMLElement) => void {
  const keyboard = useCalendarKeyboard(options);
  const keyDown = (event: KeyboardEvent) => {
    if (isViewNavigationKey(event)) event.preventDefault();
  };
  let attached: HTMLElement | undefined;
  return (element) => {
    attached?.removeEventListener("keydown", keyDown);
    // After the calendar's own listener, which `keyboard` adds.
    keyboard(element);
    element.addEventListener("keydown", keyDown);
    attached = element;
  };
}
