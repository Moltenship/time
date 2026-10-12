import type { IcsComponent } from "../types";
import { canonicalTimeZoneId, offsetTimeZoneId } from "./canonical";

// TZOFFSETTO is `±HHMM[SS]`; the colons are tolerated because some producers write them.
const UTC_OFFSET = /^([+-])(\d{2}):?(\d{2})(?::?(\d{2}))?$/;

function propertyValue(component: IcsComponent, name: string): string | undefined {
  return component.properties.find((property) => property.name === name)?.value.trim();
}

function offsetTo(observance: IcsComponent): string | undefined {
  const match = UTC_OFFSET.exec(propertyValue(observance, "TZOFFSETTO") ?? "");
  if (!match) return undefined;
  const [, sign = "+", hours = "", minutes = "", seconds = "0"] = match;
  return offsetTimeZoneId(sign, Number(hours), Number(minutes), Number(seconds));
}

function observances(definition: IcsComponent): IcsComponent[] {
  return definition.components.filter(
    (component) => component.name === "STANDARD" || component.name === "DAYLIGHT",
  );
}

// The distinct offsets, in seconds, that a VTIMEZONE's observances move to.
export function definitionOffsets(definition: IcsComponent): ReadonlySet<number> {
  const offsets = new Set<number>();
  for (const observance of observances(definition)) {
    const match = UTC_OFFSET.exec(propertyValue(observance, "TZOFFSETTO") ?? "");
    if (!match) continue;
    const [, sign, hours = "", minutes = "", seconds = "0"] = match;
    offsets.add(
      (sign === "-" ? -1 : 1) * (Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)),
    );
  }
  return offsets;
}

// The time zone a VTIMEZONE names in X-LIC-LOCATION, else its fixed offset when every observance
// moves to the same offset. Matching DST rules against IANA zones isn't done (yet).
export function definitionTimeZone(definition: IcsComponent): string | undefined {
  const location = propertyValue(definition, "X-LIC-LOCATION");
  const named = location === undefined ? undefined : canonicalTimeZoneId(location);
  if (named !== undefined) return named;

  const [first, ...rest] = observances(definition).map(offsetTo);
  // Some producers write a DAYLIGHT with the standard offset for zones without DST; it changes
  // nothing, so it doesn't stop the definition from being a fixed offset.
  return first !== undefined && rest.every((offset) => offset === first) ? first : undefined;
}
