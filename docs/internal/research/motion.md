# Research: animation and Motion

How should the calendar animate, and should it use [Motion](https://motion.dev) (formerly Framer
Motion)? This note answers with the code as of `62b24df` (after #240), Motion 14.2.0 (npm, published
2026-10-13), a spike in the demo, and web research. It is a decision aid for the owner. Nothing here
is implemented beyond the spike, which lives on the unmerged branch
[`spike/motion-integration`](https://github.com/Moltenship/time/tree/spike/motion-integration).

## Recommendation

**CSS by default, a few data attributes from the packages, and Motion as a documented recipe, not
a dependency** (option d, with a thin c).

- Most of what a calendar user does is frequent, direct manipulation: dragging, resizing, paging
  weeks, keyboard moves. Those should not animate. The few places where motion helps are
  popovers, dialogs, sheets and the undo toast, which CSS already animates, plus three gaps:
  - feedback during the touch long-press;
  - an event sliding back when a drop is rejected or its save fails;
  - an optional cue for the event an undo or redo changed.
- Motion's React layer costs 30–46 KiB gzip per app (measured below). That is more than the whole
  `calendar-react` budget (24 KiB). Its layout animations made the spike's reflow slower and its
  drops look wrong, and they made navigation slower even when nothing animated.
- View Transitions block pointer input while they run. In the spike, three quick clicks on "Next"
  moved one week instead of three. With a name on every event, a reflow froze a frame for 1.3 s at
  4× CPU throttling.
- The packages expose state as data attributes, so any app can bring Motion, View Transitions or
  plain CSS on top. The registry, which the app owns, stays free of a Motion dependency.

| Candidate | Verdict | With what |
| --- | --- | --- |
| Events entering and leaving | Don't animate | — (one-shot highlight after undo/redo, optional) |
| Reflow when overlaps change | Don't animate | — |
| Drag preview | Don't animate (follows the pointer) | — |
| Drop settle | Don't animate (the preview is already at the slot) | — |
| Drop revert (rejected or failed save) | Animate | WAAPI FLIP, 150–200 ms |
| Resize | Don't animate | — |
| Prev/next, Today, keyboard paging | Don't animate | — |
| View switch (week ↔ month ↔ day) | Don't animate by default | Opt-in View Transition recipe, mouse only |
| Popovers, dialogs, sheets | Animate (already) | CSS: Base UI attributes + tw-animate-css |
| Undo toast | Animate (already) | CSS transition |
| Now-line | Don't animate | — |
| Agenda list | Don't animate rows | — (the loading spinner stays) |
| Touch long-press feedback (#218) | Animate | CSS on a new `data-pressing` attribute |

## What the calendar animates today

- **Popovers, dialogs, sheets and tooltips** use tw-animate-css classes on Base UI's `data-open`,
  `data-closed`, `data-starting-style` and `data-ending-style`. They take 100–200 ms
  (`registry/ui/popover.tsx`, `dialog.tsx`, `sheet.tsx` and `tooltip.tsx`).
- **The undo toast** fades and rises 8 px over 200 ms through `data-starting-style` and
  `data-ending-style`, with `motion-reduce:transition-none`
  (`registry/calendar-history-toast/calendar-history-toast.tsx`).
- **Small state changes:** chevrons rotate, event chips transition `filter` and `box-shadow` on
  hover, and the resize handle's grip fades in.
- **Scrolling views and the year view** scroll smoothly to a new range, and jump instead when the
  user prefers reduced motion (`registry/calendar/scrolling-axis.tsx`,
  `registry/year-view/year-view.tsx`).
- **The reduced-motion block in `calendar-theme.css`** removes zoom, slide and translate from the
  tw-animate-css utilities, and a slide from sheets. It also takes the transition off
  `[data-calendar-ghost]` and the animation off `::view-transition-group(*)`. So the theme already
  expects apps to add a ghost glide or a view transition of their own.
  `tools/a11y/tests/reduced-motion.a11y.tsx` tests each case in Chromium.
- **The rules.** `architecture.md` §16 says "Motion respects `prefers-reduced-motion` and never
  obscures state changes", and that data attributes support plain CSS customization.

Nothing in `packages/` animates. `calendar-dnd` moves the drag preview with
`style.transform = translate3d(…)` on fixed-position clones, with no React render during a drag
(`packages/calendar-dnd/src/ghost.ts`). Event chips sit at absolute `top`, `height`,
`inset-inline-start` and `width` in percent, keyed by event ID within their day column
(`registry/time-grid-view/time-grid-event.tsx`). Moving an event to another day remounts its chip
in another column.

## Findings per candidate

### Events entering and leaving

Events appear and disappear for many reasons:
- a drag-create or the dialog;
- a delete, or an undo or redo;
- a calendar toggled on or off;
- a sync from the app's store;
- paging to another week, which mounts every chip again.

Only the first two are the user's own action on one event, and there the drag preview or the
dialog already shows where the event goes.

- **Enter** animations keyed on mount (`@starting-style`, `AnimatePresence initial`) fire for every
  chip on every navigation, and on the server-rendered first paint unless suppressed. Telling a
  "new" event from a remounted one needs state the app has, not the view.
- **Exit** animations keep a removed node in the DOM. Motion doesn't document what happens to focus
  or the accessibility tree on an exiting node ([AnimatePresence](https://motion.dev/docs/react-animate-presence),
  [accessibility](https://motion.dev/docs/react-accessibility)), so an exiting chip would stay
  focusable and announced until it unmounts. Our roving focus would have to skip it.
- Bulk changes, such as a calendar toggle or a sync, animate hundreds of chips for no gain.

**Verdict:** don't animate. A deleted event is confirmed by the announcement and, where the app
uses it, the undo toast. An optional follow-up is a one-shot highlight of the event an undo or redo
changed: a `data-changed` attribute for one render, and a colour pulse in CSS. A colour change
isn't motion under WCAG 2.3.3 ([Understanding 2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)).

### Reflow when overlaps change

This is the case layout animations (FLIP) exist for. The spike put Motion's `layout` on every
time-grid chip (numbers [below](#spike-results)). It made the reflow's interaction 23–32 % slower
at 4× CPU, and between 122 and 148 of the 254 chips moved at once. A calendar toggle or a sync
shifts most of a week's chips together, so the eye has nothing to follow.

With `layout` (size and position), 82–112 chips were scaled by more than 5 % mid-animation, down to
0.75, which squashes their text. Motion corrects this only for children that are also `layout`
components ([layout animations](https://motion.dev/docs/react-layout-animations)), which multiplies
the measured nodes. `layout="position"` avoids the distortion, but then the width snaps while the
position glides. `layoutDependency`, keyed on each chip's geometry, didn't help either.

The View Transitions alternative is worse. With `view-transition-name: match-element` on every
chip, a reflow froze a frame for 183 ms at 1× and 1.3 s at 4×. It ran 919 animations, since each
named element gets a group, an image pair and two images. In Firefox and Safari, without nested
groups, the snapshots also escape the time grid's scroll clipping
([nested groups](https://developer.chrome.com/docs/css-ui/view-transitions/nested-view-transition-groups),
[caniuse](https://caniuse.com/mdn-css_properties_view-transition-group)).

**Verdict:** don't animate.
- Bryntum and AG Grid do animate row and event moves. AG Grid uses CSS transitions on `transform`
  and `top` ([row animation](https://www.ag-grid.com/javascript-data-grid/row-animation/)).
- Both stop during gestures. Bryntum turns event animation off during drag-create and resize (a
  third-party copy of
  [its source](https://github.com/BernardUriza/free-intelligence/blob/254239e5496625b685121b98d15dc3083e70630d/apps/aurity/public/js/bryntum/modules/50-scheduler-base.js)),
  and AG Grid while the user resizes a row (`gridBodyCtrl.ts` in
  [ag-grid](https://github.com/ag-grid/ag-grid)).
- Schedule-X users ask to turn animations off for large event volumes
  ([#1204](https://github.com/schedule-x/schedule-x/issues/1204)).

### Drag preview, drop settle and revert

- **The preview** follows the pointer through `translate3d`, with no tween. That's right for direct
  manipulation. The pointer layer writes `style.transform` on its own clones, so Motion never
  touches those nodes.
  - Motion's `layout` does own `style.transform` on the elements it animates. It resets it to
    measure, and resets ancestors' transforms too
    ([HTMLProjectionNode](https://github.com/motiondivision/motion/blob/main/packages/motion-dom/src/projection/node/HTMLProjectionNode.ts)).
  - It can't see a transform applied to an ancestor outside Motion
    ([drag docs](https://motion.dev/docs/react-drag)).
  - The two coexist only because the ghost is a separate node. Motion's `drag` would replace our
    pointer layer, not complement it.
- **The drop needs no positional settle.** The time grid's preview snaps to slots, so at release it
  already sits where the event lands. In the spike, the chip appeared at the ghost's top (348 px)
  in the first frame after the drop.
  - With Motion's `layout`, the chip instead appeared at its **old** slot (228 px) and slid
    120 px to 348 over about 230 ms. The event seemed to jump back and travel again.
  - A layout animation measures the chip's previous box, not the preview's. A correct settle
    would need the preview's last rect as its "first" frame, and here that equals the final rect
    anyway.
- **The revert does need motion.** Two cases end with the event back at its origin:
  - A drop the policies reject never moves the event. The preview, outlined as invalid, vanishes
    at the rejected slot, and the chip is still at its origin.
  - A save that fails (#199's optimistic path) moves the pending chip back to its origin after the
    app's delay: 600 ms in the demo, where the chip jumps.

  A 150–200 ms slide from where the event was last shown back to where it is tells the user what
  happened. That's the preview's last rect for a rejection, and the pending chip's rect for a
  failed save. The announcement still fires at the state change.
  - FullCalendar's one built-in animation is exactly this: `dragRevertDuration`, 500 ms by default
    ([docs](https://v7.fullcalendar.io/dragRevertDuration)).
  - It's a FLIP on one element. WAAPI does it in a few lines and 0 bytes: `element.animate` with
    `transform`, then let it finish
    ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Element/animate)).
  - For a rejection, `calendar-dnd` has to hand over the preview's last rect, since it clears the
    preview when the gesture ends.
- **The optional ghost glide.** `transition: transform 60–80ms` on `[data-calendar-ghost]` makes the
  preview glide between snapped slots. It trades crispness for lag in a gesture that should feel
  direct. Keep it out of the defaults. The theme already removes it under reduced motion for apps
  that add it.

**Verdict:**
- preview: no tween;
- drop: no animation;
- revert: WAAPI FLIP in the registry, driven by a signal from the packages (see the
  [plan](#phased-plan));
- glide: an app's choice.

### Resize

It's direct manipulation, just like the preview. The edge follows the pointer and snaps;
animating the snap lags the hand. **Don't animate.**

### View changes and navigation

- **Prev/next, Today and keyboard paging are the most frequent actions in a calendar.**
  - Apple's HIG says to "generally avoid adding motion to UI interactions that occur frequently"
    ([HIG](https://developer.apple.com/design/human-interface-guidelines/motion)).
  - Emil Kowalski says keyboard-initiated actions should never animate
    ([You don't need animations](https://emilkowal.ski/ui/you-dont-need-animations)).
  - FullCalendar never shipped a prev/next slide, though issues have asked since 2015 and 2017
    ([#2908](https://github.com/fullcalendar/fullcalendar/issues/2908),
    [#3666](https://github.com/fullcalendar/fullcalendar/issues/3666)).
  - Schedule-X slides weeks, and users asked to turn that off
    ([#1300](https://github.com/schedule-x/schedule-x/issues/1300),
    [#963](https://github.com/schedule-x/schedule-x/issues/963)).
- **The spike's View Transition on prev/next** showed why this is more than taste:
  - The first paint after the click is fast (40 ms), but it shows the old week.
  - The new week was captured 81 ms after the click at 1× and 243 ms at 4×. Then it slides for
    200 ms.
  - While the transition runs, pointer hit testing targets the document element
    ([spec](https://drafts.csswg.org/css-view-transitions-1/)). A probe 60 ms in hit `<html>`, not
    an event.
  - **Three clicks on "Next" 70 ms apart moved one week instead of three.** The other clicks
    landed on the transition.
  - A second `startViewTransition` skips the running one
    ([Chrome docs](https://developer.chrome.com/docs/web-platform/view-transitions/same-document)),
    so keyboard paging would cut each slide short.
- **React's `<ViewTransition>`** is stable in React 19.3
  ([blog](https://react.dev/blog/2026/09/09/react-19-3)), and so is Motion's `AnimateView` on top
  of it ([docs](https://motion.dev/docs/react-animate-view)).
  They animate only updates inside `startTransition`, Suspense reveals and `useDeferredValue`.
  - Updates from `useSyncExternalStore`, which the root reads its event source through (#200),
    can't be transitions ([useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore)).
    So store-driven changes never animate that way.
  - `AnimateView` is "not interruptible".
- **Scoped view transitions** (`element.startViewTransition`) would keep the rest of the page
  interactive and clip to the view. They're Chromium-only, since Chrome 147
  ([Chrome blog](https://developer.chrome.com/blog/element-scoped-view-transitions)).

**Verdict:**
- Prev/next, Today and keyboard paging: never animate.
- Switching views (week ↔ month ↔ day) is rarer and mouse-driven. A docs recipe can show an opt-in
  crossfade of 120–150 ms with `document.startViewTransition` and `flushSync`, behind feature
  detection. It should list the caveats: blocked input, skipped transitions, and costs that grow
  with named elements.
- Scrolling views keep their native smooth scroll.

### Popovers, dialogs and sheets

These already animate in CSS, the way Base UI recommends: transitions on `data-starting-style` and
`data-ending-style`, which reverse when interrupted
([Base UI animation](https://base-ui.com/react/handbook/animation)).
`@starting-style` is supported from Chrome 117, Firefox 129 and Safari 17.5
([caniuse](https://caniuse.com/mdn-css_at-rules_starting-style)). Base UI also waits for Motion
animations before unmounting, if an app prefers Motion. That needs `keepMounted`, the `render`
prop and a controlled `open`.

**Verdict:** keep CSS. Nothing to change; the motion policy (plan step 1) records their durations.

### Undo toast

It already fades and rises with a CSS transition and stops under reduced motion. Its announcement
is a separate live region updated when the toast is added, not when it finishes animating. **Keep
it.**

### Now-line

It moves once a minute (`useNow`, 60 s interval). At the time grid's scale that's about 1 px, so
a tween shows nothing, and a pulse would be continuous motion on screen all day
([WCAG 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)). **Don't animate.**

### Agenda list

Rows are virtualized with @tanstack/react-virtual and positioned with absolute `top`
(`registry/list-view/agenda-list.tsx`). Scrolled-out rows unmount, and layout or exit animations
need the nodes to stay. TanStack Virtual has no guidance on animating rows
([#171](https://github.com/TanStack/virtual/issues/171)). Motion fixed a leak with `motion.div` in
virtualized lists only in May 2026 ([#3241](https://github.com/motiondivision/motion/issues/3241)).
**Don't animate rows.** The loading spinner stays (`motion-safe:animate-spin`).

### Touch long-press feedback (#218)

A touch drag starts after a still 450 ms press (`LONG_PRESS_MS` in
`packages/calendar-dnd/src/attach-calendar-pointer.ts`). Until then nothing on screen changes, so
the user can't tell a press that will pick the event up from one that does nothing. Native
platforms answer with a visible "lift".

This is the one new animation with clear value. It's cheap: the pointer layer sets `data-pressing`
on the pressed element from `pointerdown` until activation or cancel. The theme then gives it:
- a slow `scale` toward 0.97 over the press;
- under reduced motion, a colour or outline change instead.

On activation, the preview can "lift" in 120 ms with the independent `scale` property and its
shadow. The pointer layer writes `transform`, and `scale` composes with it, so they don't conflict.

**Verdict:** animate in CSS, with one attribute from `calendar-dnd`.

## Motion vs the alternatives

| Need | CSS transitions and keyframes | View Transitions | WAAPI | Motion |
| --- | --- | --- | --- | --- |
| Enter and exit of overlays | Yes, with Base UI attributes; 0 B | Overkill | Possible | `AnimatePresence`, 2.3 KiB alone, but it needs `m`/`motion` (30+ KiB) |
| FLIP of one element (revert) | No | Overkill, and blocks input | Yes; 0 B | `animate` mini: 3.3 KiB |
| FLIP of many (reflow) | No | Too slow with many names | Possible, by hand | `layout`: 44 KiB; slower (spike) |
| Shared element across parents | No | `view-transition-name` | By hand | `layoutId`: 44 KiB |
| Page or view crossfade | No | Yes; 0 B; blocks input | No | `animateView`: 6.5 KiB, or `AnimateView`: 3.4 KiB, on the same API |
| Springs and interruption | Transitions retarget, but no velocity | Skip on interrupt | By hand | Yes: springs carry velocity ([transitions](https://motion.dev/docs/react-transitions)) |
| Reduced motion | `@media` in the theme (done) | `@media` in the theme (done) | Check `matchMedia` | `MotionConfig reducedMotion="user"`; the default is `"never"` ([MotionConfig](https://motion.dev/docs/react-motion-config)) |

Springs and interruption are Motion's real advantage. Every animation this note recommends is
short, one-shot and seldom interrupted, so it doesn't need them.

Motion's own docs agree on the costs:
- Re-renders "can easily take upwards of 100ms", and layout animation suits elements that are
  "isolated… `position: absolute` and very few children"
  ([performance](https://motion.dev/docs/performance)).
- `AnimateView` is meant for page-level transitions, and layout animations for interruptible
  micro-interactions ([AnimateView](https://motion.dev/docs/react-animate-view)).

### Bundle cost

Motion 14.2.0 from npm. Each entry is a small file that imports and uses one API. It's bundled with
esbuild 0.28.2, the repo's version, with `bundle`, `minify`, `format: "esm"`, React and React DOM
external, and `process.env.NODE_ENV` set to `"production"`. Sizes are the output's bytes and its
gzip at level 9; KiB is 1,024 bytes. `tools/release`'s budgets use the same gzip level.

| What the app imports | Raw KiB | Gzip KiB | Brotli KiB | Motion's docs say |
| --- | ---: | ---: | ---: | --- |
| `motion.div` (`motion/react`) | 131.4 | 44.2 | 39.6 | "34kb" |
| `motion.div` + `AnimatePresence` | 135.7 | 46.0 | 41.2 | |
| `m` + `LazyMotion` + `domAnimation` | 83.9 | 30.4 | 27.6 | 4.6 + 15 kb |
| `m` + `LazyMotion` + `domMax` (layout) | 131.7 | 44.3 | 39.6 | 4.6 + 25 kb |
| `domMax` + `AnimatePresence` + `LayoutGroup` + `MotionConfig` | 137.4 | 46.5 | 41.6 | |
| `m` alone, no features | 12.9 | 5.3 | 4.8 | 4.6 kb |
| `AnimatePresence` alone | 5.0 | 2.3 | 2.0 | |
| `useAnimate` (`motion/react-mini`) | 8.6 | 3.4 | 3.2 | 2.3 kb |
| `useAnimate` (hybrid, `motion/react`) | 64.2 | 24.1 | 21.9 | 17 kb |
| `animate` (`motion/mini`) | 8.3 | 3.3 | 3.0 | 2.3 kb |
| `animate` (mini) + `spring` | 12.3 | 5.0 | 4.6 | |
| `animate` (hybrid, `motion`) | 63.1 | 23.7 | 21.5 | 18 kb |
| `animateLayout` (vanilla layout, 14.1+) | 101.5 | 34.1 | 30.8 | |
| `animateView` (vanilla View Transitions) | 16.7 | 6.5 | 5.9 | |
| `AnimateView` (`motion/react-animate-view`, React 19.3) | 8.2 | 3.4 | 3.1 | |
| CSS, WAAPI, the View Transitions API | 0 | 0 | 0 | |

Motion's figures come from [Reduce bundle size](https://motion.dev/docs/react-reduce-bundle-size)
and [animate](https://motion.dev/docs/animate). The docs say their figures are Rollup builds. Ours
run 15–55 % larger, but the order of magnitude is the same either way.

Two more measurements:
- **Lazy loading.** Loading `domMax` with `LazyMotion`'s async `features` gave a 2.3 KiB entry
  chunk. But esbuild put the 42.7 KiB of code shared with `m` in a chunk the entry imports
  statically, so nothing was deferred.
- **In a real build.** The demo's production build (Vite+, Rolldown) went from 212,555 to 256,883
  bytes gzip in its app chunk (+43.3 KiB, +130.2 KiB raw) with `motion.create(EventChip)` and
  `layout`.

For scale, the packages' gzip budgets (`tools/release/src/config.ts`) are:
- `calendar`: 1.5 KiB;
- `calendar-dnd`: 15 KiB;
- `calendar-react`: 24 KiB;
- `calendar-core`: 52 KiB.

On `main` at `62b24df`, `vp run release#size` reports `calendar-dnd` at 14,444 of 15,360 bytes
gzip and `calendar-react` at 23,333 of 24,576. The recommended option adds:
- no library bytes;
- a few dozen bytes to `calendar-dnd` for `data-pressing`;
- under 1 KiB of registry source for the revert FLIP, which the app owns. That's an estimate, to
  be measured in the follow-up.

## Fit with our architecture

- **The pointer layer.** No conflict as long as Motion never animates the ghost or a chip mid-drag.
  - `calendar-dnd` writes `transform` on its own fixed clones, and Motion's `layout` writes
    `transform` on the elements it animates.
  - A chip with `layout` that's also `data-dragging` would have both its reflow and the drop
    animated by Motion from the wrong origin (see [drop](#drag-preview-drop-settle-and-revert)).
  - Motion 14.1 added "layout animations inside dragged elements", but for Motion's own drag
    ([changelog](https://github.com/motiondivision/motion/blob/main/CHANGELOG.md)).
- **External stores and optimistic updates.**
  - Motion's layout animations trigger on any render that changes layout, so store updates (#200)
    and optimistic pending changes (#199) would animate too. That includes a sync, a pending
    change confirmed, and one rolled back. Only the rollback deserves it.
  - React's `<ViewTransition>` can't animate `useSyncExternalStore` updates at all.
  - Our signal for "this change was undone" is the pending-change result, so the revert animation
    should key on it, not on renders.
- **SSR, RSC and `"use client"` (#190).**
  - Motion's modules carry `"use client"`, and `motion/react-client` exists for server components
    ([installation](https://motion.dev/docs/react-installation)). The registry's entry files
    already declare their boundary, so Motion wouldn't change that.
  - CSS animations need no boundary at all, and render the same on the server.
  - Enter animations would need `initial={false}`, or `@starting-style` scoped away from first
    paint, to avoid animating every server-rendered chip on hydration.
- **Reduced motion and accessibility.**
  - Motion's default is `reducedMotion="never"`. The registry would have to wrap every view in
    `MotionConfig reducedMotion="user"`, which keeps opacity animations and drops transforms
    ([accessibility](https://motion.dev/docs/react-accessibility)).
  - Our theme's `@media (prefers-reduced-motion: reduce)` block already covers CSS and View
    Transitions, and `reduced-motion.a11y.tsx` tests it.
  - In both approaches, announcements and focus must not wait for an animation:
    - the Announcer and the toast's live region update at the state change;
    - focus moves when the DOM is ready, not on `finished`.
  - View Transitions keep captured elements in the accessibility tree and don't move focus
    ([csswg #12629](https://github.com/w3c/csswg-drafts/issues/12629)).
- **Performance.**
  - With 254 chips, Motion's layout cost 40–56 ms more per reflow at 4× CPU. Just mounting
    Motion chips cost 32 ms more per week change at 4×, with no animation running.
  - Virtualized views (agenda, year, resource rows) unmount off-screen nodes, which layout and
    exit animations rely on.
  - The CSS-only plan adds nothing to the render path. Frame budgets stay as they are.

## Integration shapes

| Shape | For | Against |
| --- | --- | --- |
| (a) Registry components use Motion | One idiom, springs, `layoutId` | Every shadcn install pulls 30–46 KiB gzip and a fast-moving major (13.0 in August, 14.0 in October 2026). The spike shows layout is a net loss here. Reduced motion has to be wired by hand. |
| (b) `@moltenship/calendar-motion` or a subpath | Opt-in, tree-shaken like the event history | A package of animations this note recommends against. It needs budgets, a `release:treeshake` entry and a Motion peer range to follow. |
| (c) The packages expose hooks and data attributes | Library-agnostic; tiny; fits "data attributes are the styling API" (`architecture.md` §16) | On its own it ships no animation. Each hook must be designed. |
| (d) CSS defaults and a Motion recipe | 0 KiB; reduced motion handled in the theme; the app owns the registry and can add Motion where it already ships it | No springs or shared-element transitions out of the box |

**Recommended: (d), with the few attributes (c) needs.** That means `data-pressing` from the pointer
layer, and a "reverted" signal from pending changes for the revert FLIP. The registry stays free of
Motion, and the docs show how to add it.

## Prior art

- **Calendars.**
  - FullCalendar animates only a failed drag's revert
    ([`dragRevertDuration`](https://v7.fullcalendar.io/dragRevertDuration)). Its view changes are
    instant ([`changeView`](https://fullcalendar.io/docs/changeView)).
  - Schedule-X slides weeks over 300 ms and fades events in at start-up. Its issues ask to turn
    both off ([#1204](https://github.com/schedule-x/schedule-x/issues/1204),
    [#963](https://github.com/schedule-x/schedule-x/issues/963),
    [#1300](https://github.com/schedule-x/schedule-x/issues/1300)).
  - Bryntum animates event changes by default, by reusing DOM elements
    ([blog](https://bryntum.com/blog/animations-animations-animations/)), and turns it off during
    drag-create and resize (see [reflow](#reflow-when-overlaps-change)).
  - Syncfusion fades the schedule in, and won't add a switch to turn layout animation off
    ([forum](https://www.syncfusion.com/forums/146753/remove-fade-in-delay-and-flash-when-loading-schedule-to-speed-things-up)).
  - We found no first-party sources for Google Calendar, Apple Calendar, Notion Calendar,
    Fantastical or Outlook.
- **Data grids.** AG Grid's `animateRows` uses CSS transitions on `transform`, `top` and `opacity`.
  It skips height on first render and turns animation off while the user resizes rows
  ([row animation](https://www.ag-grid.com/javascript-data-grid/row-animation/)).
- **Design guidance.**
  - NN/g puts UI animation at 100–500 ms, shorter for frequent actions
    ([animation duration](https://www.nngroup.com/articles/animation-duration/)).
  - Material 3's short durations run 50–200 ms, with emphasized easing `cubic-bezier(0.2, 0, 0, 1)`
    ([MotionTokens](https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/MotionTokens.kt)).
  - Apple's HIG: avoid motion on frequent interactions, don't make people wait, let them cancel
    ([HIG](https://developer.apple.com/design/human-interface-guidelines/motion)).
  - Rauno Freiberg on removing motion from core interactions: "I was moving much faster"
    ([interaction design](https://rauno.me/craft/interaction-design)).
- **Motion's recommendations.**
  - Lists: `AnimatePresence` with stable keys, plus `layout` and `mode="popLayout"`
    ([AnimatePresence](https://motion.dev/docs/react-animate-presence)).
  - Shared elements: `layoutId`, with `LayoutGroup` for siblings that don't re-render
    ([layout animations](https://motion.dev/docs/react-layout-animations)).
  - Scroll containers: `layoutScroll` on scrollable ancestors, and `layoutRoot` on fixed ones.
  - Whole-view changes: `AnimateView` or `animateView`, built on View Transitions
    ([animate-view](https://motion.dev/docs/animate-view)).

## Spike results

Branch [`spike/motion-integration`](https://github.com/Moltenship/time/tree/spike/motion-integration)
(commit `4cb550f8`, not for merge). It adds `motion@14.2.0` to the demo and the registry, and a
`?stress=300` seed: 300 overlapping events over three weeks, which put 254 chips in the current
week. `?spike=` modes:

- `layout`, `layout-position`, `layout-dep` (with `layoutDependency`) and `layoutid`: the time
  grid's chip is `motion.create(EventChip)` with a 200 ms layout animation;
- `vt-reflow`: a calendar toggle runs in `document.startViewTransition` with
  `view-transition-name: match-element` on every chip;
- `vt`: prev/next runs in `document.startViewTransition`, and the grid slides 24 px over 200 ms.

**Method.** `apps/demo/spike/measure.mjs` drives the demo's production build (`vp build`,
`vp preview`):
- **Setup:** Playwright 1.64, headless Chromium 156, 1440 × 900, on an Apple M5 Pro. It ran at 1×
  and at 4× CPU throttling (CDP `Emulation.setCPUThrottlingRate`), roughly a mid-range phone.
- **Samples:** ten per scenario; the tables give medians.
- **Interaction:** the click's Event Timing duration, from input to the next paint. The spec rounds
  it to 8 ms.
- **Processing:** the handlers' processing time.
- **Worst frame:** the longest `requestAnimationFrame` interval in the 700 ms after the click.
- **Blocking:** the summed `blockingDuration` of long animation frames.

Headless frame timing is approximate, and 1× results varied by about 16 ms between runs. Compare
the rows, not the absolute numbers.

**Reflow:** toggling the "Work" calendar off or on (about a fifth of the events leave or return,
and the rest re-lay out). Times are in ms.

| Mode | 1× interaction | 1× worst frame | 4× interaction | 4× processing | 4× worst frame | 4× blocking |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| No animation | 48 | 33 | 176 | 125 | 150 | 111 |
| Motion `layout="position"` | 64 | 33 | 216 | 165 | 183 | 144 |
| Motion `layout` | 72 | 33 | 224 | 165 | 183 | 146 |
| Motion `layout` + `layoutDependency` | 80 | 50 | 224 | 160 | 200 | 150 |
| Motion `layoutId` | 80 | 53 | 232 | 175 | 200 | 156 |
| View Transition, every chip named | 112 | 183 | 312 | 1¹ | 1,333 | 447 |

¹ The DOM update runs in the transition's callback, after the click's handlers, so Event Timing's
processing time leaves it out.

Mid-animation, at 90 ms:
- 122 chips (`position`) or 148 chips (`layout`) carried a Motion transform;
- with `layout`, 82–112 chips were scaled by more than 5 %, down to 0.75;
- the View Transition ran 919 animations at 4×.

**Navigation:** "Next period" and "Previous period" in the week view. Times are in ms.

| Mode | 1× interaction | 4× interaction | 4× processing | New week on screen | 3 clicks, 70 ms apart |
| --- | ---: | ---: | ---: | --- | --- |
| No animation | 72–88 | 280 | 220 | At the interaction's paint | 3 weeks |
| Motion chips (nothing animates) | 96 | 312 | 284 | At the interaction's paint | 3 weeks |
| View Transition slide | 40² | 40² | 2 | Captured at 81 ms (1×) or 243 ms (4×), then a 200 ms slide | **1 week** |

² The first paint after the click still shows the old week.

A hit test 60 ms into the transition found `<html>`, not the event under the point. The transition
was never skipped.

**Drop:** "Load 3" was dragged 120 px down in its column and released. The traces give the chip's
top edge in px, sampled each frame after release.

| Mode | Origin | Preview at release | Chip after release |
| --- | ---: | ---: | --- |
| No animation | 228 | 348 | 348 from the first frame |
| Motion `layout` | 228 | 348 | 228 → 238 → 315 → 338 → 346 → 348 over about 230 ms |

## Phased plan

The follow-up issue tracks these, each with "Done when". In order:

1. **Motion policy in `architecture.md` §16.** What animates, the durations (100–200 ms, emphasized
   easing), "never on frequent or keyboard actions", and announcements and focus never waiting on
   an animation. Link this note.
2. **Touch long-press feedback (#218 follow-up).** `data-pressing` from `calendar-dnd`, the press
   and lift styles in `calendar-theme.css`, and a reduced-motion variant without scale.
3. **Revert animation.** When a pointer drop is rejected, or its save fails and rolls back, the
   chip slides back over 150–200 ms with WAAPI, keyed on the pending change's result (#199). For a
   rejection, `calendar-dnd` hands over the preview's last rect. It's skipped under reduced
   motion.
4. **Docs: "Animation" guide.** What the calendar animates and why, the data attributes to hook,
   and recipes:
   - Motion for the app's own popovers and sheets, through Base UI's `render` and `keepMounted`;
   - an opt-in View Transition for view switches, with its caveats;
   - a ghost glide.
5. **Optional, the owner decides:** a one-shot highlight of the event an undo or redo changed
   (`data-changed`, a colour pulse).

Not planned: layout animation on reflow, enter and exit of events, prev/next transitions, the
now-line, agenda rows, or a Motion package.
