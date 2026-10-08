# Registry source

Consumer-owned, shadcn-style source for calendar UI. Users copy these files into their app and
edit them; nothing here is published to npm. The same files power the in-repo demo, so what we
ship is what we run.

## Layout

```text
registry/
  calendar-theme/   tokens + event palette          registry item "calendar-theme"
  calendar/         toolbar, view switcher, event chip, mini month   registry item "calendar"
  month-view/ …     one folder per view, each its own registry item
  ui/               local copies of standard shadcn primitives (button, dialog, popover, …)
  lib/utils.ts      the shadcn `cn` helper
  tests/            focused tests for the source above
```

A folder with a `registry-item.json` is a registry item. The manifest follows the
[shadcn registry-item schema](https://ui.shadcn.com/schema/registry-item.json) and lists every
file with an explicit consumer `target`. `vp run registry:smoke` validates all manifests with
`tools/registry`: schema, existing source files, safe and unique targets, npm dependency
specifiers, `calendar-*` CSS variable names, and `meta.compatibility` ranges.

`ui/` and `lib/` are not registry items. They are the components a shadcn app already has, so
items reference them through `registryDependencies` (`button`, `select`, `tooltip`, `utils`) and
consumers get the upstream versions. There is no `shadcn build` step yet; when one lands it must
map `@registry/ui/*` and `@registry/lib/utils` to the consumer's `components.json` aliases.

## Conventions

- Import shared source through the `@registry/*` alias: `@registry/ui/button`,
  `@registry/calendar/event-chip`, `@registry/calendar-theme/event-colors`. Files inside one item
  may import each other relatively.
- Registry source imports only the calendar facade (`@moltenship/calendar`) and the UI
  dependencies declared in `registry/package.json`. `dependency-cruiser.config.ts` enforces this.
- Style with the theme tokens, not raw colours: `bg-calendar-event`, `border-calendar-grid`,
  `text-calendar-today`, `h-(--calendar-hour-height)`.
- Event colours: a view accepts an optional `getEventColor?: (event) => CalendarEventColor` option
  and sets `data-color` on each event element (`EventChip` does this through its `color` prop).
  The theme maps `data-color` to the `--calendar-event`, `--calendar-event-foreground`, and
  `--calendar-event-border` tokens for light and dark themes.
- Render each event as a `<button data-event-id={id}>` (the pointer layer's contract). Apps open
  event details by delegating clicks on `[data-event-id]`, so views need no click callback.
- Copy is English and lives in the source; consumers own and translate it. Dates are formatted
  with `Intl` from the calendar locale.

## Consuming the source in this repo

`registry/` is a private workspace (`registry-source`) so its imports resolve and it can be
type-checked and tested in place. Apps do not depend on it as a package; they map the alias:

```jsonc
// apps/<app>/tsconfig.json
{ "compilerOptions": { "paths": { "@registry/*": ["../../registry/*"] } } }
```

```ts
// apps/<app>/vite.config.ts
export default defineConfig({ resolve: { tsconfigPaths: true } });
```

```css
/* apps/<app>/src/styles.css */
@import "tailwindcss";
@import "tw-animate-css";
@import "../../../registry/calendar-theme/calendar-theme.css";
@source "../../../registry";
@custom-variant dark (&:where(.dark, .dark *));
```

The app also lists the UI dependencies the source uses (`radix-ui`, `lucide-react`, …), exactly as
a consumer project would after `shadcn add`.
