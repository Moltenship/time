import { instantKey, zonedWallTimeKeyForTimeZoneId } from "./machine-keys";

export type TemporalDisambiguation = NonNullable<Temporal.DisambiguationOptions["disambiguation"]>;

export interface ZonedTimeEnvironment {
  readonly disambiguation: TemporalDisambiguation;
  readonly timeZone: string;
}

export type ZonedWallTimeKind = "fold" | "gap" | "unique";
export type ZonedWallTimeSelection = "earlier" | "later" | "unique";

export interface ZonedWallTimeOccurrence {
  readonly instant: Temporal.Instant;
  readonly key: string;
  readonly offset: string;
  readonly offsetNanoseconds: number;
  readonly wallTime: Temporal.PlainDateTime;
  readonly zonedDateTime: Temporal.ZonedDateTime;
}

export interface ZonedWallTimeAdjustment {
  readonly direction: "earlier" | "later";
  readonly requestedWallTime: Temporal.PlainDateTime;
  readonly resolvedWallTime: Temporal.PlainDateTime;
  readonly wallTimeDelta: Temporal.Duration;
}

interface ZonedWallTimeProjectionBase {
  readonly disambiguation: TemporalDisambiguation;
  readonly key: string;
  readonly kind: ZonedWallTimeKind;
  readonly occurrences: readonly ZonedWallTimeOccurrence[];
  readonly requestedWallTime: Temporal.PlainDateTime;
  readonly timeZone: string;
}

export interface ResolvedZonedWallTimeProjection extends ZonedWallTimeProjectionBase {
  readonly adjustment: ZonedWallTimeAdjustment | null;
  readonly selected: ZonedWallTimeOccurrence;
  readonly selectedBy: ZonedWallTimeSelection;
  readonly status: "resolved";
}

export interface RejectedZonedWallTimeProjection extends ZonedWallTimeProjectionBase {
  readonly adjustment: null;
  readonly kind: "fold" | "gap";
  readonly selected: null;
  readonly selectedBy: null;
  readonly status: "rejected";
}

export type ZonedWallTimeProjection =
  | RejectedZonedWallTimeProjection
  | ResolvedZonedWallTimeProjection;

export interface ZonedInstantProjection {
  readonly instant: Temporal.Instant;
  readonly key: string;
  readonly offset: string;
  readonly offsetNanoseconds: number;
  readonly timeZone: string;
  readonly wallTime: Temporal.PlainDateTime;
  readonly wallTimeKey: string;
  readonly zonedDateTime: Temporal.ZonedDateTime;
}

function occurrence(zonedDateTime: Temporal.ZonedDateTime): ZonedWallTimeOccurrence {
  const instant = zonedDateTime.toInstant();

  return Object.freeze({
    instant,
    key: instantKey(instant),
    offset: zonedDateTime.offset,
    offsetNanoseconds: zonedDateTime.offsetNanoseconds,
    wallTime: zonedDateTime.toPlainDateTime(),
    zonedDateTime,
  });
}

function adjustment(
  requestedWallTime: Temporal.PlainDateTime,
  selected: ZonedWallTimeOccurrence,
  direction: "earlier" | "later",
): ZonedWallTimeAdjustment {
  return Object.freeze({
    direction,
    requestedWallTime,
    resolvedWallTime: selected.wallTime,
    wallTimeDelta: requestedWallTime.until(selected.wallTime, { largestUnit: "day" }),
  });
}

/**
 * Projects a nominal wall coordinate through an explicit timezone and policy.
 * Gaps retain the requested and shifted wall times; folds retain both instant identities.
 */
export function resolveZonedWallTime(
  requestedWallTime: Temporal.PlainDateTime,
  environment: ZonedTimeEnvironment,
): ZonedWallTimeProjection {
  const earlier = occurrence(
    requestedWallTime.toZonedDateTime(environment.timeZone, { disambiguation: "earlier" }),
  );
  const later = occurrence(
    requestedWallTime.toZonedDateTime(environment.timeZone, { disambiguation: "later" }),
  );
  const earlierRoundTrips = earlier.wallTime.equals(requestedWallTime);
  const laterRoundTrips = later.wallTime.equals(requestedWallTime);
  const timeZone = earlier.zonedDateTime.timeZoneId;
  const key = zonedWallTimeKeyForTimeZoneId(requestedWallTime, timeZone);

  if (!earlierRoundTrips && !laterRoundTrips) {
    const base = {
      disambiguation: environment.disambiguation,
      key,
      kind: "gap" as const,
      occurrences: Object.freeze([]) as readonly ZonedWallTimeOccurrence[],
      requestedWallTime,
      timeZone,
    };

    if (environment.disambiguation === "reject") {
      return Object.freeze({
        ...base,
        adjustment: null,
        selected: null,
        selectedBy: null,
        status: "rejected",
      });
    }

    const selectedBy = environment.disambiguation === "earlier" ? "earlier" : "later";
    const selected = selectedBy === "earlier" ? earlier : later;
    return Object.freeze({
      ...base,
      adjustment: adjustment(requestedWallTime, selected, selectedBy),
      selected,
      selectedBy,
      status: "resolved",
    });
  }

  if (earlier.instant.epochNanoseconds !== later.instant.epochNanoseconds) {
    const occurrences = Object.freeze([earlier, later]);
    const base = {
      disambiguation: environment.disambiguation,
      key,
      kind: "fold" as const,
      occurrences,
      requestedWallTime,
      timeZone,
    };

    if (environment.disambiguation === "reject") {
      return Object.freeze({
        ...base,
        adjustment: null,
        selected: null,
        selectedBy: null,
        status: "rejected",
      });
    }

    const selectedBy = environment.disambiguation === "later" ? "later" : "earlier";
    return Object.freeze({
      ...base,
      adjustment: null,
      selected: selectedBy === "earlier" ? earlier : later,
      selectedBy,
      status: "resolved",
    });
  }

  return Object.freeze({
    adjustment: null,
    disambiguation: environment.disambiguation,
    key,
    kind: "unique",
    occurrences: Object.freeze([earlier]),
    requestedWallTime,
    selected: earlier,
    selectedBy: "unique",
    status: "resolved",
    timeZone,
  });
}

/** Projects an absolute instant while retaining the fields needed for stable rendering and editing. */
export function projectInstantToZonedTime(
  instant: Temporal.Instant,
  timeZone: string,
): ZonedInstantProjection {
  const zonedDateTime = instant.toZonedDateTimeISO(timeZone);
  const wallTime = zonedDateTime.toPlainDateTime();

  return Object.freeze({
    instant,
    key: instantKey(instant),
    offset: zonedDateTime.offset,
    offsetNanoseconds: zonedDateTime.offsetNanoseconds,
    timeZone: zonedDateTime.timeZoneId,
    wallTime,
    wallTimeKey: zonedWallTimeKeyForTimeZoneId(wallTime, zonedDateTime.timeZoneId),
    zonedDateTime,
  });
}
