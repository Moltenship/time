# Contracts

The hand-maintained [canonical contract surface](./canonical-contracts.md) explains the supported
foundation imports and validation boundary. The
[`@moltenship/calendar-temporal` API guide](../api/calendar-temporal.md) specifies the implemented
interval, iteration, grid, rounding, zoned-day, DST projection, slot, machine-key, runtime, and
package-size contracts. The [`@moltenship/calendar-core` API guide](../api/calendar-core.md)
specifies immutable normalized snapshots, invalid-record handling, interval/resource queries,
revision reuse, bounded caches, and advanced event sources. The
[`@moltenship/calendar-react` API guide](../api/calendar-react.md) specifies the per-instance store,
controlled slices, typed factory, compound context, custom views, capabilities, diagnostics,
selector, injection, cleanup, and hydration contracts. Generated API reports and compatibility
tables will join these guides as release tooling lands.
