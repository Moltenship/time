import { canonicalTimeZoneId } from "./canonical";
import { WINDOWS_ZONES } from "./windows-zones";

interface DisplayNameZone {
  readonly offset: string;
  readonly timeZone: string;
}

interface WindowsIndex {
  /** First place of a display name, lower-cased, such as `amsterdam`. */
  readonly places: ReadonlyMap<string, DisplayNameZone>;
  /** Windows id without " Standard Time", lower-cased, such as `w. europe`. */
  readonly windowsIds: ReadonlyMap<string, string>;
}

// `(UTC+01:00) Amsterdam, Berlin, …`, `(GMT+01.00) Amsterdam / Berlin / …`, `(GMT) …`.
const DISPLAY_NAME = /^\(\s*(?:UTC|GMT)\s*(?:([+\-−])\s*(\d{1,2})(?:[:.]?(\d{2}))?)?\s*\)\s*(.+)$/i;
// Outlook 2003 wrote `/` and `.` where newer names have `,` and `:`, which a parameter value can
// only hold quoted.
const DISPLAY_NAME_SEPARATOR = /\s*[,;/:]\s*|\s+\.\s+/;

let index: WindowsIndex | undefined;

function windowsIndex(): WindowsIndex {
  if (index) return index;

  const places = new Map<string, DisplayNameZone>();
  const windowsIds = new Map<string, string>();
  for (const line of WINDOWS_ZONES.split("\n")) {
    const [windowsId = "", timeZone = "", offset = "", place = ""] = line.split("|");
    windowsIds.set(normalize(windowsId), timeZone);
    places.set(normalize(place), { offset, timeZone });
  }
  index = { places, windowsIds };
  return index;
}

function normalize(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

// A Windows time zone id (`W. Europe Standard Time`), also without its " Standard Time" suffix as
// Lotus Notes writes it (`W. Europe`), or with " Daylight Time" instead.
export function windowsTimeZone(tzid: string): string | undefined {
  const key = normalize(tzid).replace(/ (?:daylight|standard) time$/, "");
  const timeZone = windowsIndex().windowsIds.get(key);
  return timeZone === undefined ? undefined : canonicalTimeZoneId(timeZone);
}

// An Outlook display name. Its first place picks the zone, so a name whose later places changed
// still matches. When the first place is unknown, a later place matches only if its zone has the
// same offset: `(GMT-11:00) Midway Island, Samoa` must not land on today's Samoa, at UTC+13.
export function displayNameTimeZone(tzid: string): string | undefined {
  const match = DISPLAY_NAME.exec(tzid.trim());
  if (!match) return undefined;

  const [, sign = "+", hours = "0", minutes = "00", rest = ""] = match;
  const offset = `${sign === "+" ? "+" : "-"}${hours.padStart(2, "0")}${minutes}`;
  const { places } = windowsIndex();
  const [first = "", ...others] = rest.split(DISPLAY_NAME_SEPARATOR).map(normalize);

  const zone =
    places.get(first) ??
    others.map((place) => places.get(place)).find((candidate) => candidate?.offset === offset);
  return zone === undefined ? undefined : canonicalTimeZoneId(zone.timeZone);
}
