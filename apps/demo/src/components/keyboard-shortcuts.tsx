import { useEffect } from "react";

import { DemoCalendar } from "../calendar";
import { viewFor } from "../scrolling";
import { shortcutCommand } from "../shortcuts";

export interface KeyboardShortcutsProps {
  readonly onCreate: () => void;
  readonly onHelp: () => void;
  /** Whether d, w, and m open the scrolling day, week, and month. */
  readonly scrolling: boolean;
}

/** Global shortcuts: t today, d/w/m/a views, j/k or ←/→ to step, c to create, ? for help. */
export function KeyboardShortcuts({ onCreate, onHelp, scrolling }: KeyboardShortcutsProps) {
  const actions = DemoCalendar.useCalendarActions();

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const command = shortcutCommand(event);
      if (command === undefined) return;
      event.preventDefault();
      if (command.type === "view") actions.setView(viewFor(command.view, scrolling));
      else if (command.type === "create") onCreate();
      else if (command.type === "help") onHelp();
      else if (command.type === "next") actions.navigateNext();
      else if (command.type === "previous") actions.navigatePrevious();
      else actions.navigateToday();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [actions, onCreate, onHelp, scrolling]);

  return null;
}
