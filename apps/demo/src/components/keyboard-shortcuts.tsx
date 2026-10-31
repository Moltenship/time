import { DemoCalendar } from "../calendar";
import { useShortcutKeys } from "../shortcuts";

export interface KeyboardShortcutsProps {
  readonly onCreate: () => void;
  readonly onHelp: () => void;
  /** Whether d, x, w, m, and a open the scrolling day, 3 days, week, month, and agenda. */
  readonly scrolling: boolean;
}

export function KeyboardShortcuts({ onCreate, onHelp, scrolling }: KeyboardShortcutsProps) {
  useShortcutKeys(DemoCalendar.useCalendarActions(), onCreate, onHelp, scrolling);

  return null;
}
