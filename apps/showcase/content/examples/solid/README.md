# The samples in Solid's docs

The Solid pages of the docs (`content/docs/**/*.solid.mdx` and the `<Solid>` blocks of shared
pages) show these files, with `<include>` and the `#region` each file marks. This folder has its
own `tsconfig.json`, which compiles JSX for Solid, so `vp check` type-checks the samples against
`@moltenship/calendar-solid`. The site, a React app, never imports them: its own `tsconfig.json`
leaves the folder out.

The files import each other the way a reader's app would: `app.tsx` renders the calendar that
`calendar.tsx` creates, and `main.tsx` mounts it.

`calendar-page.tsx`, `app.css` and `components.json` are what Installation's "UI source" steps
have a reader write for the Solid registry. `calendar-page.tsx` imports the registry's files where
`shadcn add` puts them, `@/components/calendar/…`, which `tsconfig.json` maps to `registry/solid`
and `registry/shared`. The registry's install test (`vp run registry:e2e`) copies the three files
into a clean Solid app, so what the docs show is what it installs and builds.

`own-button.tsx` is the Controls page's own button, an app's `components/calendar/ui/button.tsx`
in place of the kit's. It checks below its region that it takes every prop of the kit's button.

A Solid page takes its TypeScript from here and writes none inline, which
`tests/solid-docs.test.ts` checks.

`mount/` holds no samples. It is a test project of the root's `vp test`, with Solid's Vite plugin,
that mounts the quick start through `main.tsx` and checks it renders a calendar that navigates.
The docs site's own tests compile JSX for React, so they leave this folder out.
