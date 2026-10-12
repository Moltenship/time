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
  calendar-full/    installs every item above, owns no files         registry item "calendar-full"
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

Items reach each other through URLs under `https://moltenship-time.vercel.app/r`. Set
`REGISTRY_BASE_URL`, or pass `--base-url`, to build for another host.

## Checks

- `vp run registry:smoke`, part of `vp run ready`: checks the manifests and a contract fixture,
  builds the registry offline into a temporary folder, and checks what it built. Every import must
  resolve to a file, component or package the item's install provides; `calendar-full` must
  install every item and own no file; ranges must hold for the workspace versions.
- `vp run registry:e2e`, slow and online: makes clean Vite and Next.js apps with `shadcn init`, runs
  `shadcn add <url>/calendar-full.json` against the registry served locally, checks where the
  files landed and what the app installed, then typechecks and builds both apps. The Vite app uses
  a non-default `components` alias. The runtime packages aren't on npm yet, so the test packs them
  from the workspace and serves them from a local npm registry for the `@moltenship` scope;
  `REGISTRY_E2E_PACKAGES=npm` uses the published ones instead, `REGISTRY_E2E_TARBALLS=<dir>` serves
  tarballs made elsewhere, and `REGISTRY_E2E_KEEP=1` keeps the apps.

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
- Render each event as a `<button data-event-id={id}>` (the pointer layer's contract). Apps open
  event details by delegating clicks on `[data-event-id]`, so views need no click callback.
- Name each event with `useEventLabel` from `@registry/calendar/event-label`: title, when, the
  view's `describeEvent` detail (such as the event's calendar), and "saving" while a change is
  pending. Focus rings are a 2px `outline-ring` outline on `:focus-visible`.
- Keyboard: a view spreads `useViewKeyboard()` from `@registry/calendar/view-keyboard` on its
  grid and keeps one tab stop. It is `useCalendarKeyboard` kept to the view's own elements, with
  navigation keys that never fall through to app shortcuts. Cells register with
  `useRovingFocus`, and events with `useEventChip`, which also marks a grabbed event. Apps
  render `<Calendar.Announcer messages={calendarAnnouncements} />` from
  `@registry/calendar/announcements`, the English messages for moves, resizes and creates.
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
@import "shadcn/tailwind.css";
@import "../../../registry/calendar-theme/calendar-theme.css";
@source "../../../registry";
@custom-variant dark (&:is(.dark *));
```

The app also lists the UI dependencies the source uses (`@base-ui/react`, `cn`,
`class-variance-authority`, `lucide-react`, and `shadcn` for its Tailwind variants), exactly as a
stock shadcn project has them.
