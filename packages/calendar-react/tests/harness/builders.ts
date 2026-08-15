import type { CalendarWeekRules } from "@moltenship/calendar-core";
import type { CalendarStoreOptions } from "@moltenship/calendar-react";
import type { CalendarClock } from "@moltenship/calendar-temporal";

export type GateView = "agenda" | "month";

export interface GateSelection {
  readonly eventId: `event-${number}`;
}

export interface GateFocus {
  readonly cell: string;
}

export interface GateEvent {
  readonly end: Temporal.Instant;
  readonly id: `event-${number}`;
  readonly resourceIds: readonly `resource-${number}`[];
  readonly start: Temporal.Instant;
  readonly title: string;
}

export interface GateResource {
  readonly id: `resource-${number}`;
  readonly title: string;
}

export interface TestCalendarClock extends CalendarClock {
  set(instant: Temporal.Instant): void;
}

export function createTestCalendarClock(
  initialInstant = Temporal.Instant.from("2026-08-20T08:30:00Z"),
): TestCalendarClock {
  let currentInstant = initialInstant;

  return Object.freeze({
    instant: () => currentInstant,
    set(instant: Temporal.Instant) {
      currentInstant = instant;
    },
  });
}

export function buildGateEvent(overrides: Partial<GateEvent> = {}): GateEvent {
  return Object.freeze({
    end: overrides.end ?? Temporal.Instant.from("2026-08-15T10:00:00Z"),
    id: overrides.id ?? "event-1",
    resourceIds: Object.freeze([...(overrides.resourceIds ?? ["resource-1"])]),
    start: overrides.start ?? Temporal.Instant.from("2026-08-15T09:00:00Z"),
    title: overrides.title ?? "Architecture review",
  });
}

export function buildGateResource(overrides: Partial<GateResource> = {}): GateResource {
  return Object.freeze({
    id: overrides.id ?? "resource-1",
    title: overrides.title ?? "Orchid",
  });
}

export const gateEvents = Object.freeze([buildGateEvent()]);
export const gateResources = Object.freeze([buildGateResource()]);
export const gateStoreDefaults: CalendarStoreOptions<GateView, GateSelection, GateFocus, string> =
  Object.freeze({
    defaultAnchorDate: Temporal.PlainDate.from("2026-08-15"),
    defaultExpandedResourceIds: Object.freeze([]),
    defaultFocus: null,
    defaultSelection: null,
    defaultTimeZone: "Asia/Tbilisi",
    defaultView: "month",
  });
export const gateWeekRules: CalendarWeekRules = Object.freeze({
  firstDay: 1,
  minimalDays: 4,
  weekend: Object.freeze<CalendarWeekRules["weekend"]>([6, 7]),
});
