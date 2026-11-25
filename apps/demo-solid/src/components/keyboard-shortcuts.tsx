import { onCleanup } from "solid-js";

import { shortcutCommand } from "@demo/shortcuts";

import { Calendar } from "../calendar";
import { viewFor } from "../scrolling";
import { hasView, viewNames } from "../workspace";

/** Global shortcuts, as in React: t today, d/x/w/m/y/a views, j/k or ←/→ to step, c, and ?. */
export function KeyboardShortcuts(props: {
  readonly onCreate: () => void;
  readonly onHelp: () => void;
  /** Whether the views' keys open their scrolling versions. */
  readonly scrolling: boolean;
}) {
  const actions = Calendar.useCalendarActions();
  const listener = (event: KeyboardEvent) => {
    const command = shortcutCommand(event);
    // A view this page doesn't register has no key here, as the shortcuts dialog shows.
    if (command === undefined) return;
    if (command.type === "view") {
      if (!hasView(command.view)) return;
      event.preventDefault();
      actions.setView(viewFor(command.view, props.scrolling, viewNames));
      return;
    }
    event.preventDefault();
    if (command.type === "create") props.onCreate();
    else if (command.type === "help") props.onHelp();
    else if (command.type === "next") actions.navigateNext();
    else if (command.type === "previous") actions.navigatePrevious();
    else actions.navigateToday();
  };
  window.addEventListener("keydown", listener);
  onCleanup(() => window.removeEventListener("keydown", listener));
  return null;
}
