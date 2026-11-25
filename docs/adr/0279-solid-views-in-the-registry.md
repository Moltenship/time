# ADR 0279: Solid views in the registry, on one kit of ui-sdk controls

- Status: Accepted
- Date: 2026-11-25
- Issue: [#279](https://github.com/Moltenship/time/issues/279)
- Amends: [ADR 0001](./0001-hybrid-distribution.md), [ADR 0005](./0005-dependency-law.md) and
  [ADR 0275](./0275-ui-sdk-primitives.md)

## Context

The calendar ships in two halves (ADR 0001). The behaviour is npm packages. The look is source
files: an application copies the ready-made views into its own code and owns them from then on.

Some terms this record uses:

- The **registry** is the folder `registry/` and the JSON files built from it, served at
  `https://time.molten.sh/r/`. An **item** is one installable unit of it, such as `list-view`. Its
  **manifest**, `registry-item.json`, lists the item's files, the npm packages it needs and the
  other items it needs. A file's **target** is where it lands in the application, for example
  `components/calendar/list-view/agenda-view.tsx`.
- The **`shadcn` CLI** is the command-line tool of shadcn/ui. `shadcn add <item>` downloads an item,
  writes its files under the folders an application names in its `components.json`, installs its
  npm packages and merges its CSS.
- A **token** is a CSS custom property that holds a design value, such as `--background` or
  `--calendar-grid`. The items read shadcn's token names, so a calendar takes an application's
  colours and corner radius.
- A **control** is a general interface part that is not specific to calendars: a button, a
  popover, a dialog, a select, a tooltip, a toast.
- A **flavour** is the same items styled another way. Today there is one, `stylex-<item>`, which
  uses StyleX instead of Tailwind CSS.
- A **facade** is the one package an application imports the calendar from. For React it is
  `@moltenship/calendar`.

Version 2.0 moved the calendar's behaviour into framework-free primitives written on ui-sdk and
added a SolidJS 2.0 integration, `@moltenship/calendar-solid` (ADR 0275). That record left one
thing open: the registry's views are React only, so a Solid application has a root, parts and
hooks, and nothing to render with. The Solid demo (`apps/demo-solid`, served at
<https://moltenship-time-demo.vercel.app/solid/>) draws its two views by hand.

2.0 is in beta: `2.0.0-beta.1` went to npm under the `next` tag on 2026-11-25. The registry's
items may still change in ways that break an application's copy, which matters for point 5.

The registry today, counted on 2026-11-25:

- Thirteen Tailwind items, about 12,300 lines, and their thirteen StyleX copies. About 10,200
  lines of the Tailwind items are `.tsx` files. Only 396 lines sit in files with no framework in
  them at all.
- The React items take their controls from the application's stock shadcn components, which are
  built on Base UI, a React library. The repository keeps a copy of those components in
  `registry/ui` so the source compiles. Six of them are used by the views (button in 8 files,
  tooltip in 3, popover in 3, select, dialog and badge in 1 each). Seven view files also import
  Base UI directly. The docs therefore require an application whose shadcn style is a Base UI one.
- The StyleX items take their controls from Astryx, a React design system, and from Base UI.
- An agent that operates the page through ui-sdk's bridge sees ui-sdk components only. It sees the
  calendar and none of these controls (ADR 0275, consequences).

While this record was being written the owner set a direction for it, which the record tests
first. From shadcn the registry keeps two things only: the tokens, and the distribution system
(the registry format and `shadcn add`). The controls can be rewritten on ui-sdk in React as well as
in Solid, because ui-sdk gives every framework the same components from one core. The StyleX
flavour does not have to be built on Astryx either; it can be plain StyleX over the same controls.

The Solid integration is still gaining its interaction bindings. This record designs for the state
after two pieces of work that are in progress: keyboard gestures, roving focus, drafts and the
history binding move into the primitives and the pointer layer (`calendar-dnd`) loses its React
peer; then the Solid integration binds all of it.

## Decision

The evidence supports the owner's direction, with costs that are listed where they fall. Each
point below says what was proven and what was not; the evidence section has the details.

### 1. What the registry keeps from shadcn

Two things: the token names, with the Tailwind theme that maps them to utilities, and the
distribution system. The items stop depending on shadcn's components and on Base UI. An
application's `components/ui` folder is no longer read or written by the calendar's items.

### 2. One registry for each framework

A framework is a registry of its own. A flavour stays a prefix inside a registry.

| | Source | Served at | Facade |
| --- | --- | --- | --- |
| React | `registry/<item>/` as today | `/r/<item>.json` | `@moltenship/calendar` |
| Solid | `registry/solid/<item>/` | `/r/solid/<item>.json` | `@moltenship/calendar-solid` |

- **Item names and targets are the same in both.** `list-view` is `list-view`, and its files land
  under `components/calendar/list-view/` in either kind of application. An application has one
  framework, so the names never meet. Docs, support answers and an agent's instructions differ by
  one path segment and one package name.
- `registry/solid` is a workspace package of its own, `registry-source-solid`. It has its own
  `package.json`, which lists what Solid items may import; its own `tsconfig.json`, because Solid
  compiles JSX differently from React (`jsx: preserve`, `jsxImportSource: @solidjs/web`) and one
  TypeScript project cannot hold both; and its own test configuration. Inside it `@registry/*`
  means its own tree.
- The React items stay where they are. Moving them to `registry/react/` would rename every import
  in the repository and every documented path, and buys nothing.
- Each registry gets its own `registry.json` and `compatibility.json`.

### 3. Shared files, and where shared code lives

Code with no framework in it is written once, in `registry/shared/<item>/<file>.ts`. A shared
file is listed in the manifest of the item that owns it in each registry, with the same target.
It is copied into the application like any other file, so the application still owns it. Neither
framework's item imports the other's: both import the shared file.

Three kinds of code go there:

1. **Words.** Announcements for screen readers, labels and date formats (`announcements.ts`, the
   pure part of `event-label.ts`, `annotation-label.ts`). English copy stays in source the
   application owns, never in a package.
2. **Layout arithmetic tied to the default markup.** Row flattening and height estimates
   (`agenda-rows.ts`), timeline placement and scale, the boxes of time-grid events and drafts.
3. **Controllers.** Code that needs an element but no framework: virtualized scrolling, the
   scrolling axis, the all-day row's overflow. Each is written in the shape the pointer layer
   already uses, `attach<Name>(element, readOptions)` returning a cleanup function, and each
   framework binds it with a hook of about thirty lines. Virtualization uses
   `@tanstack/virtual-core`, the framework-free engine under the `@tanstack/react-virtual` the
   React views use today, so placements stay what the React tests expect.

Calendar rules with no look and no words (focus, keyboard gestures, drafts, snapping) belong in
the packages, where the in-progress work is already moving them. A function moves from a shared
file into a package only when the packages themselves need it: a package export is public API.

A shared file imports the facade under one name, `@moltenship/calendar`, and nothing with a
framework. The Solid build rewrites that name to `@moltenship/calendar-solid`, and the Solid
project's `tsconfig.json` maps it the same way, so every shared file is type-checked against both
facades. For this, **`@moltenship/calendar-solid` becomes the Solid facade**: it re-exports the
engine (`calendar-core`), the Temporal utilities and the pointer layer's public helpers, as the
React facade does. A Solid application then installs one package of ours.

The StyleX flavour keeps copies of the plain `.ts` files today, and a test keeps the copies equal.
Those files become shared files too, and the copies go.

### 4. Distribution: the shadcn CLI

The `shadcn` CLI installs Solid items into a Solid 2.0 application. It is the installer for both
frameworks; no CLI of our own is written. Tested with the catalog's version, 4.23.0.

A Solid application needs four things, none of them `shadcn init`:

1. Tailwind CSS 4.
2. A path alias such as `@/*` to `./src/*`, in `tsconfig.json` and in the bundler.
3. A `components.json`, written by hand. It names the stylesheet and the folders, and can name
   the registry once:

   ```json
   {
     "$schema": "https://ui.shadcn.com/schema.json",
     "style": "base-nova",
     "rsc": false,
     "tsx": true,
     "tailwind": { "config": "", "css": "src/app.css", "baseColor": "neutral", "cssVariables": true },
     "aliases": {
       "components": "@/components",
       "utils": "@/lib/utils",
       "ui": "@/components/ui",
       "lib": "@/lib",
       "hooks": "@/hooks"
     },
     "registries": { "@moltenship": "https://time.molten.sh/r/solid/{name}.json" }
   }
   ```

4. The base tokens (`--background`, `--primary`, `--border` and the rest). An application that
   has shadcn/ui has them. For one that does not, each registry gains a small item, `base-tokens`,
   with shadcn's neutral values. The calendar's own theme item keeps leaving them out, as today,
   so it never overwrites an application's colours.

The `registries` entry gives the registry a short name, called a namespace. Ours is
`@moltenship`, the same as the npm scope of the packages. With it, the install command is the
same in both frameworks: `npx shadcn@latest add @moltenship/list-view`. A React application's
entry points at `https://time.molten.sh/r/{name}.json`. The full URL keeps working:
`npx shadcn@latest add https://time.molten.sh/r/solid/list-view.json`.

`shadcn init` also works in a Solid application once the alias exists, but it treats the project
as a React one: it installs `@base-ui/react` and `lucide-react`, which a Solid application never
uses. The docs therefore show the hand-written file for Solid, as the StyleX page already does.

After point 5 a React application no longer needs `shadcn init` or a Base UI style either. The
same four things are enough.

### 5. Controls: one kit on ui-sdk, in both frameworks

Each registry gets an item, **`calendar-ui`**, called the kit here: button, badge, tooltip,
popover, select, dialog and toast, as thin wrappers over ui-sdk's components
(`@ui-sdk/react/<entry>` in React, `@ui-sdk/solid/<entry>` in Solid). Its files land under
`components/calendar/ui/`, a folder of the calendar's own, so it never collides with an
application's `components/ui`. Views import controls from the kit only; within registry source,
only the kit's files import ui-sdk.

The React kit and the Solid kit are **twins**: the same file names, the same exported parts, the
same props apart from each framework's spelling (`className` and `class`, children and render
functions), the same `data-slot` and state attributes, which come from ui-sdk's core, and the
same class names. To keep the last point true without discipline, a control's look is one shared
file, `registry/shared/calendar-ui/<control>.styles.ts`, plain TypeScript that holds the class
strings and variant tables. Each framework's file holds only the parts. One description of a
control then serves both frameworks, the docs and an agent.

This was tested. A dialog and a select, wrapped this way and given the same class strings,
produced the same element tree in a React application and in a Solid one, open and closed, with
the same computed styles and the same focus movement. The one difference was how a hidden form
field stores its value.

**The React items move to the kit.** The stock shadcn components and the direct Base UI imports
go. What that removes:

- `@base-ui/react` from every item, and the rule that an application must use a Base UI style.
  An application on shadcn's Radix style, or with no shadcn/ui at all, can install the views.
- A package from the install, with none added: a React application on 2.0 already has
  `@ui-sdk/core` and `@ui-sdk/react`, as peers of `@moltenship/calendar`.
- The portal. ui-sdk shows popups in the browser's top layer, the layer the browser draws above
  everything else, so they render in place and need no `z-index`.
- `tw-animate-css` and `shadcn/tailwind.css` as requirements. ui-sdk marks a popup's first and
  last frames with `data-starting-style` and `data-ending-style`, which Tailwind's built-in data
  variants style.
- `registry/ui` as part of the registry. It moves into `apps/demo`, whose own chrome keeps using
  it, as an application's own components beside the calendar.

What it costs:

- **The application's own buttons no longer flow into the calendar.** Today a view's button is
  the application's `components/ui/button`, so a team that restyled that file sees it in the
  calendar. With the kit, the calendar's controls follow the application's tokens (colours,
  radius, fonts) but not edits to its component files. The kit is seven small files the
  application owns, and it can restyle them once.
- **ui-sdk is a beta** (ADR 0275, risks). Until now only the calendar's structure rested on it.
  After this, focus trapping in the dialog, list navigation in the select and popup placement do
  too. The a11y suite and the views' tests, about 10,400 lines, are the check.
- **Applications that already installed the items keep a Base UI copy.** It keeps working: no
  package of ours imports Base UI. They move when they next run `shadcn add --overwrite` for an
  item, which brings the kit and replaces their edits to that item's files. The migration guide
  says so. The React kit lands inside 2.0, while 2.0 is a beta, so an application meets one
  migration and not a second one after the release.
- **Differences found by reading ui-sdk's docs,** each with an answer:
  - Base UI's detached triggers (`createHandle`, in the year view and the time grid's
    annotations) become ui-sdk's popup controllers (`createPopoverController`, with a `payload`
    per trigger).
  - Base UI's tooltip provider goes; ui-sdk groups tooltips without one.
  - Base UI's toast manager becomes ui-sdk's toast entry.
  - Two files use Base UI's `useRender` helper to give their own component a `render` prop. They
    take a render function instead.
  - ui-sdk's select does not accept a read-only array for `items`; the view switcher passes a
    copy.
  - No control the views use is missing: the React and Solid packages export the same 69 entries.

