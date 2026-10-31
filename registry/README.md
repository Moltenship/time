# Registry source

Consumer-owned, shadcn-style source for calendar UI. Users add these files to their app with
`npx shadcn add <url>` and edit them; nothing here is published to npm. The same files power the in-repo demo, so what we
ship is what we run.

## Layout

```text
registry/
  calendar-theme/   tokens + event palette          registry item "calendar-theme"
  calendar/         toolbar, view switcher, event chip, mini month   registry item "calendar"
  month-view/ …     one folder per view, each its own registry item
  recurrence-scope-dialog/   asks which events of a recurring series a change applies to
  calendar-history-toast/    an Undo toast and keys for a calendar's event history
  calendar-full/    installs every item above, owns no files         registry item "calendar-full"
  stylex-<item>/    the same items, styled with StyleX and Astryx    registry item "stylex-<item>"
  ui/               stock shadcn components (Base UI, base-nova style): button, dialog, popover, …
  tests/            focused tests for the source above
```

A folder with a `registry-item.json` is a registry item. The manifest follows the
[shadcn registry-item schema](https://ui.shadcn.com/schema/registry-item.json), with a few rules
that `tools/registry` checks:

- Every file has a `target` under one of shadcn's alias placeholders, such as
  `@components/calendar/month-view/month-view.tsx`, so it lands under the consumer's own
  `components` alias. No two items write the same file.
- `dependencies` lists bare package names, each declared in `registry/package.json`. The build
  adds a range to ours, `@moltenship/calendar@^<workspace version>`. Third-party packages stay bare,
  as in stock shadcn items, so `shadcn add` keeps the version an app already has.
- `registryDependencies` lists stock shadcn components by name (`button`, `popover`) and our own
  items as `@moltenship/<item>`. The build turns ours into URLs.
- No item depends on a drag-and-drop library. Views edit through the pointer layer in
  `@moltenship/calendar`, which stays off until the app passes `onEventChange`.
- `calendar-theme` points `meta.stylesheet` at `calendar-theme.css`. The build turns the file into
  the item's `cssVars` and `css`, so `shadcn add` merges its tokens and rules into the app's global
  CSS, inside `@layer base` as in the file. The stock shadcn tokens the file also sets stay out: a
  shadcn app has its own.
- `calendar-full` is a `registry:item` that owns no files and installs every other item.

`ui/` is not a registry item. It holds the components a stock shadcn app already has (Base UI,
`base-nova` style), unchanged apart from the `@registry/ui/button` import path, so the source
compiles here. Items list them in `registryDependencies`, and consumers get the upstream versions.

## Building and serving

`vp run registry:build` builds the registry with the official `shadcn build` into
`apps/showcase/public/r`, which the docs site serves as `/r/<item>.json`, with `/r/registry.json`
as the index. The docs site's `dev` and `build` scripts run it first; the output isn't committed.
The build:

1. checks the manifests;
2. copies the source to a temporary folder with each `@registry/…` import rewritten to the path
   shadcn rewrites to the consumer's aliases: `@registry/ui/button` becomes
   `@/components/ui/button`, and `@registry/calendar/event-chip` becomes the import for its target,
   `@/components/calendar/event-chip`;
3. writes a `registry.json` with a range on our runtime dependency, URL registry dependencies,
   and each item's `meta.compatibility`, the `@moltenship/calendar` range its whole install needs;
4. runs `shadcn build`, then writes `compatibility.json` beside the items: each item's URL,
   runtime range, packages, items, components and targets, and the workspace versions they were
   built against. Release tooling reads it instead of parsing shadcn items.

Items reach each other through URLs under `https://time.molten.sh/r`. Set
`REGISTRY_BASE_URL`, or pass `--base-url`, to build for another host.

## Checks

- `vp run registry:smoke`, part of `vp run ready`: checks the manifests and a contract fixture,
  builds the registry offline into a temporary folder, and checks what it built. Every import must
  resolve to a file, component or package the item's install provides; component files that need
  the client must start with `"use client"`; `calendar-full` must install every item and own no
  file; ranges must hold for the workspace versions.
- `vp run registry:e2e`, slow and online: makes clean Vite and Next.js apps with `shadcn init`, runs
  `shadcn add <url>/calendar-full.json` against the registry served locally, checks where the
  files landed and what the app installed, then typechecks and builds both apps. The Vite app uses
  a non-default `components` alias. The Next.js app's page, a Server Component, imports every item
  the client page uses straight from the server. The test packs the runtime packages from the
  workspace, so it checks the registry against the code beside it rather than what's on npm, and
  serves them from a local npm registry for the `@moltenship` scope; each app's lockfile must have
  them with the served tarballs' hashes. `REGISTRY_E2E_PACKAGES=npm` uses the published ones
  instead, `REGISTRY_E2E_TARBALLS=<dir>` serves tarballs made elsewhere, and `REGISTRY_E2E_KEEP=1`
  keeps the apps (`failed`: only when one fails).
  It prints `REGISTRY_E2E <json>` when both apps pass, with the hash of each tarball it served, or
  `REGISTRY_E2E_FAILED <json>` naming each app that failed and its step. The full tier runs it
  through `vp run release:artifacts`, on the release dry run's tarballs.

## Conventions

- Import shared source through the `@registry/*` alias: `@registry/ui/button`,
  `@registry/calendar/event-chip`, `@registry/calendar-theme/event-colors`. Files inside one item
  may import each other relatively. Class names merge with `cn` from the `cn` package, as stock
  shadcn components do.
- Compose with Base UI's `render` prop, never `asChild`:
  `<TooltipTrigger render={<Button variant="ghost" />}>…</TooltipTrigger>`. Tooltips need a
  `TooltipProvider` around the app, as `shadcn add tooltip` instructs.
- Registry source imports only the calendar facade (`@moltenship/calendar`) and the UI
  dependencies declared in `registry/package.json`. `dependency-cruiser.config.ts` enforces this.
- Style with the theme tokens, not raw colours: `bg-calendar-event`, `border-calendar-grid`,
  `text-calendar-today`, `h-(--calendar-hour-height)`.
- Event colours: a view accepts an optional `getEventColor?: (event) => CalendarEventColor` option
  and sets `data-color` on each event element (`EventChip` does this through its `color` prop).
  The theme maps `data-color` to the `--calendar-event`, `--calendar-event-foreground`, and
  `--calendar-event-border` tokens for light and dark themes.
- Event icons: a view accepts an optional `getEventIcon?: (event) => ReactNode` option and renders
  the result with `EventIcon` from `@registry/calendar/event-chip`, inline at the start of the
  event's title, in the chip's text colour. It is `aria-hidden`, so what it means belongs in the
  view's `describeEvent`. Without an icon nothing renders, and the chip's layout is unchanged.
- Render each event as a `<button data-event-id={id}>` (the pointer layer's contract), with its
  title in an element marked `data-slot="calendar-event-title"`. Apps open event details by
  delegating clicks on `[data-event-id]`, so views need no click callback, and animate from the
  event and its title, as the Motion guide does.
- Name each event with `useEventLabel` from `@registry/calendar/event-label`: title, when, the
  view's `describeEvent` detail (such as the event's calendar), and "saving" while a change is
  pending. Focus rings are a 2px `outline-ring` outline on `:focus-visible`.
- Keyboard: a view spreads `useViewKeyboard()` from `@registry/calendar/view-keyboard` on its
  grid and keeps one tab stop. It is `useCalendarKeyboard` kept to the view's own elements, with
  navigation keys that never fall through to app shortcuts. Cells register with
  `useRovingFocus`, and events with `useEventChip`, which also marks a grabbed event. Apps
  render `<Calendar.Announcer messages={calendarAnnouncements} />` from
  `@registry/calendar/announcements`, the English messages for moves, resizes and creates.
- A component file that calls hooks, creates a context or sets event handlers starts with
  `"use client"`, so a Server Component can import it (#190). Hook and helper modules (`.ts`) render
  nothing and don't need it, as in shadcn's own registry.
- Copy is English and lives in the source; consumers own and translate it. Dates are formatted
  with `Intl` from the calendar locale.

## The StyleX flavour

Tailwind and shadcn tokens are the baseline. Every `<item>` also has a `stylex-<item>`, for apps
that style with StyleX and build on [Astryx](https://astryx.atmeta.com) rather than Tailwind:
`stylex-month-view`, `stylex-calendar-full`, and so on. It is the same component with the same
behaviour: same file names, exports, `data-slot` and `data-*` attributes, roles and labels, with
Tailwind classes replaced by `stylex.create` and shadcn components by Astryx ones. Its files land
under `@components/calendar-stylex/`, so the two flavours never write the same file. A fix to a view
belongs in both. `vp run registry:stylex` runs every test in `tests/` against this flavour, and
`tests/stylex-flavour.test.ts` keeps the two in step.

The tokens are the theme's, with the same names: `calendarVars["--calendar-grid"]` from
`@registry/stylex-calendar-theme/calendar-tokens.stylex` is `var(--calendar-grid)`. A key starting
with `--` stays that custom property through `stylex.defineVars`, so `createTheme` overrides them,
and inline styles, a plain stylesheet or the Availability recipes can read them.

### Writing it

- One `const styles = stylex.create({…})` per file, after the imports; spread `stylex.props(…)` onto
  the element. Where the Tailwind source takes `className` and `style` and merges them, use `xprops`
  from `@registry/stylex-calendar-theme/xprops`, and add `xstyle?: XStyle` from the same file beside them
  for styles from the caller. Spread `{...props}` before it, so it wins.
- `cn(condition && "…")` becomes `stylex.props(condition && styles.x)`. Values computed at runtime
  stay in an inline `style`. Everything in `stylex.create` has to be static: no function calls but
  `calc` in strings, and only constants declared in the same file or `.stylex.ts` imports.
- Variants move inside the property: `data-dragging:opacity-40` is
  `opacity: { default: null, "[data-dragging]": 0.4 }`, `hover:` is `":hover"`, `focus-visible:` is
  `":focus-visible"`, `lg:` is `"@media (min-width: 1024px)"` (`sm` 640, `md` 768, `xl` 1280), and
  `group-hover:` is `stylex.when.ancestor(":hover")` with `stylex.defaultMarker()` on the ancestor.
  `dark:` has no equivalent, and needs none: `light-dark(a, b)` works for colours, inside
  `color-mix` too. It takes only colours, so `dark:brightness-110` becomes a colour mix.
- StyleX can't select descendants, so `[&_svg]:size-3` moves to the element, or the icon if the
  source renders it. Icons an app passes (`getEventIcon`) are sized in `calendar-global.css`, the
  stylesheet for what StyleX can't reach. Add to it only as a last resort.
- Tailwind's values: spacing `n` is `n * 0.25rem`; `text-xs` is 0.75rem with line height 1rem,
  `text-sm` 0.875rem/1.25rem, `text-base` 1rem/1.5rem, `text-lg` 1.125rem/1.75rem; `leading-tight`
  1.25, `leading-none` 1; `font-medium` 500, `font-semibold` 600; `rounded-sm` is
  `calc(var(--radius) * 0.6)`, `rounded-md` `* 0.8`, `rounded-lg` `var(--radius)`, `rounded-xl`
  `* 1.4`, `rounded-full` 9999px; `shadow-sm` `0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0
  / 0.1)`, `shadow-lg` `0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`;
  `ring-2` is `box-shadow: 0 0 0 2px <color>`; `opacity-*` and colours such as `bg-primary/10` are
  `color-mix(in oklch, <token> 10%, transparent)`.
- `truncate` is `overflow: hidden`, `textOverflow: "ellipsis"`, `whiteSpace: "nowrap"`; `sr-only` is
  the eight properties of `VisuallyHidden`, which you can use from `@astryxdesign/core/VisuallyHidden`.
- Keep logical properties: `ms-1` is `marginInlineStart`, `start-0` `insetInlineStart`, `border-s`
  `borderInlineStartWidth`. Physical ones stay physical.
- Don't lean on a reset: `reset.css` from Astryx gives `box-sizing: border-box`, zero margins and
  zero-width solid borders, as preflight does. A border needs its width and colour set; a `<button>`
  inherits the font; keep `cursor: pointer` where Tailwind's button has it.
- Read `--calendar-surface` through `calendarConsts.surface` in the tokens file: it is unset, for a
  container to set.
- Event colours: wherever the source sets `data-color`, keep it and add
  `color !== undefined && eventColorStyles[color]`.
- `registry/ui` becomes Astryx: `@astryxdesign/core/Button`, `IconButton`, `Tooltip`, `Popover`,
  `Dialog`, `AlertDialog`, `Badge`, `Selector`. Read `node_modules/@astryxdesign/core/src/<Name>/<Name>.doc.mjs`
  for their props. Astryx's own components take `xstyle`. Base UI, unstyled, stays where Astryx has
  no way to do what the source does, such as an anchor-only popover. `cn` and
  `class-variance-authority` don't appear in this flavour, and Tailwind classes don't either.
- `.ts` files with no styles (`event-label.ts`, `preview-check.ts`) are copies with their imports
  changed; `tests/stylex-flavour.test.ts` holds them to it.
- Imports go through `@registry/stylex-<item>/…`, never `@registry/<item>/…` or `@registry/ui/…`.
- Manifests: name `stylex-<item>`, targets under `@components/calendar-stylex/`, the source's
  structure below it, `dependencies` swapped (`@stylexjs/stylex`, `@astryxdesign/core`, no `cn`), and
  `registryDependencies` only `@moltenship/stylex-<item>`, with no stock shadcn components.

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
@import "shadcn/tailwind.css";
@import "../../../registry/calendar-theme/calendar-theme.css";
@source "../../../registry";
@custom-variant dark (&:is(.dark *));
```

The app also lists the UI dependencies the source uses (`@base-ui/react`, `cn`,
`class-variance-authority`, `lucide-react`, and `shadcn` for its Tailwind variants), exactly as a
stock shadcn project has them.
