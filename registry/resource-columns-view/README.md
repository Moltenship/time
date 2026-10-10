# Resource columns view

A day or N-day time grid with a column per resource, built on the week and day views'
`registry/time-grid-view` pieces.

- Resource headers are grouped by the resource hierarchy: an expanded group's band names it over
  its columns, and its chevron collapses them.
- Only the columns in view render (TanStack Virtual), so hundreds of resources scroll smoothly.
  Columns share the width until they reach 128px per day, then the grid scrolls sideways.
- The header and the hour gutter sit beside the scrolling body rather than over it and follow its
  scroll, so a drag never targets a column hidden under them.
