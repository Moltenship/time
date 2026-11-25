/**
 * Stops the page's clock at the instant its `?now=` names, so the pages the demo's parity test
 * compares share one: the seed, the now line and the annotations all read `Temporal.Now`. Runs
 * before the app's modules: the React pages import it first (prepare.ts), and the test server puts
 * it ahead of the Solid demo's script (solid-demo.ts). Without `?now=` it does nothing.
 */
const fixed = new URLSearchParams(location.search).get("now");

if (fixed !== null) {
  // The parity test runs in Chromium alone, which ships Temporal; a polyfill loaded later would
  // bring a clock of its own.
  if (!("Temporal" in globalThis)) throw new Error("demo-parity-now-needs-temporal");
  const instant = Temporal.Instant.from(fixed);
  const now = Temporal.Now;
  const zone = now.timeZoneId.bind(now);
  const zoned = (timeZone: Temporal.TimeZoneLike = zone()) => instant.toZonedDateTimeISO(timeZone);
  Object.assign(now, {
    instant: () => instant,
    plainDateISO: (timeZone?: Temporal.TimeZoneLike) => zoned(timeZone).toPlainDate(),
    plainDateTimeISO: (timeZone?: Temporal.TimeZoneLike) => zoned(timeZone).toPlainDateTime(),
    plainTimeISO: (timeZone?: Temporal.TimeZoneLike) => zoned(timeZone).toPlainTime(),
    zonedDateTimeISO: zoned,
  });
}

export {};
