import { useEffect } from "react";

import { viewFor } from "./scrolling";
import { shortcutCommand, type ShortcutActions } from "./shortcuts";

/** Global shortcuts: t today, d/x/w/m/y/a views, j/k or ←/→ to step, c to create, ? for help. */
export function useShortcutKeys(
  actions: ShortcutActions,
  onCreate: () => void,
  onHelp: () => void,
  /** Whether d, x, w, m, and a open the scrolling day, 3 days, week, month, and agenda. */
  scrolling: boolean,
) {
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
}
