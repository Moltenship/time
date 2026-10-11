# Resource columns view

A day or N-day time grid with a column per resource, built on the week and day views'
`registry/time-grid-view` pieces.

- Resource headers are grouped by the resource hierarchy: an expanded group's band names it over
  its columns, and its chevron collapses them.
- `ResourceHeader` replaces each header's name row with your composition of the
  `resource-header.tsx` parts, such as an avatar before a person's name and an icon before a
  room's. The bands, sizes and screen-reader names stay with the view.
- Only the columns in view render (TanStack Virtual), so hundreds of resources scroll smoothly.
  Columns share the width until they reach 128px per day, then the grid scrolls sideways.
- The header and the hour gutter sit beside the scrolling body rather than over it and follow its
  scroll, so a drag never targets a column hidden under them.
- Overlapping events follow `overlapLayout` and `stackIndent`, as in the week and day views.
