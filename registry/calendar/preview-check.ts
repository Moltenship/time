import { useCalendarInteraction } from "@moltenship/calendar";

import { previewCheck, type PreviewCheck } from "@registry/shared/calendar/preview-state";

export { previewCheck, previewCheckAttributes } from "@registry/shared/calendar/preview-state";
export type { PreviewCheck } from "@registry/shared/calendar/preview-state";
export { draftCheckClassName } from "@registry/shared/calendar/preview-state.styles";

/** What the policies say about the keyboard's create, for the draft that previews it. */
export function useDraftCheck(): PreviewCheck {
  return useCalendarInteraction((session, check) =>
    session?.eventId === null ? previewCheck(check) : undefined,
  );
}
