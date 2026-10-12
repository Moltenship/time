// TZID → time zone resolution. Temporal has no custom time zones, so a TZID lands on a zone
// Temporal knows (an IANA id or a fixed offset) or stays unresolved, and the caller keeps the wall
// time. Prose stays in line comments: the bundle keeps doc comments, and the size budget is tight.

import type { IcsComponent, IcsTimeZoneResolver } from "../types";
import { canonicalTimeZoneId, offsetTimeZoneId } from "./canonical";
import { definitionOffsets, definitionTimeZone } from "./definition";
import { fitsDefinitionOffsets } from "./history";
import { displayNameTimeZone, windowsTimeZone } from "./windows";

export { canonicalTimeZoneId } from "./canonical";

export interface TimeZoneResolverOptions {
  /** Consulted first; `undefined` falls through to the built-in rules. */
  readonly custom?: IcsTimeZoneResolver;
  /** The calendar's VTIMEZONE components, keyed by their TZID as written. */
  readonly definitions?: ReadonlyMap<string, IcsComponent>;
}

const MAX_NAME_LENGTH = 256;

// `UTC`, `GMT`, `Z`, `GMT+0100`, `UTC+01:00`, `GMT-5`, `UTC+5:30`. The sign keeps the two runs of
// whitespace apart, so a long one can't make the pattern backtrack quadratically.
const OFFSET_NAME = /^(?:UTC|GMT|Z)$|^(?:UTC|GMT)?\s*([+\-−])\s*(\d{1,2})(?:[:.]?(\d{2}))?$/i;

function unquote(tzid: string): string {
  const trimmed = tzid.trim();
  return trimmed.length > 1 && trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1).trim()
    : trimmed;
}

// A VTIMEZONE's TZID is a TEXT value, so it may escape the commas that a TZID parameter holds as
// is. Keys as given win over unescaped ones.
function definitionsByTzid(
  definitions: ReadonlyMap<string, IcsComponent> = new Map(),
): ReadonlyMap<string, IcsComponent> {
  const byTzid = new Map(definitions);
  for (const [tzid, definition] of definitions) {
    const name = unquote(tzid.replace(/\\([\\,;])/g, "$1"));
    if (!byTzid.has(name)) byTzid.set(name, definition);
  }
  return byTzid;
}

// Vendor paths such as `/mozilla.org/20050126_1/Europe/Berlin` or `tzone://Microsoft/Utc` end in
// an IANA id of up to three segments. IANA ids have no spaces, which keeps display names out.
function pathTimeZone(tzid: string): string | undefined {
  if (!tzid.includes("/") || /\s/.test(tzid)) return undefined;
  const segments = tzid.split("/").filter(Boolean);
  for (let count = Math.min(3, segments.length); count > 0; count--) {
    const timeZone = canonicalTimeZoneId(segments.slice(-count).join("/"));
    if (timeZone !== undefined) return timeZone;
  }
  return undefined;
}

function offsetNameTimeZone(tzid: string): string | undefined {
  const match = OFFSET_NAME.exec(tzid);
  if (!match) return undefined;
  const [, sign, hours, minutes = "0"] = match;
  return sign === undefined || hours === undefined
    ? "UTC"
    : offsetTimeZoneId(sign === "+" ? "+" : "-", Number(hours), Number(minutes));
}

/** Builds a TZID resolver for one calendar. Results are cached per resolver. */
export function createTimeZoneResolver(
  options: TimeZoneResolverOptions = {},
): (tzid: string) => string | undefined {
  const { custom } = options;
  const definitions = definitionsByTzid(options.definitions);
  const cache = new Map<string, string | undefined>();

  // The first rule that yields a time zone Temporal knows wins.
  function resolve(tzid: string): string | undefined {
    const name = unquote(tzid);
    const definition = definitions.get(tzid) ?? definitions.get(name);
    const fromCustom = custom?.(tzid, definition);
    const chosen = fromCustom === undefined ? undefined : canonicalTimeZoneId(fromCustom);
    if (chosen !== undefined) return chosen;
    // No real TZID is this long, and the name rules needn't scale to one that is.
    if (name.length > MAX_NAME_LENGTH) {
      return definition === undefined ? undefined : definitionTimeZone(definition);
    }

    // A name rule's zone must change offset when the calendar says it does: Temporal knows `EST`
    // as fixed at −05:00, and a VTIMEZONE with that TZID may well observe DST.
    const offsets = definition === undefined ? undefined : definitionOffsets(definition);
    const fits = (timeZone: string | undefined) =>
      timeZone === undefined ||
      offsets === undefined ||
      offsets.size < 2 ||
      fitsDefinitionOffsets(timeZone, offsets)
        ? timeZone
        : undefined;

    return (
      // `Europe/Berlin`, `"Europe/Berlin"`, `+05:30`.
      fits(canonicalTimeZoneId(name)) ??
      fits(pathTimeZone(name)) ??
      // `W. Europe Standard Time`, from CLDR.
      fits(windowsTimeZone(name)) ??
      // `(UTC+01:00) Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna`.
      fits(displayNameTimeZone(name)) ??
      // X-LIC-LOCATION, or the offset of a VTIMEZONE that never changes it.
      (definition === undefined ? undefined : definitionTimeZone(definition)) ??
      fits(offsetNameTimeZone(name))
    );
  }

  return (tzid) => {
    if (cache.has(tzid)) return cache.get(tzid);
    const timeZone = resolve(tzid);
    cache.set(tzid, timeZone);
    return timeZone;
  };
}
