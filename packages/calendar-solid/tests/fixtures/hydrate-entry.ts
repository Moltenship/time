// The page's side of the server tests: loaded through the hydration harness, so `@solidjs/web` is
// the browser build here while the test that imports the harness renders with the server build.

import { createComponent, hydrate, isServer } from "@solidjs/web";
import type { CalendarFocus } from "@moltenship/calendar-core";
import type { CalendarStateSource } from "@moltenship/calendar-primitives";
import { createSignal, flush } from "solid-js";

import { createTestStore } from "../harness/store";
import { RatingApp } from "./rating-app";
import { review } from "./calendar";
import { createRecordedHistory, createTestClock, InteractionApp } from "./interaction-app";
import { CalendarApp, createMeetingSource, LabelApp, standup } from "./server-apps";

export { isServer };

export function hydrateRating(container: Element, defaultValue: number): () => void {
  return hydrate(() => createComponent(RatingApp, { defaultValue }), container);
}

export function hydrateLabel(container: Element) {
  const store = createTestStore({ label: "client" }, { label: "server" });
  const dispose = hydrate(() => createComponent(LabelApp, { store }), container);
  return { dispose, flush, store };
}

/** Hydrates with a store that has no server snapshot, then hands the label another that has one. */
export function hydrateLabelSwap(container: Element) {
  const [store, setStore] = createSignal<CalendarStateSource<{ readonly label: string }>>(
    createTestStore({ label: "plain" }),
  );
  const dispose = hydrate(
    () =>
      createComponent(LabelApp, {
        get store() {
          return store();
        },
      }),
    container,
  );
  return {
    dispose,
    swap: () => setStore(createTestStore({ label: "client" }, { label: "server" })),
  };
}

export function hydrateCalendar(container: Element) {
  const events = createMeetingSource([review], [review, standup]);
  const dispose = hydrate(() => createComponent(CalendarApp, { events }), container);
  return { dispose, events };
}

/** Hydrates the keyboard fixture and its probes with the page's own clock and history. */
export function hydrateInteraction(
  container: Element,
  options: { readonly clock?: string; readonly defaultFocus?: CalendarFocus | null } = {},
) {
  const clock = options.clock === undefined ? undefined : createTestClock(options.clock);
  const history = createRecordedHistory();
  const dispose = hydrate(
    () =>
      createComponent(InteractionApp, {
        clock,
        defaultFocus: options.defaultFocus,
        history,
      }),
    container,
  );
  return { clock, dispose, flush, history };
}