**Icons** are the one part of the kit that is not a twin yet. The React items keep `lucide-react`.
`lucide-solid` names Solid 1 in its peer range, so the Solid `calendar` item ships the seven icons
the views use as inline SVG in one file, `icons.tsx`, with the same names. The item moves to
`lucide-solid` when a release of that package accepts `solid-js` 2 in its peer range and its
icons render in the Solid registry's tests. That is one pull request: the imports change, the
package joins the item's dependencies, and `icons.tsx` goes.

### 6. What an agent gains

When the controls are ui-sdk components, ui-sdk's bridge reads them as it reads the calendar. In
the test, the bridge's snapshot listed the dialog (its label, whether it is open, its text and
buttons) and the select (its label, value and items), identically in React and Solid, and
`agent.act` chose a view through the select and pressed a button inside the dialog in both. An
agent can then answer the recurrence question ("this event or the series") in the dialog a person
would see, pick a view in the toolbar and press Undo in the toast. The calendar's own actions
remain the main path; this closes the gap ADR 0275 recorded, where the controls were invisible.

### 7. Styling

**Tailwind CSS 4 with the same tokens** is the default for both frameworks. The Solid
`calendar-theme` item is built from the same `calendar-theme.css`, so the two can't drift. The
Solid views use the same class strings as their React twins.

