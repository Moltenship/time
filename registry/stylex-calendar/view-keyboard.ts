import {
  useCalendarKeyboard,
  type CalendarKeyboardHandlers,
  type CalendarKeyboardOptions,
} from "@moltenship/calendar";
import { useMemo } from "react";

/** Keys a view moves focus with; inside a view they never reach the app's own shortcuts. */
const navigationKeys = new Set([
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "End",
  "Home",
  "PageDown",
  "PageUp",
]);

/**
 * `useCalendarKeyboard` for the element around a view. Keys from portals the view renders, such
 * as the month's "+N more" list, stay with their own elements: React bubbles them through the
 * view, where they would act on its earlier focus. And navigation keys are the view's even where
 * it has nowhere to go, such as past the last event in a column, so they don't fall through to
 * shortcuts like "next period".
 */
export function useViewKeyboard(options?: CalendarKeyboardOptions): CalendarKeyboardHandlers {
  const keyboard = useCalendarKeyboard(options);

  return useMemo(
    () => ({
      onBlur: keyboard.onBlur,
      onKeyDown(event) {
        if (!event.currentTarget.contains(event.target as Node)) return;
        keyboard.onKeyDown(event);
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if (navigationKeys.has(event.key)) event.preventDefault();
      },
    }),
    [keyboard],
  );
}
