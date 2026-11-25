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

`month-page.tsx` is the Month page's calendar and page, after `shadcn add` of the Solid month. The
install test copies it into the same app, beside `calendar-page.tsx`. So it does `undo-toast.tsx`,
Undo and redo's undo toast on that month.

`recurrence.tsx` is the calendar of Show and edit recurring events, on
`@moltenship/calendar-recurrence`. The install test leaves it out, since its clean app doesn't
install that package; `calendar-page.tsx` covers the dialog's install there.

`own-button.tsx` is the Controls page's own button, an app's `components/calendar/ui/button.tsx`
in place of the kit's. It checks below its region that it takes every prop of the kit's button.

A Solid page takes its TypeScript from here and writes none inline, which
`tests/solid-docs.test.ts` checks.

`live/` holds no samples either. It is the build of the live examples: one page that runs a
sample inside the iframe a Solid page shows with `<SolidExample>`. Each `<name>.example.tsx` there
names a sample and its stylesheet. `docs/internal/solid-examples.md` says how to add one.

`mount/` holds no samples. It is a test project of the root's `vp test`, with Solid's Vite plugin,
that mounts the quick start through `main.tsx` and checks it renders a calendar that navigates.
The docs site's own tests compile JSX for React, so they leave this folder out.