**The StyleX flavour becomes plain StyleX**, without Astryx:

- A `stylex-calendar-ui` kit: the same parts as `calendar-ui`, over the same ui-sdk components,
  styled with `stylex.create` and the theme's variables.
- The `stylex-*` items take their controls from it. Today they import six Astryx components
  (`VisuallyHidden` in 11 files, `IconButton` in 4, `Button`, `Tooltip`, `Selector` and `Badge` in
  1 each) and Base UI in 9 files. `@astryxdesign/core` and `@base-ui/react` leave every `stylex-*`
  manifest. Hiding text visually becomes eight style properties of our own.
- The StyleX tokens stop reading Astryx's variables first and hold their own values, which they
  already carry as fallbacks. An Astryx application maps its theme onto the calendar's variables
  in a few lines, which the StyleX page shows. The setup on that page loses the Astryx packages,
  its cascade layers and its `Theme` wrapper.
- The demo's `/stylex/` page keeps working throughout, because its own chrome (the app shell,
  drawer, event dialog, date and time fields; 19 files) imports Astryx by itself. A last step
  rewrites that chrome on ui-sdk components and StyleX, after which `@astryxdesign/*` leaves the
  repository. That step changes how the page looks, so its pull request carries before and after
  screenshots.

**A Solid StyleX flavour is out of scope for 2.0, and no longer blocked.** StyleX compiles in a
Solid 2.0 application and styles ui-sdk's Solid parts (tested). StyleX styles are plain
TypeScript, so the StyleX kit's style files are shared files and a Solid StyleX kit would be part
files only. The views are the cost: about 10,000 lines of markup would exist a fourth time, with
their tests. Nobody has asked for it. It can follow once the Solid Tailwind views are complete
and the React StyleX items are on the kit, if a Solid application that cannot use Tailwind asks.

### 8. How a view is written once

A React view today mixes three things in its `.tsx` files: calendar rules, layout and words with
no framework in them, and rendering. The split:

