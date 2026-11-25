# The samples in Solid's docs

The Solid pages of the docs (`content/docs/**/*.solid.mdx` and the `<Solid>` blocks of shared
pages) show these files, with `<include>` and the `#region` each file marks. This folder has its
own `tsconfig.json`, which compiles JSX for Solid, so `vp check` type-checks the samples against
`@moltenship/calendar-solid`. The site, a React app, never imports them: its own `tsconfig.json`
leaves the folder out.

The files import each other the way a reader's app would: `app.tsx` renders the calendar that
`calendar.tsx` creates, and `main.tsx` mounts it.

A Solid page takes its TypeScript from here and writes none inline, which
`tests/solid-docs.test.ts` checks.
