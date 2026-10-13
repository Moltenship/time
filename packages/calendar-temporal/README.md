# @moltenship/calendar-temporal

The date math of Moltenship Time: half-open ranges, month and week grids, rounding and snapping,
day boundaries, time slots and DST handling. Every function takes and returns native Temporal
values, and none of them read the clock or the host time zone.

`@moltenship/calendar` re-exports all of it, so apps that use the calendar import these functions
from there. The package on its own has no dependencies and no React: install it directly when you
only need the date and time zone helpers.

```ts
import { plainDateInterval, plainDateIntervalContains } from "@moltenship/calendar-temporal";

const october = plainDateInterval(
  Temporal.PlainDate.from("2026-10-01"),
  Temporal.PlainDate.from("2026-11-01"),
);
plainDateIntervalContains(october, Temporal.PlainDate.from("2026-11-01")); // false
```

## Install

```bash
pnpm add @moltenship/calendar-temporal
```

- A runtime with `Temporal` (Node.js 26 and later include it), or a polyfill that defines
  `globalThis.Temporal`, loaded first.
- TypeScript 6 or later with `"lib": ["ESNext"]`, which includes the `Temporal` types.

## Documentation

- [Temporal helpers](https://moltenship-time.vercel.app/docs/api/temporal)
- [Repository](https://github.com/Moltenship/time)

## License

MIT