| Part of a view | Home | Written |
| --- | --- | --- |
| Focus, keyboard gestures, drafts, snapping, the pointer gesture | Packages (primitives, pointer layer), bound by each integration | Once |
| Words, layout arithmetic, controllers | Shared registry files | Once |
| Controls | The kit | Parts once per framework, look once |
| Markup: which elements, which classes, which handlers | The item's `.tsx` files | Once per framework |

Markup is written twice on purpose. It is the part an application edits, and it should read as
ordinary React or ordinary Solid. A Solid view is a translation of its React twin's markup and
nothing else; a rule or a number that appears in both is a defect to move into a shared file.

**Worked example, small: `list-view` (the agenda).** React today: 7 files, 959 lines.

| Solid item file | Kind | Source |
| --- | --- | --- |
| `agenda-rows.ts` | Shared, as it is (100 lines) | Days and events flattened into rows, height estimates |
| `agenda-labels.ts` | Shared, new | `timeLabel` from `agenda-item.tsx`, the empty and loading copy from `agenda-states.tsx` |
| `agenda-virtualizer.ts` | Shared, new | The placement and scrolling in `use-agenda-virtualizer.ts`, as `attachAgendaVirtualizer` on `@tanstack/virtual-core` |
| `use-agenda-virtualizer.ts` | Solid, about 30 lines | Binds the controller to a signal. React's file shrinks to the same size |
| `agenda-view.tsx`, `agenda-list.tsx`, `agenda-day.tsx`, `agenda-item.tsx`, `agenda-states.tsx` | Solid markup, about 650 lines | Translations of the React files |

From the `calendar` item it uses `event-chip.tsx` (Solid markup), the shared `event-label.ts` and
`announcements.ts`, and the shared key map in `view-keyboard.ts`. It needs no control, so it does
not wait for the kit. From the integration it needs `useCalendarFocus`, `useRovingFocus`,
`useCalendarKeyboard`, `useCalendarInteraction` and `eventIdAttributes`.

**Worked example, hard: `time-grid-view` (week and day).** React today: 10 files, 2,821 lines.

| Solid item file | Kind | Source |
| --- | --- | --- |
| `annotation-label.ts` | Shared, as it is (105 lines) | Labels for annotations |
| `time-grid-geometry.ts` | Shared, new | From `time-grid-column.tsx`: `draftBox`, `slotBand`, `bandStyle`, `sameBand`, `inResource`, `slotAnnotations`. From `time-grid-event.tsx`: `laneBox`, `wallTimes`, `rangeDash`, `isClipped`, `eventTimeRange`, `percent` |
| `all-day-overflow.ts` | Shared, new controller | Measuring how many all-day lanes fit, from `time-grid-all-day.tsx` |
| `time-grid-zones.ts` | Shared, new | The arithmetic of the secondary time zone labels |
| `time-grid-view.tsx` | Solid markup | Binds the pointer layer, the keyboard and focus to the grid |
| `time-grid-body.tsx`, `time-grid-header.tsx`, `time-grid-column.tsx`, `time-grid-event.tsx`, `time-grid-all-day.tsx`, `time-grid-zones.tsx`, `time-grid-availability.tsx` | Solid markup | Translations |
| `time-grid-annotations.tsx` | Solid markup | The kit's popover and tooltip, opened through controllers |

Dragging and keyboard moves add no file. The pointer gesture is `attachCalendarPointer` in the
pointer layer, bound by the integration's `useCalendarPointer`; a view passes it the columns, the
snap and the scroll container, as the React view does. From the integration the time grid needs
`useCalendarPointer`, `useCalendarKeyboard`, `useCalendarFocus`, `useRovingFocus`,
`useCalendarInteraction`, `useCalendarAnnouncer`, `useNow`, `useCalendarAnnotations`,
`useTimeGridAnnotations` and `useTimeGridAvailability`.

### 9. ui-sdk's behaviour blocks in the views

`@ui-sdk/core` exports building blocks for behaviour: `createRovingFocus` and `createGridFocus`
for arrow-key focus, `createSelection`, `createReorder`, `bindDrag`, `createSpans` for ranges
dragged along tracks, `createVirtualizer` and others. The calendar uses ui-sdk for its primitive,
state, parts and agent description, and its keyboard and pointer code is its own. Whether to
replace that code:

- **Controls: yes, and point 5 does it.** The select's list navigation, the dialog's focus trap,
  tooltip grouping and popup placement are these blocks, reached through ui-sdk's components.
- **Grid focus and roving focus: no.** `createGridFocus` moves between cells addressed by row and
  column and keeps the active cell in the component's own state. The calendar's focus is a value
  with meaning: a date, a time slot or an event, in a resource. An application may own it. It
  survives a change of view, pages to the next range when an arrow key passes the edge, lands on
  an event shown across several days, and keyboard moves and resizes of events run as engine
  sessions under the application's policies. A row and column would have to be translated to and
  from that value in every view, and the paging, event focus and carry-over would still be ours.
  The code is already moving into the primitives, where both frameworks share it.
- **Selection and reordering: no.** Selection is a slice of the calendar's own state, which an
  application can control (ADR 0275, point 3). Events are placed by time, not by order, so no
  view reorders. An application's own lists beside the calendar, such as the demo's unscheduled
  tasks, may use these blocks; that is the application's choice.
- **The pointer layer: no, and nothing found reopens ADR 0275.** `createSpans` is the closest
  block: bookings on tracks with snapping, lanes and auto-scroll. It works on plain numbers and
  keeps the drag's draft in ui-sdk state, so each pointer move writes state. The calendar's
  contract is that pointer movement causes no framework update and no write to ui-sdk state, and
  its gesture works on wall-clock times across daylight-saving changes, moves between views and
  resources, converts between all-day and timed, and commits through the engine's transactions
  and policies.
