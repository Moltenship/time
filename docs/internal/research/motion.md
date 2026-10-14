# Research: animating the calendar with Motion from the app

Can an app built on the calendar bring [Motion](https://motion.dev) (formerly Framer Motion), or the
browser's View Transitions, for effects like these?
- A clicked event expands into its popover or a dialog, with its title flying into the heading.
- A drag lifts the event, lets it trail the pointer on a spring, and lands it in its new slot.

This is research, not a plan. It covers what the app can hook into today, a spike that tries each
effect in the demo, what doesn't work, and the small hooks the library could add. Motion 14.2.0,
code as of `b3e5f53`. The spike is on the unmerged branch
[`spike/motion-customization`](https://github.com/Moltenship/time/tree/spike/motion-customization).

## Short answer

Yes, mostly with what exists today.

- **Event → popover or dialog.** The app owns that UI: views render each event as a
  `[data-event-id]` button, and the app opens details from a delegated click, which hands it the
  element. Three approaches worked in the spike:
  - **View Transitions:** a morph from the event into the popover, title included. It costs 0
    bytes and changes nothing in the registry.
  - **A Motion FLIP:** the popover grows out of the event with a spring. It changes nothing in
    the registry.
  - **Motion `layoutId`:** the event becomes a centered dialog, its title flies into the heading,
    and it collapses back on close. This needs the copied `EventChip` and the title to be Motion
    components (two registry files), plus a `LayoutGroup`.

  `layoutId` into the *anchored* Base UI popover didn't work (see
  [below](#what-doesnt-work-or-is-awkward)).
- **Drag.** Two approaches worked:
  - **CSS lift:** a lift and tilt on pickup, with CSS on `[data-calendar-ghost]`, 0 bytes.
  - **A Motion card:** a card that follows the pointer on a spring, tilts with velocity and lands
    in the new slot. It uses `monitorCalendarDrags` alone, with the calendar's own preview
    restyled as a landing slot.
- **Focus.** In every card experiment, focus moved into the popup on open and back to the event on
  close. Nothing waited on an animation.

## What the app can hook into

| Hook | What it gives | Where |
| --- | --- | --- |
| `[data-event-id]` buttons and a delegated click | The clicked element: a FLIP origin, or the element to name for a view transition | Views; `registry/README.md` |
| `EventChip` | One component every view renders events with, so `motion.button` goes in one place | `registry/calendar/event-chip.tsx` |
| Base UI's `render` prop | `render={<motion.div …/>}` on any popup, dialog or popover part | `registry/ui/*`, the app's own popups |
| `[data-calendar-ghost="event" \| "range"]` with `data-invalid`, `data-warning` and `data-outside` | Styling for the drag preview | `calendar-dnd` |
| `--calendar-ghost-*` custom properties | Background, radius, shadow, opacity and z-index of the preview | `calendar-dnd`, the theme |
| `data-dragging`, `data-grabbed`, `data-pending`, `data-interaction` | The source chip during a drag, a keyboard move, a pending save, and the view during a gesture | `calendar-dnd`, the registry |
| `monitorCalendarDrags(drag => follower)` | `element`, `event` and `origin` when a move starts, then `move(point)` per pointer move and `end(dropped)` | `@moltenship/calendar` |
| `onPreview` / `useCalendarInteraction` | The snapped placement a drop would make | `calendar-dnd`, `calendar-react` |

Reduced motion: the theme's `@media (prefers-reduced-motion: reduce)` block already turns
`::view-transition-group(*)` animations off. Motion's default is `reducedMotion="never"`, so an app
should wrap its tree in `MotionConfig reducedMotion="user"`
([MotionConfig](https://motion.dev/docs/react-motion-config)).

## Spike

**Setup.** The demo, with `motion@14.2.0`, ran in headless Chromium 156 through Playwright. Each
experiment had frames captured at 6× slow motion, and a video at real speed.

**Bytes.** Gzip is for the Motion API each experiment uses, measured with esbuild, minified,
gzip -9, React external:
- `motion.div` with layout: 44.2 KiB;
- `m` + `LazyMotion` + `domAnimation`: 30.4 KiB;
- hybrid `animate`: 23.7 KiB;
- mini `animate`: 3.3 KiB.

| Experiment | Effect | Changes outside the app | Result | Gzip |
| --- | --- | --- | --- | ---: |
| `card-vt` | The event morphs into its anchored popover, title too | None. The app names the clicked element and its title, then the popup, inside `document.startViewTransition` | Works | 0 |
| `card-motion` | The popover grows out of the event on a spring, and its content fades in | None. Motion's `animate` runs from the popup's ref | Works | 23.7 KiB (3.3 with mini `animate` and `transform` strings) |
| `card-layoutid` | The event and its title share `layoutId`s with the anchored popover | `EventChip` and the time grid's title made Motion components; a `LayoutGroup` | **Fails** | 44 KiB |
| `card-dialog` | The event becomes a centered dialog, the title flies into the heading, and it collapses back on close | Same as `card-layoutid` | Works | 44 KiB |
| `drag-css` | The preview lifts (`scale: 1.05`) and tilts (`rotate: -2deg`) when picked up | None. CSS on `[data-calendar-ghost="event"]` with `@starting-style` | Works | 0 |
| `drag-motion` | A card trails the pointer on a spring and tilts with velocity; the preview becomes a dashed landing slot; the card lands in the new slot, or back after Escape | None. `monitorCalendarDrags`, plus CSS on the preview | Works | 44 KiB |

**Notes per experiment:**

- **`card-vt`.**
  - The update callback waits a task, because Base UI positions the popover after it mounts.
  - The snapshots stretch during the morph, the browser's default crossfade, so text distorts a
    little.
  - Pointer input goes to the transition while it runs
    ([spec](https://drafts.csswg.org/css-view-transitions-1/)). That's fine for opening a popover.
- **`card-motion`.**
  - Base UI mounts the popover through a portal a render after the click, and positions it a frame
    later. So the animation starts from a callback ref, after two frames.
  - The content fades in late, so the scale doesn't squash the text.
- **`card-layoutid`, the failure.**
  - The popover first mounts unpositioned at (0, 0). Base UI then moves it with a `transform` on its
    positioner.
  - Motion measures the popup at mount. Without `layoutDependency`, the popover's re-renders
    (positioning, the focus move) cut the morph off after about 100 ms. With it, the morph
    started and ended in the wrong places.
- **`card-dialog`.**
  - A centered dialog is where it ends up from its first frame, so the shared layout works. That's
    Motion's own "expanding card" pattern
    ([layout animations](https://motion.dev/docs/react-layout-animations)).
  - The chip doesn't re-render when the dialog opens, so Motion had no snapshot of it until a
    `LayoutGroup` wrapped the tree.
  - On close, the chip morphs back from the dialog's box. Its text stretches unless the chip's
    children get `layout` too.
- **`drag-css`.**
  - The pointer layer writes `transform: translate3d(…)` on the preview. CSS's own `scale`,
    `rotate` and `translate` properties compose with it, so they never conflict.
  - The theme already turns off a transition on `[data-calendar-ghost]` under reduced motion.
- **`drag-motion`.**
  - The follower gets the pointer, not the snapped slot. So the card's time label stays the old
    one, while the calendar's preview shows the new time.
  - `end` comes before the view re-renders, so the card waits two frames, then flies to the event's
    new box.
  - The move landed and saved normally.

## What doesn't work or is awkward

- **`layoutId` into an anchored popover.** Use a view transition, a manual FLIP or a dialog
  instead. Or delay mounting the Motion element until Base UI has positioned the popover.
- **There is no seam for a Motion chip.** Views don't take an event component. Making chips
  `motion.button` means editing the copied `event-chip.tsx`, the shadcn way, and each view's title
  span for a title morph. Titles have no `data-slot`, so a view transition has to find them by
  class.
- **`layout` or `layoutId` on every chip costs.** In an earlier spike (#246), with 254 chips, Motion chips
  made week navigation 32 ms slower at 4× CPU throttling, with nothing animating. Their layout
  animations made a reflow 40–56 ms slower.
  - It's better to give a `layoutId` only to the chip being opened.
  - That chip must re-render when it gets the ID, or Motion has no snapshot.
- **Motion can't animate the preview's `transform`.** The pointer layer owns it. Use CSS's
  independent `scale`, `rotate` and `translate`, or replace the preview with your own card through
  the monitor.
- **The drag monitor is thin.** `move` gets only the point. There's no snapped rect, time label or
  validity, and resizes and creates aren't offered.
- **A drop animated with `layout` starts from the old slot.** It doesn't start from where the
  pointer let go, so the event jumps back and travels again (#246). Land from the
  pointer's position instead, as `drag-motion` does.

## Hooks the library could add, if wanted

All small, and none ties the packages to Motion:

1. **`data-slot` on the chip's parts.** For example, `calendar-event-title` and
   `calendar-event-time`, so a view transition or a FLIP can target the title without edits.
2. **A seam for the chip.** A view option or context that renders events through the app's
   component, such as `motion.button`, without editing six views. Or document that editing
   `event-chip.tsx` is the seam.
3. **A richer drag monitor.**
   - Report the snapped preview with each move: rects, label and validity.
   - Offer resizes and creates.
   - Report the drop's outcome in `end`.
4. **A preview escape hatch.** Views could forward `ghostClassName`, or the layer could take a
   `renderPreview` that lets the app draw the preview itself. The layer would keep hit testing,
   snapping, auto-scroll and announcements.
5. **Docs recipes for the effects above.** Each with its reduced-motion setting.
