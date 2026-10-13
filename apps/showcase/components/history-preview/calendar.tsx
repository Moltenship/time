import { UndoableCalendar } from "@/content/examples/undo-redo";

import { TooltipProvider } from "@registry/ui/tooltip";

/** The undo and redo page's calendar, as its example builds it. */
export default function HistoryPreviewCalendar() {
  return (
    <TooltipProvider delay={400}>
      <UndoableCalendar />
    </TooltipProvider>
  );
}