- **Virtualization: not now.** TanStack Virtual stays, and the shared controllers are written on
  `@tanstack/virtual-core`. `createVirtualizer` could replace it, remove a dependency and bring
  find-in-page for rows that are not rendered. The React views' scroll anchoring is tuned and
  tested against TanStack's engine, and changing the engine while adding a framework would hide
  regressions. It is something to look at after 2.0, with no commitment and no place in the
  order of work.

Registry source keeps away from ui-sdk's date entries (`calendar`, `date-picker`, `timeline` and
the date inputs), as the packages do: dates are the engine's.

### 10. Tooling and gates

`tools/registry` gains a description of a framework: its source folder and package file, the path
its output is served under, the packages the application provides (`react` and `react-dom`, or
`solid-js` and `@solidjs/web`), the facade's name, whether `"use client"` is required, and its
flavours. It builds, validates and checks once per framework. The unmodified tooling already built
five hand-made Solid items; its checker then reported exactly the three things the description
must hold (evidence). It also learns shared files: a manifest may list a file under
`registry/shared/`, and a shared file must import no framework.

What joins each tier (`AGENTS.md` describes the tiers):

| Check | Tier | Cost on a recent laptop |
| --- | --- | --- |
| Type check of `registry/solid` (`vp check`) | Quick, PR, full | Estimated 1 to 2 s when every view exists |
| Unit tests of Solid items, in the root's existing `solid` test project, which resolves Solid's browser build | Quick, PR, full | Under 1 s for the first item; estimated 2 to 4 s when every view exists (all of `vp test` is 7 s today) |
| Build and check of the Solid registry, in `tools/registry/tests` | Quick, PR, full | 0.5 s measured for five items |
| Kit twins: each control's open and closed element tree, in React and in Solid, compared with one stored description | PR, full (in the a11y run, in Chromium) | Estimated 1 to 2 s |
| The a11y suite over the Solid views: axe, keyboard paths and real pointer moves, in a second group of the same run | PR, full | About 2 s for the first view; estimated 5 to 10 s when every view exists |
| Install test: `shadcn add` into a clean Solid 2.0 app, then a type check and a build | Full (`release:artifacts`) | About 10 s alone, measured in parts; it runs beside the two React apps, so a few seconds of wall time |
| The Solid a11y group in WebKit (`browsers`) | Full | Estimated 5 to 10 s |

In all, the PR tier goes from about 30 s to an estimated 40 to 45 s and the full tier from about
120 s to about 140 s, once every Solid view exists. The estimates are scaled from the React
registry's share of today's runs and are to be measured in each pull request.

Solid item tests render with `@solidjs/web` and query the DOM directly. `calendar-testing` stays
React; a Solid test harness package remains a non-goal.

The dependency law changes with the pull requests that need it, not before:

- Rule 5 is stated per registry. React registry source imports the `@moltenship/calendar`
  facade, React items, shared files and the packages in `registry/package.json`. Solid registry
  source imports `@moltenship/calendar-solid`, Solid items, shared files and the packages in
  `registry/solid/package.json`. Shared files import the facade's name and packages both lists
  hold, and no framework. Stock shadcn components leave the rule when the last item leaves them.
- Rule 14 lets the kit's files import `@ui-sdk/react/<entry>` or `@ui-sdk/solid/<entry>`. Other
  registry files still import no ui-sdk.
- Rule 15 lets `registry/solid`, the Solid group of the a11y suite and the install test's Solid
  app import Solid.

### 11. Order of work

Two tracks that meet. In both, React goes first for each control: the React views' tests and the
a11y suite already exist, so a control is proven under them before its Solid twin is written
against the same shared look. The first Solid view needs no control, so the Solid path does not
wait.

Every step leaves `main` releasable. An item uses either the stock controls or the kit, never
half of each, and both can sit in one application. The Solid registry is served only from the
first Solid pull request, and its docs say which items exist.

Before the Solid views (in progress, outside this record): interaction in the primitives and a
framework-free pointer layer, then the Solid bindings. Not one of the hooks below is exported by
`calendar-solid` today.

| Item | Needs from the Solid integration |
| --- | --- |
| `calendar` (chip, toolbar, mini month, resource status) | `eventIdAttributes`, `useCalendarInteraction`, `useCalendarKeyboard`, `useDraftBusy`, `useNow`, `useResourceStatus`, `useRovingFocus` |
| `list-view` | `useCalendarFocus`, `useRovingFocus` |
| `month-view` | `useCalendarAnnouncer`, `useCalendarFocus`, `useCalendarInteraction`, `useCalendarPointer`, `useClosedDates`, `useRovingFocus` |
| `time-grid-view` | `useCalendarAnnotations`, `useCalendarAnnouncer`, `useCalendarFocus`, `useCalendarInteraction`, `useCalendarPointer`, `useNow`, `useRovingFocus`, `useTimeGridAnnotations`, `useTimeGridAvailability` |
| `year-view` | `useAnchorDateRequests`, `useClosedDates`, `useRovingFocus` |
| `scrolling-list-view` | `useAnchorDateRequests` |
| `scrolling-month-view` | `useAnchorDateRequests`, `useCalendarAnnouncer`, `useCalendarFocus`, `useCalendarPointer` |
| `scrolling-time-grid-view` | The same, and `useNow` |
| `resource-columns-view` | `resourceIdAttributes`, `useCalendarAnnouncer`, `useCalendarDraftReporter`, `useCalendarFocus`, `useCalendarPointer`, `useNow`, `useResourceExpansion` |
| `resource-timeline-view` | The same, and `useCalendarInteraction`, `useClosedDates`, `useRovingFocus`, `useTimelineAvailability` |
| `calendar-history-toast` | `useCalendarHistory`, `useCalendarHistoryShortcuts` |
| `recurrence-scope-dialog` | Nothing |

