# Changelog

All published `@moltenship/*` packages share one version until after 1.0. A PR that changes a
published package adds a line under "Unreleased". `vp run release:version <version>` turns that
section into the release's. See [docs/internal/releasing.md](./docs/internal/releasing.md).

## Unreleased

- First public release of `@moltenship/calendar`, `calendar-core`, `calendar-dnd`,
  `calendar-react`, `calendar-recurrence`, `calendar-temporal` and `ics`.
- `@moltenship/ics` is licensed `MIT AND Unicode-3.0`: its Windows time zone mapping comes from
  Unicode CLDR. The license text ships in the package's `THIRD-PARTY-NOTICES.md` and, as a legal
  comment that bundlers keep, in its built code.
- A `Root` without `onEventChange` is read-only in its views too: they start no drags or keyboard
  grabs and draw no resize handles. Renderers get `isReadOnly` to tell (#201).
- Touch drags start after a 450 ms press instead of 250 ms, so a finger that rests before it
  scrolls still scrolls. The pointer layer listens for `touchmove` from the touch's start, so iOS
  Safari lets a drag hold the page still. On touch screens, editable built-in views select no text
  and show no callout (#217).
- `Root`'s `events` takes a `CalendarEventSource<TEvent>` as well as an array: events in an
  external store, read through `useSyncExternalStore`, with `getServerSnapshot` for server rendering
  and hydration. Its getters return event arrays (#200).
