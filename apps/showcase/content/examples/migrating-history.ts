import { createEventHistory } from "@moltenship/calendar";

import type { Meeting } from "./calendar";

// Undo and redo take back what people did, and leave an agent's changes alone.
export const history = createEventHistory<Meeting, string, never>({
  inputs: ["pointer", "keyboard", "api"],
});
