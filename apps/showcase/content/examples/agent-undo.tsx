"use client";

import { useCalendarHistory, type EventHistory } from "@moltenship/calendar";

import { Button } from "@/components/ui/button";

import type { Meeting } from "./calendar";

// Anywhere inside Root. The history it's given holds an agent's changes only, so this never
// undoes a drag.
export function UndoAgentChange({
  history,
  onRestore,
}: {
  readonly history: EventHistory<Meeting, string, never>;
  /** Hears the meeting as it was before the step that was undone. */
  readonly onRestore: (before: Meeting) => void;
}) {
  const { canUndo, past, undo } = useCalendarHistory(history);

  return (
    <Button
      disabled={!canUndo}
      onClick={async () => {
        // The step `undo` takes is the last. Its first change has your record as it was before.
        const before = past.at(-1)?.changes[0]?.event;
        const outcome = await undo();
        // The history puts times and resources back. It doesn't know your fields, so a title
        // the agent changed is yours to restore.
        if (outcome.status === "committed" && before !== undefined && before !== null) {
          onRestore(before);
        }
      }}
      variant="ghost"
    >
      Undo the agent
    </Button>
  );
}
