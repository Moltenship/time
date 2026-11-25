import { useCalendarInteraction } from "@moltenship/calendar";

import { previewCheck, type PreviewCheck } from "@registry/shared/calendar/preview-state";

export { previewCheck, previewCheckAttributes } from "@registry/shared/calendar/preview-state";
export type { PreviewCheck } from "@registry/shared/calendar/preview-state";

/**
 * Styles for a draft that previews a keyboard create: a dashed outline when the policies would
 * reject or flag it, and a red tint when they would reject it.
 */
export const draftCheckClassName =
  "data-invalid:bg-calendar-invalid/15 data-invalid:outline-2 data-invalid:-outline-offset-2 data-invalid:outline-calendar-invalid data-invalid:outline-dashed data-warning:outline-2 data-warning:-outline-offset-2 data-warning:outline-calendar-warning data-warning:outline-dashed";

/** What the policies say about the keyboard's create, for the draft that previews it. */
export function useDraftCheck(): PreviewCheck {
  return useCalendarInteraction((session, check) =>
    session?.eventId === null ? previewCheck(check) : undefined,
  );
}
