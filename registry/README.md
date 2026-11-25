# Registry source

Consumer-owned, shadcn-style source for calendar UI. Users add these files to their app with
`npx shadcn add <url>` and edit them; nothing here is published to npm. The same files power the in-repo demo, so what we
ship is what we run.

## Layout

```text
registry/
  base-tokens/      shadcn's neutral tokens, for an app without them   registry item "base-tokens"
  calendar-theme/   tokens + event palette          registry item "calendar-theme"
  calendar-ui/      the controls kit on ui-sdk: button, badge, tooltip, select, popover, dialog, toast   registry item "calendar-ui"
  calendar/         toolbar, view switcher, event chip, mini month   registry item "calendar"
  month-view/ …     one folder per view, each its own registry item
  recurrence-scope-dialog/   asks which events of a recurring series a change applies to
  calendar-history-toast/    an Undo toast and keys for a calendar's event history
  calendar-full/    installs every item above but base-tokens, owns no files   registry item "calendar-full"
  stylex-<item>/    the same items, styled with StyleX                registry item "stylex-<item>"
  shared/           framework-free files that items of both frameworks install, such as the kit's classes
  solid/            the Solid registry: calendar-theme, base-tokens, calendar, list-view   served at /r/solid
  tests/            focused tests for the source above
```

