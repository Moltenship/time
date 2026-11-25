# Live examples in Solid's docs

The docs site renders React, so a Solid sample runs in a page of its own, inside an iframe. The
samples in `apps/showcase/content/examples/solid` are built into one static page,
`public/examples/solid/index.html`, which shows the example its `?example=<name>` names. The build
is `node --run examples` in `apps/showcase` (`vp build content/examples/solid/live`). The app's
`dev` and `build` scripts run it, and so does the release gate's copy of the site
(`tools/release/src/artifacts.ts`). The output is not committed.

## Add an example

A step that adds a view adds its example in the same PR:

1. Write the sample in `content/examples/solid/`, as for any Solid page, and `<include>` it on the
   page. It must fill its container: the frame has a fixed height, and a page taller than the frame
   scrolls inside it.
2. Add `content/examples/solid/live/<name>.example.tsx`. It imports `./registry.css` (Tailwind and
   the registry's theme) or `./plain.css` (the browser's own styles), and exports the sample as its
   default:

   ```tsx
   import "./registry.css";

   export { MonthPage as default } from "../month-page";
   ```

3. Show it on the view's page, in Solid's set alone (`page.solid.mdx`):

   ```mdx
   <SolidExample name="month" title="The month view" size="h-[34rem]" caption="Live. Drag an event to another day." />
   ```

   `title` is the frame's accessible name, and `size` is its height, set before the example loads
   so the page doesn't move. Pick a height the example fills at the docs' column width, about
   660 px, and on a phone.

4. Run `node --run examples` in `apps/showcase`, then look at the page with `node --run dev` in
   light and dark.

`tests/solid-examples.test.tsx` fails for an example without an entry, an entry no page shows and a
frame without a title. `scripts/verify-production.mjs` asks the built site for every example a page
frames.

## How it follows the theme

`live/index.html` copies the `dark` class of the docs page's root before first paint, and again
whenever it changes. Opened on its own, it follows the system's theme. `live/registry.css` sets the
docs' accent on `--calendar-today`, as the React previews do.

## What the build resolves

`live/vite.config.ts` compiles the Solid registry's source through the samples' `tsconfig.json`
paths. In the release gate the site is copied out of the workspace with `registry` beside it, and
`registry/solid` has no `node_modules` there, so the config resolves Solid, ui-sdk and the
calendar package from the docs app (`resolve.dedupe`). A package the Solid registry starts to
import goes into `apps/showcase/package.json` and that list. Nothing in the folder may import from
outside `apps/showcase` and `registry` (`tools/release/tests/reach.test.ts`).