**Solid track.** Sizes are rough: S is under 300 changed lines, M under 1,000, L under 2,500.

| PR | Scope | Depends on | Size |
| --- | --- | --- | --- |
| S1 | The whole path, once. Tooling for a second framework and for shared files; `registry/solid`; `calendar-solid` as the Solid facade; the items `calendar-theme`, `base-tokens`, `calendar` (event chip, labels, key map, icons; no toolbar yet) and `list-view`; a clean Solid app in the install test; the first Solid a11y file; `apps/demo-solid` drawing its agenda from the registry; the docs' agenda page and installation page for Solid | The bindings `list-view` needs | L |
| S2 | The Solid kit, first controls (button, badge, tooltip, select), the kit twin check, and the rest of `calendar`: toolbar, view switcher, mini month, resource status | S1, K1 | M |
| S3 | `month-view`, the first view with the pointer layer; the popover twin | S2, K2, the pointer binding | M |
| S4 | `time-grid-view`, in three: the grid, events, now line and zones; then pointer, keyboard and drafts; then the all-day row, annotations and availability | S3 | L, three PRs |
| S5 | `year-view` | S3 | M |
| S6 | `recurrence-scope-dialog` and `calendar-history-toast`; the dialog and toast twins | S2, K2 | S |
| S7 | The three scrolling views | S3, S4 | L |
| S8 | `resource-columns-view`, then `resource-timeline-view` | S4 | L, two PRs |
| S9 | `calendar-full`; `apps/demo-solid` rebuilt on the registry's views with its hand-written ones deleted; the Solid a11y group complete; docs complete | All above | M |

**S1 is the smallest first pull request that proves the whole path:** tooling, one view, the
install test, the demo and the docs.

**Kit track.**

| PR | Scope | Depends on | Size |
| --- | --- | --- | --- |
| K1 | The React kit, first controls (button, badge, tooltip, select) on `@ui-sdk/react`, with shared look files; the `calendar` item and every view's buttons move to it. Brings shared files if S1 has not | Nothing | M |
| K2 | Popover, dialog and toast; the month, year and time-grid popovers and tooltips, the recurrence dialog and the history toast move. `@base-ui/react` leaves every Tailwind item; `registry/ui` moves to the demo; the docs drop the Base UI requirement; `base-tokens` for React. Before and after screenshots | K1 | L |
| K3 | `stylex-calendar-ui`; the `stylex-*` items leave Astryx and Base UI; token values; the StyleX page | K2 | M to L |
| K4 | The demo's `/stylex/` chrome on ui-sdk and StyleX; `@astryxdesign/*` leaves the repository. Screenshots | K3 | M |

S1 and K1 can run at the same time. K3 and K4 don't block the Solid track. Both tracks land
inside 2.0, before its release: K1 and K2 change what the React items contain, which a beta
allows.

### 12. Docs

- **One set of pages, two tabs.** Each views page, the quick start and the installation page show
  React and Solid code in tabs that share one remembered choice, so picking Solid on one page
  picks it on all. The API pages are already one per framework.
- **Install commands** are the same text in both tabs when the application's `components.json`
  names the registry (`npx shadcn@latest add @moltenship/list-view`); the tab changes the
  `components.json` snippet and the full-URL form, by one path segment. Import paths in the
  examples are the same (`@/components/calendar/list-view/agenda-view`); the package name differs.
- **A later React and Solid switch in the sidebar** sets the same remembered choice and hides the
  other tab. Nothing in the registry has to change for it: no item is renamed and no URL moves.
- **Live examples** in the docs stay React, since the docs site is a React application. Solid tabs
  show source and link to the Solid demo at <https://moltenship-time-demo.vercel.app/solid/>.
  Solid examples that run on the docs site may come later; this record plans none.
- Until every Solid view exists, the Solid tab of a views page without one says so.

### 13. Decided by the owner

The first version of this record put eleven questions to the owner. The answers, given on
2026-11-25, are part of the decision, and each is written into the point it belongs to. No
question is left open.

1. Merging this record accepts it.
2. The calendar's controls stop being the application's own `components/ui` files. They follow
   the application's tokens only, and the application owns the kit's files (point 5).
3. The React kit, K1 and K2, lands inside 2.0, so there is one migration. Changing what the items
   contain is acceptable now because 2.0 is a beta (points 5 and 11).
4. `@moltenship/calendar-solid` is the Solid facade, as `@moltenship/calendar` is the React one
   (point 3).
5. The registry's namespace is `@moltenship`, like the npm scope (point 4).
6. Each registry gets a `base-tokens` item (point 4).
7. The Solid items ship seven icons as inline SVG until `lucide-solid` supports Solid 2.0
   (point 5).
8. The demo's `/stylex/` page leaves Astryx in K4, the last step of the kit track (points 7
   and 11).
9. Solid StyleX views are out of scope for 2.0 (point 7).
10. The docs show Solid source and link to the Solid demo. Solid examples running on the docs
    site are not planned (point 12).
11. TanStack Virtual stays. `createVirtualizer` is a possibility after 2.0, with no commitment
    (point 9).

