import { useShortcutKeys } from "../../shortcuts";
import { StylexDemoCalendar } from "../calendar";

export interface KeyboardShortcutsProps {
  readonly onCreate: () => void;
  readonly onHelp: () => void;
  /** Whether d, x, w, m, and a open the scrolling day, 3 days, week, month, and agenda. */
  readonly scrolling: boolean;
}

export function KeyboardShortcuts({ onCreate, onHelp, scrolling }: KeyboardShortcutsProps) {
  useShortcutKeys(StylexDemoCalendar.useCalendarActions(), onCreate, onHelp, scrolling);

  return null;
}
