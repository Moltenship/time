import type { IsoDayOfWeek } from "../environment";
import type { ResourceId } from "../ids";
import { timeZoneIdOf } from "../internal/time-zone-id";
import type { CalendarResource } from "../resources";
import { createAvailabilitySchedule, isoDateKey, type ScheduleHours } from "./schedule";
import type {
  AvailabilityException,
  AvailabilityHours,
  AvailabilityIssue,
  AvailabilityRule,
  AvailabilitySchedule,
  AvailabilitySnapshot,
  CalendarAvailability,
  ResourceAvailability,
} from "./types";

export interface AvailabilitySnapshotInput {
  /** The calendar's hours; without them the calendar is always open. */
  readonly availability?: CalendarAvailability;
  /** Resources with their own `availability` or `timeZone`; others follow the calendar's hours. */
  readonly resources?: readonly Pick<
    CalendarResource<unknown, ResourceId>,
    "availability" | "id" | "timeZone"
  >[];
  /** The display time zone, where the calendar's hours are without one of their own. */
  readonly timeZone: string;
}

type Report = (code: AvailabilityIssue["code"], value: unknown) => void;

function isHours(value: unknown): value is AvailabilityHours {
  if (typeof value !== "object" || value === null) return false;
  const { end, start } = value as Partial<AvailabilityHours>;
  return start instanceof Temporal.PlainTime && end instanceof Temporal.PlainTime;
}

function isDay(value: unknown): value is IsoDayOfWeek {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 7;
}

function isRule(value: unknown): value is AvailabilityRule {
  if (!isHours(value)) return false;
  const { days } = value as Partial<AvailabilityRule>;
  // `Array.from` turns holes into `undefined`, which `every` would skip.
  return Array.isArray(days) && Array.from(days).every(isDay);
}

function isTimeZone(value: unknown): value is string {
  return timeZoneIdOf(value) !== null;
}

/** Hours by ISO day of the week, leaving out invalid rules; `fallback` without a list of rules. */
function weeklyHours(
  weekly: ResourceAvailability["weekly"],
  report: Report,
  fallback: ScheduleHours["weekly"],
): ScheduleHours["weekly"] {
  if (weekly === undefined) return fallback;
  if (!Array.isArray(weekly)) {
    report("invalid-availability-rule", weekly);
    return fallback;
  }
  const days = Array.from({ length: 8 }, (): AvailabilityHours[] => []);
  for (const rule of weekly) {
    if (!isRule(rule)) {
      report("invalid-availability-rule", rule);
      continue;
    }
    for (const day of new Set(rule.days)) days[day]!.push(rule);
  }
  return Object.freeze(days.map((hours) => Object.freeze(hours)));
}

/** Adds valid exceptions by date, over `into`'s; a date repeated in `exceptions` keeps its first. */
function exceptionsByDate(
  exceptions: ResourceAvailability["exceptions"],
  report: Report,
  into: ReadonlyMap<string, AvailabilityException> = new Map(),
): ReadonlyMap<string, AvailabilityException> {
  if (exceptions === undefined) return into;
  if (!Array.isArray(exceptions)) {
    report("invalid-availability-exception", exceptions);
    return into;
  }
  const byDate = new Map(into);
  const own = new Set<string>();
  for (const exception of exceptions) {
    const { date, hours, label } = (exception ?? {}) as Partial<AvailabilityException>;
    if (
      !(date instanceof Temporal.PlainDate) ||
      // `Array.from` turns holes into `undefined`, which `every` would skip.
      (hours !== undefined && (!Array.isArray(hours) || !Array.from(hours).every(isHours))) ||
      (label !== undefined && typeof label !== "string")
    ) {
      report("invalid-availability-exception", exception);
      continue;
    }
    const key = isoDateKey(date);
    if (own.has(key)) {
      report("duplicate-exception-date", exception);
      continue;
    }
    own.add(key);
    byDate.set(key, exception);
  }
  return byDate;
}

/**
 * Resolves the calendar's hours and each resource's on their time zones. A resource's own weekly
 * hours replace the calendar's, its exceptions add to them, and it keeps its own time zone;
 * resources without any share the calendar's hours, resolved once per time zone.
 */
export function createAvailabilitySnapshot({
  availability,
  resources = [],
  timeZone,
}: AvailabilitySnapshotInput): AvailabilitySnapshot {
  const issues: AvailabilityIssue[] = [];
  const reporter =
    (resourceId?: ResourceId): Report =>
    (code, value) =>
      issues.push(
        Object.freeze(resourceId === undefined ? { code, value } : { code, resourceId, value }),
      );
  const zoneOf = (zone: string | undefined, fallback: string, report: Report) => {
    if (zone === undefined) return fallback;
    if (isTimeZone(zone)) return zone;
    report("invalid-time-zone", zone);
    return fallback;
  };

  const report = reporter();
  const calendarZone = zoneOf(availability?.timeZone, timeZone, report);
  const calendarHours: ScheduleHours | null =
    availability == null
      ? null
      : {
          exceptions: exceptionsByDate(availability.exceptions, report),
          weekly: weeklyHours(availability.weekly, report, null),
        };
  const shared = new Map<string, AvailabilitySchedule>();
  /** The calendar's hours on a time zone, resolved once per zone. */
  const calendarOn = (zone: string) => {
    if (calendarHours === null) return null;
    let schedule = shared.get(zone);
    if (schedule === undefined) {
      schedule = createAvailabilitySchedule(calendarHours, zone);
      shared.set(zone, schedule);
    }
    return schedule;
  };

  const calendar = calendarOn(calendarZone);
  const byResource = new Map<ResourceId, AvailabilitySchedule | null>();
  // A repeated ID keeps its first resource, as the resource tree does.
  const seen = new Set<ResourceId>();
  for (const resource of resources) {
    const { availability: own, id } = resource;
    if (seen.has(id)) continue;
    seen.add(id);
    if (own == null && resource.timeZone === undefined) continue;
    const reportOwn = reporter(id);
    const zone = zoneOf(resource.timeZone, calendarZone, reportOwn);
    if (own == null) {
      byResource.set(id, calendarOn(zone));
      continue;
    }
    const hours: ScheduleHours = {
      exceptions: exceptionsByDate(own.exceptions, reportOwn, calendarHours?.exceptions),
      weekly: weeklyHours(own.weekly, reportOwn, calendarHours?.weekly ?? null),
    };
    byResource.set(id, createAvailabilitySchedule(hours, zone));
  }

  return Object.freeze({
    calendar,
    forResource: (resourceId: ResourceId | null) =>
      resourceId === null ? calendar : (byResource.get(resourceId) ?? calendar),
    issues: Object.freeze(issues),
    timeZone,
  });
}
