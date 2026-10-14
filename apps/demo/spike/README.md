# Motion customization spike (not for merge)

Throwaway code for `docs/internal/research/motion.md`: can an app animate the calendar with Motion
or View Transitions through the hooks it has? `motion@14.2.0` is added to the demo and the
registry. `?spike=` picks an experiment, and `?slow=N` stretches its durations:

- `card-vt`: the clicked event morphs into its popover with a same-document view transition.
- `card-motion`: the popover grows out of the clicked event with Motion's `animate` (a FLIP).
- `card-layoutid`: the chip and its title share `layoutId`s with the anchored popover.
- `card-dialog`: the same, into a centered dialog.
- `drag-css`: the drag preview lifts and tilts, through `[data-calendar-ghost]` CSS alone.
- `drag-motion`: a Motion card follows each drag on a spring, through `monitorCalendarDrags`.

```sh
cd apps/demo && vp build && vp preview --port 5917 --strictPort &
node apps/demo/spike/capture.mjs http://localhost:5917/ /tmp/out
```
