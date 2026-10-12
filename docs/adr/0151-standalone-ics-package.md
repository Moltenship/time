# ADR 0151: A standalone, Temporal-native iCalendar package

- Status: Accepted
- Date: 2026-10-12
- Issue: [#151](https://github.com/Moltenship/time/issues/151)

## Context

Applications show calendars that arrive as iCalendar (RFC 5545): subscription feeds from Google,
Outlook and iCloud, invitations, exports. The recurrence package (#48) also needs RFC 5545's RRULE,
RDATE, EXDATE and RECURRENCE-ID semantics. The existing JavaScript parsers don't fit ADR 0004:
ts-ics and node-ical expose `Date` (node-ical also bundles a Temporal polyfill), ical.js has its own
time type and resolves only the time zones defined inside the file, and smaller parsers return raw
strings that leave unescaping and dates to the application.

## Decision

`@moltenship/ics` parses iCalendar text into typed Temporal values. It has no runtime dependencies
and imports no other workspace, so it is useful outside the calendar.

1. **Three layers.** A lossless syntax tree (`parseIcsComponents` / `stringifyIcsComponents`),
   typed values per RFC 5545 value type (`decodeIcsValue` / `encodeIcsValue`), and typed components
   (`parseIcs`). Each layer is public, so applications can drop down a layer when the typed model
   doesn't cover their data.
2. **Time follows the calendar's time model.** DATE is a `PlainDate`. DATE-TIME is a union: UTC
   (`Instant`), a TZID that resolved (`ZonedDateTime`, RFC 5545 §3.3.5 gap and fold rules, which
   are Temporal's `compatible`), a TZID that didn't (wall time plus TZID), and floating
   (`PlainDateTime`). Nothing falls back to the host time zone.
3. **TZIDs resolve to zones Temporal knows.** Temporal has no custom time zones, so TZIDs map to
   IANA ids or fixed offsets: IANA names, vendor path prefixes, Windows names (CLDR), `X-LIC-LOCATION`
   and fixed-offset VTIMEZONEs, with a custom resolver first. Anything else stays `unresolved` and is
   reported, never guessed.
4. **Lenient by default, honest about it.** Real feeds break the RFC. The parser keeps what it can,
   skips components it can't type (an event without UID or DTSTART), and reports every deviation as
   an issue with a line. `strict` turns errors into an exception.
5. **Standard Schema.** A parser implements `StandardSchemaV1<string, IcsParseResult>`, so it plugs
   into validators, routers and form libraries. Extension properties accept any Standard Schema and
   infer their output type. The spec's interfaces are copied, as the spec invites, so declarations
   stay dependency-free.
6. **Parsing only.** Recurrence expansion belongs to `calendar-recurrence`, which consumes the
   parsed rules. Generating ICS from typed objects comes later.

## Consequences

- One more published package, versioned in lockstep with the others.
- Windows time zone data from CLDR ships inside the package and needs refreshing from CLDR
  releases; a script regenerates it.
- Calendars whose VTIMEZONEs have no recognisable name and observe DST resolve as `unresolved`
  until offset matching against IANA zones exists.

## Reversal trigger

Revisit if a maintained, Temporal-native parser without a bundled polyfill appears that covers the
same ground, or if keeping time zone data current costs more than it saves.
