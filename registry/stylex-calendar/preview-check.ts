import { useCalendarInteraction, type CalendarInteractionCheck } from "@moltenship/calendar";

/** How a preview shows the policies' answer: `invalid` when they reject it, `warning` when flagged. */
export type PreviewCheck = "invalid" | "warning" | undefined;

export function previewCheck(check: CalendarInteractionCheck): PreviewCheck {
  if (check === null) return undefined;
  if (check.status === "rejected") return "invalid";
  return check.change.warnings !== undefined && check.change.warnings.length > 0
    ? "warning"
    : undefined;
}

/** `data-invalid` or `data-warning` on a preview, for `data-invalid:` and `data-warning:` styles. */
export function previewCheckAttributes(check: PreviewCheck) {
  return {
    "data-invalid": check === "invalid" ? "" : undefined,
    "data-warning": check === "warning" ? "" : undefined,
  };
}

/** What the policies say about the keyboard's create, for the draft that previews it. */
export function useDraftCheck(): PreviewCheck {
  return useCalendarInteraction((session, check) =>
    session?.eventId === null ? previewCheck(check) : undefined,
  );
}