## Alternatives

- **`solid-<item>` folders in the one registry, as the StyleX flavour is done.** One TypeScript
  project cannot type-check two JSX dialects, one `package.json` cannot say which packages each
  framework's items may import, the duplicate-target rule would need exceptions, and names would
  multiply with flavours (`solid-stylex-list-view`). Rejected.
- **A package of ready-made Solid views.** It would break the split of ADR 0001: an application
  could not edit the look. Rejected.
- **A CLI of our own for Solid.** Only worth it if `shadcn add` failed. It did not.
- **Solid controls from a Solid library.** On 2026-11-25 none declares support for Solid 2.0:
  Kobalte, corvu, the Solid adapter of TanStack Virtual and `lucide-solid` name Solid 1 in their
  peer ranges, and Ark UI's range is open-ended and untested. None is read by ui-sdk's agent
  bridge. Rejected.
- **A Solid kit on ui-sdk while React stays on Base UI.** The least work now. It leaves two
  descriptions of every control, the controls invisible to agents in React, and the Base UI style
  requirement. Rejected in favour of the owner's direction.
- **Views that call ui-sdk's components directly, with no kit.** Every view would repeat the
  class strings of every control, and an application could not restyle a control in one place.
  Rejected.
- **Shared code kept as checked copies,** as the StyleX flavour keeps its `.ts` files. A test can
  keep copies equal, but every change is made twice or four times. Rejected; the copies go.
- **Shared code in packages only.** Words and pixel arithmetic for the default markup would
  become public API that an application cannot edit. Rejected, except for calendar rules.
- **One markup source compiled to both frameworks,** or markup that takes all its styling from a
  separate map so that flavours share it. Either would make the files an application owns read
  like neither framework's ordinary code, and the second means rewriting every React view. It
  is the only way a fourth copy of the views would become cheap, so it is the idea to return to
  if a Solid StyleX flavour is ever wanted. Rejected for now.
- **The Solid kit before the React kit.** Nothing existing could break, but the kit's shape would
  be proven only by new tests, and changes found later in React would come back to Solid.
  Rejected: React first for each control, and the Solid path starts with a view that needs none.

## Consequences

- A Solid application installs the views with the same tool, the same item names and the same
  paths as a React one.
- A React application needs neither a Base UI style nor shadcn/ui itself, and loses a dependency.
  The calendar's controls stop being the application's own components.
- The controls are described once and read by agents in both frameworks.
- The registry's source becomes three trees: React items, Solid items and shared files. A change
  to a view's markup is made once per framework; a change to its rules, words or arithmetic once.
- `@moltenship/calendar-solid` grows a public surface as a facade. Its API report grows with it.
- More of the calendar's accessibility rests on a beta library.
- StyleX applications lose the Astryx requirement. Astryx applications lose the automatic match
  with their theme and gain a short mapping.
- The gate grows by an estimated 10 to 15 s in the PR tier and about 20 s in the full tier.
- `architecture.md` no longer says the question is open. Its dependency rules 5, 14 and 15 change
  in the pull requests named in point 10.

## Risks

- **ui-sdk changes or breaks a control.** The catalog pins one beta and a move is one pull
  request through the gate (ADR 0275). The kit is the only registry code that imports ui-sdk, so
  a break is fixed in seven files per framework.
- **A control behaves differently from Base UI in a way tests miss.** Each control moves in React
  first, under the existing tests and the a11y suite, with screenshots.
- **The twins drift.** The shared look files and the stored descriptions of each control's
  element tree are checked in the gate.
- **Solid 2.0 tooling is young.** Solid 2.0.0 is eight days old. The Solid registry project is the
  second place in the repository that compiles Solid JSX. The clean-app type check already caught
  one Solid-specific typing mistake in the spike.
- **`shadcn` changes how it treats a project that is not React.** The install test into a clean
  Solid app runs in the full tier on the catalog's version. The hand-written `components.json`
  depends on less of the CLI than `shadcn init` does.
- **Shared controllers change React behaviour.** Each controller moves in a pull request of its
  own kind of view, with the React tests unchanged.
- **Gate time.** The estimates may be low. Each pull request reports the measured change.

## Reversal trigger

Revisit if any of these holds:

- a release of the `shadcn` CLI stops installing into a Solid project and no setting or small
  workaround restores it within two weeks; the replacement would be a small script that reads the
  same registry JSON;
- a control on ui-sdk cannot pass a test of the a11y suite that its Base UI version passes, and
  ui-sdk does not fix it within two weeks; that control alone returns to Base UI in React and the
  twin rule is dropped for it;
- ADR 0275's own triggers fire, which would take the kit with them;
- a Solid control library with Solid 2.0 support and an agent surface appears and applications
  ask for it;
- keeping the Solid markup in step with React takes more work than the shared files save, shown
  by defects fixed in one framework and found later in the other.

## Evidence

Everything here ran on 2026-11-25 in scratch folders outside the repository, on Solid 2.0.3 and
2.0.4, `@ui-sdk/*` 0.1.0-beta.16, Tailwind CSS 4.3, Vite 8 and `shadcn` 4.23.0. No spike is part
of the pull request that adds this record.

### The shadcn CLI in a Solid 2.0 application

The application was the official Solid 2.0 starter with Tailwind
(`npx create-solid@latest <name> with-tailwindcss --solid --ts`).

1. `shadcn init` in the untouched starter **fails**: "Could not find valid path aliases or package
   imports for init." It detects Vite and Tailwind 4.
