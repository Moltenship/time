import type { CalendarInputMethod } from "@moltenship/calendar";

export function inputLabel(input: CalendarInputMethod): string {
  switch (input) {
    case "pointer":
      return "Dragged";
    case "keyboard":
      return "Moved with the keyboard";
    case "api":
      return "Changed from a form";
    // New in 2.0: an AI agent proposed the change.
    case "agent":
      return "Changed by the assistant";
  }
}