A folder with a `registry-item.json` is a registry item. The manifest follows the
[shadcn registry-item schema](https://ui.shadcn.com/schema/registry-item.json), with a few rules
that `tools/registry` checks:

- Every file has a `target` under shadcn's `@components/` alias placeholder, such as
  `@components/calendar/month-view/month-view.tsx`, so it lands under the consumer's own
  `components` alias. No two items write the same file.
- `dependencies` lists bare package names, each declared in `registry/package.json`. The build
  adds a range to ours, `@moltenship/calendar@^<workspace version>`. Third-party packages stay bare,
  as in stock shadcn items, so `shadcn add` keeps the version an app already has.
- `registryDependencies` lists our own items as `@moltenship/<item>`, which the build turns into
  URLs. The Tailwind items list no stock shadcn components: their controls come from
  `calendar-ui`.
- No item depends on a drag-and-drop library. Views edit through the pointer layer in
  `@moltenship/calendar`, which stays off until the app passes `onEventChange`.
- `calendar-theme` points `meta.stylesheet` at `calendar-theme.css`. The build turns the file into
  the item's `cssVars` and `css`, so `shadcn add` merges its tokens and rules into the app's global
  CSS, inside `@layer base` as in the file. The stock shadcn tokens the file also sets stay out: a
  shadcn app has its own. `base-tokens` does the same with `shared/base-tokens/base-tokens.css`, which
  the Solid tree's `base-tokens` builds from too, and keeps the stock
  tokens, which are its job; it owns no other files. No manifest sets `cssVars` or `css` itself.
- `calendar-full` is a `registry:item` that owns no files and installs every other item but
  `base-tokens`. The Solid tree has its own, which installs every Solid item but `base-tokens`.
- A file under `shared/` is plain TypeScript (`.ts`) with no framework in it. It imports other
  shared files and only the framework-free packages in `sharedFilePackages`
  (`tools/registry/src/config.ts`): no React, Solid, Base UI or ui-sdk, and no item's own file.
  The kit's shared files, in `shared/calendar-ui/`, may also import `@ui-sdk/core`, which has no
  framework in it. A package joins that list when a shared file needs it and it imports no
  framework. An item lists the shared files it installs among its own `files`, with their targets.
  `calendar-ui` installs `shared/calendar-ui/<control>.styles.ts`, the class strings each control's
  look comes from, so another framework's kit can install the same look, and the handles its
  popover, tooltip and toast keep (`popover-handle.ts`, `tooltip-handle.ts`, `toast-manager.ts`).
  `stylex-calendar-ui` installs the same handles, and its look from
  `shared/stylex-calendar-ui/<control>.styles.ts`. A shared file two items install can land at two
  targets: the build resolves each import to the target in the importing item's own install.

The Tailwind items take every control from `calendar-ui`: buttons, badges, tooltips, selects,
popovers, dialogs and toasts. So those controls look the same in every app and don't follow the
app's own `components/ui`, and the items need neither Base UI nor a shadcn style. The stock shadcn
components the demo uses for its own chrome live in `apps/demo/src/components/ui`, and the docs
site keeps its own in `apps/showcase/components/ui`: the release gate builds it without the demo.

## Building and serving

`vp run registry#site` builds the registry with the official `shadcn build` into
`apps/showcase/public/r`, which the docs site serves as `/r/<item>.json`, with `/r/registry.json`
as the index. The docs site's `dev` and `build` scripts run it first; the output isn't committed.
The build:

1. checks the manifests;
2. copies the source to a temporary folder with each `@registry/…` import rewritten to the path
   shadcn rewrites to the consumer's aliases: `@registry/calendar/event-chip` becomes the import for
   its target, `@/components/calendar/event-chip`;
3. writes a `registry.json` with a range on our runtime dependency, URL registry dependencies,
   and each item's `meta.compatibility`, the `@moltenship/calendar` range its whole install needs;
4. runs `shadcn build`, then writes `compatibility.json` beside the items: each item's URL,
   runtime range, packages, items, components and targets, and the workspace versions they were
   built against. Release tooling reads it instead of parsing shadcn items.

Items reach each other through URLs under `https://time.molten.sh/r`. Set
`REGISTRY_BASE_URL`, or pass `--base-url`, to build for another host.

## Checks

- `tools/registry/tests`, part of `vp test`: checks the manifests and a known-bad fixture, builds
  the registry offline into a temporary folder, and checks what it built. Every import must
  resolve to a file, component or package the item's install provides; component files that need
  the client must start with `"use client"`; each flavour's full item must install exactly that
  flavour's other items and own no file; ranges must hold for the workspace versions. Every
  `vp run registry#site` runs the same checks on what it builds.
- `vp run registry:e2e`, slow and online: makes clean Vite and Next.js apps with `shadcn init`, runs
  `shadcn add <url>/calendar-full.json` against the registry served locally, and a clean Solid 2.0
  app that runs `shadcn add @moltenship/base-tokens @moltenship/calendar-full` against `/r/solid` with
  the `components.json`, `app.css` and page that the Solid docs show, from
  `apps/showcase/content/examples/solid`; checks where the
  files landed and what the app installed, then typechecks and builds both apps. The Vite app uses
  a non-default `components` alias. The Next.js app's page, a Server Component, imports every item
  the client page uses straight from the server. The test packs the runtime packages from the
  workspace, so it checks the registry against the code beside it rather than what's on npm, and
  serves them from a local npm registry for the `@moltenship` scope; each app's lockfile must have
  them with the served tarballs' hashes. `REGISTRY_E2E_PACKAGES=npm` uses the published ones
  instead, `REGISTRY_E2E_TARBALLS=<dir>` serves tarballs made elsewhere, and `REGISTRY_E2E_KEEP=1`
  keeps the apps (`failed`: only when one fails).
  `REGISTRY_E2E_APPS=vite,next,solid` picks the apps. It prints `REGISTRY_E2E <json>` when they all pass, with the hash of each tarball it served, or
  `REGISTRY_E2E_FAILED <json>` naming each app that failed and its step. The full tier runs it
  through `vp run release:artifacts`, on the release dry run's tarballs.

## Conventions

- Import shared source through the `@registry/*` alias: `@registry/calendar-ui/button`,
  `@registry/calendar/event-chip`, `@registry/shared/calendar-theme/event-colors`. Files inside one item
  may import each other relatively. Class names merge with `cn` from the `cn` package, as stock
  shadcn components do.
- Compose with the `render` prop, never `asChild`:
  `<TooltipTrigger render={<Button variant="ghost" />}>…</TooltipTrigger>`. The kit's tooltips
  group on their own and need no provider.
- The kit is a default an app can replace in part or whole: once added, its files are the app's
  code. So each control's props are a small, explicit interface with shadcn's and Base UI's names
  (what the views pass, nothing more), and a view uses a control only through those props. A view
  imports controls from `@registry/calendar-ui/*` only, never ui-sdk, and reads none of a
  control's ui-sdk parts, context or data attributes. The theming docs' "Use your own controls"
  lists what the views pass; change it with the props. `tools/a11y/tests/own-controls.a11y.tsx`
  runs the views with a button, a select, a popover and a dialog of an app's own, shadcn's stock
  ones.
- Hundreds of triggers share one popup, never one root each: the year's day popover, the
  annotations' tooltip and popover and the time grid's event tooltip each open from a handle
  (`createPopoverHandle`, `createTooltipHandle`) that every trigger passes with its `payload`. The
  month has one "+N more" per day at most, so each keeps its own popover.
- A kit control takes its classes from its `shared/calendar-ui/<control>.styles.ts` file and adds
  only the markup its framework needs. The kit's popups open in the browser's top layer, so they
  need no portal or `z-index`. ui-sdk puts its own CSS in a layer named `ui-sdk`, which the app
  names before Tailwind (`@layer ui-sdk;` above `@import "tailwindcss"`), so Tailwind wins.
- Registry source imports only the calendar facade (`@moltenship/calendar`) and the UI
  dependencies declared in `registry/package.json`. Only the kit imports ui-sdk, through
  `@ui-sdk/react/<entry>`. `dependency-cruiser.config.ts` enforces this.
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
  `@registry/shared/calendar/announcements`, the English messages for moves, resizes and creates.
- A component file that calls hooks, creates a context or sets event handlers starts with
  `"use client"`, so a Server Component can import it (#190). Hook and helper modules (`.ts`) render
  nothing and don't need it, as in shadcn's own registry.
- Copy is English and lives in the source; consumers own and translate it. Dates are formatted
  with `Intl` from the calendar locale.

## The StyleX flavour

Tailwind and shadcn tokens are the baseline. Every `<item>` also has a `stylex-<item>`, for apps
that style with StyleX rather than Tailwind: `stylex-month-view`, `stylex-calendar-ui`,
`stylex-calendar-full`, and so on. It is the same component with the same behaviour: same file
names, exports, `data-slot` and `data-*` attributes, roles and labels, with Tailwind classes
replaced by `stylex.create`. Its controls come from `stylex-calendar-ui`, the kit's twin on the
same ui-sdk parts and handles. Its files land
under `@components/calendar-stylex/`, so the two flavours never write the same file. A fix to a view
belongs in both. `vp run registry:stylex` runs every test in `tests/` against this flavour, and
`tests/stylex-flavour.test.ts` keeps the two in step.

The tokens are the theme's, with the same names and values, and read no other design system: `calendarVars["--calendar-grid"]` from
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
  `visuallyHiddenStyles.hidden` from `@registry/shared/stylex-calendar-theme/visually-hidden.styles`.
- Keep logical properties: `ms-1` is `marginInlineStart`, `start-0` `insetInlineStart`, `border-s`
  `borderInlineStartWidth`. Physical ones stay physical.
- Don't lean on a reset: the app may have none. Set `boxSizing: "border-box"`, margins and a
  border's width, style and colour where the element needs them; a `<button>` needs
  `fontFamily: "inherit"`; keep `cursor: pointer` where Tailwind's button has it. Tailwind's
  `outline-hidden` is `outlineStyle: "none"` with a transparent 2px outline under
  `@media (forced-colors: active)`.
- Read `--calendar-surface` through `calendarConsts.surface` in the tokens file: it is unset, for a
  container to set.
- Event colours: wherever the source sets `data-color`, keep it and add
  `color !== undefined && eventColorStyles[color]`.
- The controls come from `@registry/stylex-calendar-ui/<control>`, as the source's come from
  `@registry/calendar-ui/<control>`, with `xstyle` where the source passes `className`. Only the
  kit imports ui-sdk. A control's look lives in `shared/stylex-calendar-ui/<control>.styles.ts`,
  the StyleX translation of `shared/calendar-ui/<control>.styles.ts`; change both together. Shared
  style files can't import the theme's tokens, so they write `"var(--primary)"`, which is what
  `calendarVars["--primary"]` compiles to. `cn` and `class-variance-authority` don't appear in this
  flavour, and Tailwind classes don't either.
- `.ts` files with no styles (`event-label.ts`, `preview-check.ts`) are copies with their imports
  changed; `tests/stylex-flavour.test.ts` holds them to it.
- Imports go through `@registry/stylex-<item>/…`, never `@registry/<item>/…`.
- Manifests: name `stylex-<item>`, targets under `@components/calendar-stylex/`, the source's
  structure below it, `dependencies` swapped (`@stylexjs/stylex`, no `cn`), and
  `registryDependencies` only `@moltenship/stylex-<item>`, with no stock shadcn components.

## The Solid registry

`registry/solid` holds the items for Solid 2.0 apps
([ADR 0279](../docs/adr/0279-solid-views-in-the-registry.md)). The same tooling builds it, with
the Solid framework's settings in `tools/registry/src/config.ts`, into `/r/solid/<item>.json`,
with its own `registry.json` and `compatibility.json`; the React items keep their URLs. Its items
follow the rules above, with these differences:

- `dependencies` name `@moltenship/calendar-solid`, the Solid facade, which re-exports core and
  Temporal as `@moltenship/calendar` does. The build adds its range.
- `registryDependencies` name `@moltenship/<item>` and resolve to the Solid tree's URLs.
- An item lists its own `.tsx` files from `registry/solid/<item>/` and the shared files it needs
  from `registry/shared/`, at the same targets as the React item: `components/calendar/…`. A shared
  file imports the facade as `@moltenship/calendar`, and the Solid build rewrites that to
  `@moltenship/calendar-solid`; `tools/registry/src/solid-source.ts` does the same when the source
  runs in place. An item lists no file from the other framework's tree.
- `base-tokens` is React's item over the same `shared/base-tokens/base-tokens.css`, for a Solid
  app without shadcn/ui's theme.
- The icons are inline SVG in `calendar-ui/icons.tsx`, installed beside the kit's controls, so no
  item depends on an icon package.
- `calendar-full` installs every Solid item but `base-tokens`. The React registry's resource
  timeline and StyleX items have no Solid twin, so it installs neither.
- `calendar-ui` holds the controls the views use, on `@ui-sdk/solid`, with the same
  names, props and `shared/calendar-ui/<control>.styles.ts` look files as React's. A Solid control
  takes `class` where React's takes `className`. `registry/tests/kit-twins.test.ts` and the a11y
  run's `kit-twins` check fail when the two kits drift.

`registry/solid` is its own private workspace (`registry-source-solid`), depending on
`@moltenship/calendar-solid`, with `@registry/*` mapped to it and `@registry/shared/*` to
`registry/shared`. Its tests run in the `registry-solid` Vitest project, and
`tools/a11y/tests/solid` checks each Solid item that draws something in a real browser against
what the React files check (`registry/tests/solid-twins.test.ts` fails when an item has no file
there). `apps/demo-solid` draws every view from it.

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
@import "../../../registry/shared/calendar-theme/calendar-theme.css";
@source "../../../registry";
@custom-variant dark (&:is(.dark *));
```

The app also lists the UI dependencies the source uses (`@ui-sdk/core`, `@ui-sdk/react`, `cn`,
`class-variance-authority`, `lucide-react`, and `shadcn` for its Tailwind variants).
