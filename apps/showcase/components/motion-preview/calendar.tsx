import { MotionCalendar } from "@/content/examples/motion-calendar";

import { TooltipProvider } from "@registry/ui/tooltip";

/** The Motion guide's week, as its example builds it. */
export default function MotionPreviewCalendar() {
  return (
    <TooltipProvider delay={400}>
      <MotionCalendar />
    </TooltipProvider>
  );
}
