import { useEffect } from "react";

import { DemoCalendar } from "../calendar";
import { shortcutCommand } from "../shortcuts";

/** Global shortcuts: t today, d/w/m/a views, j/k or ←/→ to step, c to create. */
export function KeyboardShortcuts({ onCreate }: { readonly onCreate: () => void }) {
  const actions = DemoCalendar.useCalendarActions();

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const command = shortcutCommand(event);
      if (command === undefined) return;
      event.preventDefault();
      if (command.type === "view") actions.setView(command.view);
      else if (command.type === "create") onCreate();
      else if (command.type === "next") actions.navigateNext();
      else if (command.type === "previous") actions.navigatePrevious();
      else actions.navigateToday();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [actions, onCreate]);

  return null;
}
