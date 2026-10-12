# @moltenship/ics

Typed iCalendar (RFC 5545) parsing with native Temporal values. ICS text goes in; calendars,
events, to-dos, journals, free/busy and time zones come out, with dates as `Temporal` objects and
every deviation from the RFC reported as an issue with its line.

- **No dependencies.** It needs a runtime with native `Temporal` (Node.js 26+, or a global polyfill
  you install yourself) and TypeScript's `ESNext` library.
- **Not tied to a calendar UI.** It doesn't import any other Moltenship package.
- **Standard Schema.** A parser is a [Standard Schema](https://standardschema.dev), and extension
  properties take any Standard Schema validator (Zod, Valibot, ArkType…).

> **Status:** pre-1.0, not yet published to npm. The API will change before 1.0.

## Parse a feed

```ts
import { getEventEnd, parseIcs } from "@moltenship/ics";

const text = await (await fetch("https://example.com/team.ics")).text();
const { calendars, issues } = parseIcs(text);

for (const event of calendars[0]?.events ?? []) {
  const end = getEventEnd(event);
  console.log(event.summary, event.start, end);
}
```

`parseIcs` is lenient: it keeps what it can, skips components it can't type (an event without UID
or DTSTART), and lists every problem in `issues`. Text without a VCALENDAR, empty text included,
is an error. Pass `{ strict: true }` to throw an `IcsParseError` on error-severity issues instead.

Bad data never throws on its own. An exception thrown by a callback you pass, `resolveTimeZone` or
an extension schema's `validate`, propagates out of `parse` unchanged: it's a bug in your code, not
a problem with the text.

## Dates and times

DATE values are `Temporal.PlainDate`. DATE-TIME values are a union, so the type says what the file
said:

| `kind`       | Written as                          | Value                                     |
| ------------ | ----------------------------------- | ----------------------------------------- |
| `date`       | `DTSTART;VALUE=DATE:20261012`       | `date: Temporal.PlainDate`                |
| `utc`        | `DTSTART:20261012T090000Z`          | `instant: Temporal.Instant`               |
| `zoned`      | `DTSTART;TZID=Europe/Berlin:…`      | `zoned: Temporal.ZonedDateTime`, `wallTime`, `tzid` |
| `unresolved` | `DTSTART;TZID=Some Custom Zone:…`   | `wallTime: Temporal.PlainDateTime`, `tzid` |
| `floating`   | `DTSTART:20261012T090000`           | `wallTime: Temporal.PlainDateTime`        |

```ts
import type { IcsDateValue } from "@moltenship/ics";

function startInstant(start: IcsDateValue, timeZone: string): Temporal.Instant {
  switch (start.kind) {
    case "utc":
      return start.instant;
    case "zoned":
      return start.zoned.toInstant();
    case "date":
      return start.date.toZonedDateTime(timeZone).toInstant();
    case "floating":
    case "unresolved":
      return start.wallTime.toZonedDateTime(timeZone).toInstant();
  }
}
```

A wall time inside a DST gap or fold resolves the way RFC 5545 §3.3.5 says, which is Temporal's
`compatible` disambiguation; `wallTime` keeps what the file wrote. Nothing falls back to the host's
time zone. A calendar's `X-WR-TIMEZONE` is available as `calendar.timeZone` if you want to apply it
to floating times.

## Time zones

Temporal has no custom time zones, so each TZID is mapped to a time zone Temporal knows:

1. your `resolveTimeZone(tzid, vtimezone)` option, if it returns an id Temporal knows (any other
   answer falls through, like `undefined`);
2. IANA ids, such as `Europe/Berlin`;
3. vendor paths, such as `/mozilla.org/20050126_1/Europe/Berlin`;
4. Windows ids and Outlook display names, such as `W. Europe Standard Time` or
   `(UTC+01:00) Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna`, through CLDR's mapping;
5. the file's VTIMEZONE: its `X-LIC-LOCATION`, or a fixed offset when it observes no DST;
6. offset names, such as `GMT+0100` or `UTC`.

When the file's VTIMEZONE observes DST, rules 2–4 and 6 skip zones that never change offset:
`TZID=EST` is Temporal's fixed −05:00 zone, but a VTIMEZONE named `EST` usually means New York. A
TZID that matches none of these stays `unresolved`, with an `unknown-time-zone` warning. It isn't
guessed.

## Extension properties

Declare the `X-` properties you rely on, and they're decoded, validated and typed in `extensions`:

```ts
import { createIcsParser, icsExtension } from "@moltenship/ics";
import { z } from "zod";

const parser = createIcsParser({
  extensions: {
    event: {
      busyStatus: icsExtension("X-MICROSOFT-CDO-BUSYSTATUS", {
        schema: z.enum(["FREE", "TENTATIVE", "BUSY", "OOF", "WORKINGELSEWHERE"]),
      }),
      resourceIds: icsExtension("X-RESOURCE-ID", { multiple: true }),
      guests: icsExtension("X-EXAMPLE-GUESTS", { type: "INTEGER" }),
    },
  },
});

const { calendars } = parser.parse(text);
const event = calendars[0]!.events[0]!;
event.extensions.busyStatus; // "FREE" | "TENTATIVE" | … | undefined
event.extensions.resourceIds; // readonly string[]
event.extensions.guests; // number | undefined
```

`type` picks the RFC 5545 value type used to decode the raw value (TEXT by default). `multiple`
collects every occurrence and every comma-separated value. A value the schema rejects is dropped
with a `schema` issue. Schemas must validate synchronously.

To name the result's types in your own code, keep the `extensions` object in a constant: every
type takes it the same way, as in `IcsCalendar<typeof extensions>` or `IcsEvent<typeof extensions>`.

## As a Standard Schema

A parser validates ICS text: it fails with the error-severity issues, or succeeds with the parse
result.

```ts
const result = await parser["~standard"].validate(body);
if (result.issues) {
  return { status: 400, errors: result.issues.map((issue) => issue.message) };
}
const { calendars } = result.value;
```

## Lower layers

When the typed model doesn't cover your data, drop down a layer:

- `parseIcsComponents(text)` returns a lossless tree of components and properties with raw
  values, and `stringifyIcsComponents(tree)` writes it back (CRLF, folded at 75 octets).
- `decodeIcsValue(type, raw, context)` and `encodeIcsValue(type, value)` convert single values of
  any RFC 5545 value type, and `icsValueTypeOf(property)` says which type a property has.
- `splitIcsValues(type, raw)` splits a list value, such as CATEGORIES or EXDATE, on its separating
  commas; `decodeIcsValues(type, raw, context)` splits and decodes each item.
- `decodeIcsDateValue(raw, declared, context)` reads a DATE or DATE-TIME by its shape, as the
  typed model does for DTSTART, DTEND and EXDATE.

Decoders never throw. They return `{ ok: false, message }`, or `{ ok: true, value }` with
`warnings` when they read a value leniently; each warning has the `code` the typed model would
report it under.

Typed components also keep every property and subcomponent they don't map in `otherProperties`
and `otherComponents`.

## Not included yet

- Expanding recurrence rules into occurrences: rules are parsed into `IcsRecurrenceRule`, not
  expanded.
- Writing ICS from typed objects.
- Byte input. Decode the text as UTF-8 first; a fold that splits a multi-byte character can't be
  repaired after decoding.

## License

MIT. The Windows time zone data comes from Unicode CLDR under the Unicode License v3; see
[THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).