2. With `"paths": { "@/*": ["./src/*"] }` in `tsconfig.json` and `resolve.tsconfigPaths` in the
   Vite config, `shadcn init` **works**. It writes `components.json` (`rsc: false`), a
   `lib/utils.ts`, and the base tokens into the stylesheet. It also installs `@base-ui/react` and
   `lucide-react`, which a Solid application cannot use, and `shadcn`, `tw-animate-css` and a font.
3. Five hand-made Solid items were written: `calendar-theme` (the repository's own
   `calendar-theme.css`), `calendar-ui` (a button and a tooltip over `@ui-sdk/solid`, and a CSS
   file), `calendar` (an event chip and labels), `list-view` (an agenda in Solid JSX, with
   `agenda-rows.ts` taken from the React item) and `calendar-full`. The repository's
   **unmodified** `buildRegistry` built them in about 0.5 s. Packing the four runtime packages
   took about 2 s.
4. The unmodified `checkBuiltRegistry` reported seven issues of three kinds, which are exactly the
   tooling changes of point 10: imports of `solid-js` and `@solidjs/web` that no item provides
   (it knows only `react` and `react-dom`); a missing `"use client"` on a file with handlers; and
   a missing `stylex-calendar-full`.
5. `shadcn add <local url>/r/solid/list-view.json` after `init` **works**: it followed three
   registry dependencies given as URLs, wrote seven files under `src/components/calendar/`,
   installed the npm dependencies (`@moltenship/calendar-solid`, `-core` and `-temporal` from a
   local npm registry, `@ui-sdk/core`, `@ui-sdk/solid`) and merged the theme's 129 lines into the
   stylesheet. The `.tsx` files arrived unchanged apart from the alias in their imports: Solid's
   `class=`, `For` and `Show` passed through.
6. **Without `init`**, with the hand-written `components.json` of point 4 and the alias
   `@/shared/components`, `shadcn add <local url>/r/solid/calendar-full.json` **works**: eight
   files under `src/shared/components/calendar/`, imports rewritten to that alias, the CSS file
   written as a file, and no React package installed. What is then missing is the base tokens,
   which is why point 4 adds `base-tokens`.
7. With `"registries": { "@moltenship": "<local url>/r/solid/{name}.json" }` in
   `components.json`, `shadcn add @moltenship/list-view` **works** and installs the same eight
   files. The namespace has the same name as the npm scope of the packages the item depends on,
   and the CLI keeps the two apart.
8. Running `add` again: files that are identical are skipped and the theme is not merged twice. A
   file the application edited makes the CLI ask before overwriting, even with `--yes`; with
   `--overwrite` it is replaced. This is the CLI's behaviour for React items too.
9. In both applications `tsc --noEmit` and the production build pass. The type check caught one
   mistake in the hand-made chip: Solid's JSX types want `aria-busy="true"`, not a boolean.
10. In Chromium, the built application shows the agenda: the title "Oct 5 – 18, 2026", an event
    chip named "Standup, Thursday, October 8, 9:00 – 9:15 AM" with the blue palette's background
    and a 3-pixel accent, the kit's button, and a tooltip that opens on hover. The console is
    clean.

Not tested: `shadcn add` in a SolidStart application, and package managers other than pnpm.

### The same controls in React and Solid

Two Vite applications, one React 19 and one Solid 2.0, each with a kit of two files (dialog,
select) wrapping ui-sdk's components and reading one shared file of class strings.

- Both type-check and build. Both rejected the same thing first: a read-only array passed to the
  select's `items`.
- In Chromium the element tree under the page was serialized (tags, attributes, text; generated
  ids replaced by their order) with everything closed, with the select open and with the dialog
  open. **The trees are identical** apart from one node: the select's hidden form field holds its
  value as text in React and as a property in Solid.
- Computed styles of the dialog, its backdrop and title, the select's popup, its highlighted item
  and its trigger are identical. Focus goes to the same part when the dialog opens and returns to
  the trigger on Escape in both.
- ui-sdk's bridge (`createAgent`) returns identical snapshots in both, in each of the three
  states. `agent.act` set the select to "Month" by its label, opened the dialog and pressed its
  "Done" button, in both.
- The React and Solid packages of ui-sdk export the same 69 entries.

### StyleX in a Solid 2.0 application

In the Solid application above, `@stylexjs/unplugin` 0.19.1 ahead of Solid's Vite plugin compiles
`stylex.create` written in a plain `.ts` file. A ui-sdk Solid dialog and a plain element given
those styles take them in Chromium. Two things were needed: a three-line helper, because StyleX
returns `className` and Solid takes `class`; and `cssInjectionTarget`, to send StyleX's CSS to the
right stylesheet, as the React demo already does.

### Counts and dates

- Registry sizes, the files that use each control and the hooks each item imports were counted
  from the source with scripts.
- npm, 2026-11-25: Solid 2.0.0 was published on 2026-11-17. Peer ranges: `@kobalte/core` 0.13.14
  `solid-js ^1.9.8`; `corvu` 0.7.2 `^1.8`; `@tanstack/solid-virtual` 3.13.55 `^1.3.0`;
  `lucide-solid` 1.80.0 `^1.4.7`; `@ark-ui/solid` 5.40.1 `>=1.6.0`. `@tanstack/virtual-core`
  3.19.13 has no peers. `@ui-sdk/solid` asks for `solid-js ^2.0.0`.
- The claims about Base UI features and their ui-sdk counterparts in point 5 come from reading
  the docs shipped in `node_modules/@ui-sdk/react/docs` and `node_modules/@ui-sdk/solid/docs`.
  Only the dialog, the select, the button and the tooltip were run.
