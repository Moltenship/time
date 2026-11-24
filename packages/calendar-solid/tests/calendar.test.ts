// @vitest-environment jsdom

import type {
  CalendarEventSource,
  CalendarFocus,
  CalendarSelection,
} from "@moltenship/calendar-core";
import { createComponent, type JSX } from "@solidjs/web";
import { createEffect, createSignal, flush, merge, untrack } from "solid-js";
import { describe, expect, expectTypeOf, test, vi } from "vite-plus/test";

import { createCalendar, createCalendarStore } from "../src";
import {
  adapter,
  Calendar,
  CalendarRoot,
  Chrome,
  review,
  rootDefaults,
  type Meeting,
  EngineCalendar,
  type RootProps,
} from "./fixtures/calendar";
import { mount, settled } from "./harness/render";
import { recoverFromRenderError } from "./setup";
import "./setup";

type View = (typeof Calendar.views)[number]["name"];

function render(
  props: RootProps = {},
  children: () => JSX.Element = () => createComponent(Chrome, {}),
) {
  const view = mount(() =>
    createComponent(
      CalendarRoot,
      // `merge` keeps getters live; `Object.assign` would read `children` here, outside the root.
      merge(props, {
        get children() {
          return children();
        },
      }),
    ),
  );
  const part = <T extends Element = HTMLElement>(name: string) =>
    view.container.querySelector<T & HTMLElement>(`[data-calendar-part='${name}']`)!;
  return { ...view, part };
}

function changeSelect(select: HTMLSelectElement, value: string) {
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("parts", () => {
  test("render the frame, toolbar, title, viewport and triggers with their names and ids", () => {
    const { container, part } = render({ id: "team" });

    const frame = part("frame");
    expect(frame.tagName).toBe("SECTION");
    expect(frame.id).toBe("team-frame");
    expect(frame.getAttribute("aria-label")).toBe("Team calendar");
    expect(frame.hasAttribute("aria-labelledby")).toBe(false);
    expect(frame.dataset.calendarInstance).toBe("team");
    expect(part("toolbar").tagName).toBe("HEADER");
    expect(part("title").id).toBe("team-title");
    expect(part("title").textContent).toBe("Week 2026-08-15");
    expect(part("viewport").id).toBe("team-viewport");
    for (const name of ["previous-trigger", "next-trigger", "today-trigger"]) {
      const trigger = part<HTMLButtonElement>(name);
      expect(trigger.type).toBe("button");
      expect(trigger.getAttribute("aria-controls")).toBe("team-viewport");
      expect(trigger.disabled).toBe(false);
    }
    expect(container.querySelector("[data-active-view]")!.textContent).toBe("week 2026-08-15");
  });

  test("without a label the frame is named by the title", () => {
    const { part } = render({ id: "team", label: undefined });

    expect(part("frame").getAttribute("aria-labelledby")).toBe("team-title");
    expect(part("frame").hasAttribute("aria-label")).toBe(false);
  });

  test("a title with children of its own shows them, and its id stays", () => {
    const { part } = render({ id: "team" }, () =>
      createComponent(Calendar.Title, { children: "Sprint 12" }),
    );

    expect(part("title").textContent).toBe("Sprint 12");
    expect(part("title").id).toBe("team-title");
  });

  test("the view switcher lists the views with their labels and shows the current one", () => {
    const { part } = render();
    const select = part<HTMLSelectElement>("view-switcher");

    expect([...select.options].map((option) => [option.value, option.text])).toEqual([
      ["week", "WEEK"],
      ["agenda", "AGENDA"],
    ]);
    expect(select.value).toBe("week");
    expect(select.options[0]!.selected).toBe(true);
  });

  test("with two copies of a part, meta's ref holds the one still rendered", async () => {
    const [first, setFirst] = createSignal(true);
    const [second, setSecond] = createSignal(true);
    let refs: ReturnType<ReturnType<typeof Calendar.useCalendarMeta>>["refs"] | undefined;
    function Probe() {
      refs = untrack(Calendar.useCalendarMeta()).refs;
      return null;
    }
    const copy = (shown: () => boolean, id: string) =>
      (() =>
        shown()
          ? createComponent(Calendar.Title, { "data-copy": id })
          : null) as unknown as JSX.Element;
    const { container } = render({}, () => [
      createComponent(Probe, {}),
      copy(first, "first"),
      copy(second, "second"),
    ]);
    const title = (id: string) => container.querySelector<HTMLElement>(`[data-copy='${id}']`);
    await settled();
    expect(refs!.title()).toBe(title("second"));

    // The copy that goes away gives the slot back to the one that stays, either way round.
    setSecond(false);
    await settled();
    expect(refs!.title()).toBe(title("first"));

    setSecond(true);
    await settled();
    setFirst(false);
    await settled();
    expect(refs!.title()).toBe(title("second"));

    setSecond(false);
    await settled();
    expect(refs!.title()).toBeUndefined();
  });

  test("an element prop passes through, and an application's ref gets the element", () => {
    let frame: HTMLElement | undefined;
    const { part } = render({}, () =>
      createComponent(Calendar.Frame, {
        class: "calendar",
        "data-testid": "frame",
        ref: (element: HTMLElement) => (frame = element),
      }),
    );

    expect(part("frame").className).toBe("calendar");
    expect(part("frame").dataset.testid).toBe("frame");
    expect(frame).toBe(part("frame"));
  });

  test("meta's refs hold the parts' elements while they are rendered", async () => {
    const [shown, setShown] = createSignal(true);
    let refs: ReturnType<ReturnType<typeof Calendar.useCalendarMeta>>["refs"] | undefined;
    function Probe() {
      refs = untrack(Calendar.useCalendarMeta()).refs;
      return null;
    }
    const { part } = render({}, () => [
      createComponent(Probe, {}),
      (() => (shown() ? createComponent(Chrome, {}) : null)) as unknown as JSX.Element,
    ]);
    await settled();

    expect(refs!.frame()).toBe(part("frame"));
    expect(refs!.title()).toBe(part("title"));
    expect(refs!.toolbar()).toBe(part("toolbar"));
    expect(refs!.viewport()).toBe(part("viewport"));

    setShown(false);
    await settled();
    expect(refs!.frame()).toBeUndefined();
  });

  test("previous and next are disabled while the view is unregistered, and the active view shows its fallback", () => {
    const { container, part } = render({ view: "year" as View }, () => [
      createComponent(Calendar.PreviousTrigger, { children: "Previous" }),
      createComponent(Calendar.NextTrigger, { children: "Next" }),
      createComponent(Calendar.TodayTrigger, { children: "Today" }),
      createComponent(Calendar.ActiveView, { fallback: "No view" }),
    ]);

    expect(part<HTMLButtonElement>("previous-trigger").disabled).toBe(true);
    expect(part<HTMLButtonElement>("next-trigger").disabled).toBe(true);
    expect(part<HTMLButtonElement>("today-trigger").disabled).toBe(false);
    expect(container.textContent).toContain("No view");
  });
});

describe("state", () => {
  test("uncontrolled, the triggers navigate and the handler hears each change with its reason", async () => {
    const changes: string[] = [];
    const { part } = render({
      onAnchorDateChange: (next, detail) =>
        changes.push(`${next.toString()} ${detail.reason} ${String(detail.controlled)}`),
    });

    part("next-trigger").click();
    await settled();
    expect(part("title").textContent).toBe("Week 2026-08-22");
    part("previous-trigger").click();
    part("previous-trigger").click();
    await settled();
    expect(part("title").textContent).toBe("Week 2026-08-08");
    part("today-trigger").click();
    await settled();
    // `now` is 2026-08-14.
    expect(part("title").textContent).toBe("Week 2026-08-14");

    expect(changes).toEqual([
      "2026-08-22 next-press false",
      "2026-08-15 previous-press false",
      "2026-08-08 previous-press false",
      "2026-08-14 today-press false",
    ]);
  });

  test("controlled, the view follows its owner, and a change it refuses shows nothing new", async () => {
    const [view, setView] = createSignal<View>("week");
    let accept = false;
    const asked: string[] = [];
    const { container, part } = render({
      get view() {
        return view();
      },
      onViewChange: (next, detail) => {
        asked.push(`${next} ${detail.reason} ${String(detail.controlled)}`);
        if (accept) setView(next);
      },
    });
    const select = part<HTMLSelectElement>("view-switcher");

    changeSelect(select, "agenda");
    await settled();
    expect(asked).toEqual(["agenda input-change true"]);
    expect(container.querySelector("[data-active-view]")!.textContent).toBe("week 2026-08-15");
    expect(select.value).toBe("week");

    accept = true;
    changeSelect(select, "agenda");
    await settled();
    expect(container.querySelector("[data-active-view]")!.textContent).toBe("agenda 2026-08-15");
    expect(select.value).toBe("agenda");

    // The owner moves on its own.
    setView("week");
    await settled();
    expect(container.querySelector("[data-active-view]")!.textContent).toBe("week 2026-08-15");
    expect(select.value).toBe("week");
  });

  test("an owner that takes the view after an await shows the view on screen until then", async () => {
    const [view, setView] = createSignal<View>("week");
    let accepted: Promise<void> | undefined;
    const { container, part } = render({
      get view() {
        return view();
      },
      onViewChange: (next) => {
        accepted = (async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          setView(next);
        })();
      },
    });
    const select = part<HTMLSelectElement>("view-switcher");
    const shown = () =>
      `${select.value} ${container.querySelector("[data-active-view]")!.textContent}`;

    changeSelect(select, "agenda");
    await settled();
    // As React's controlled select does: the switcher names the view the calendar shows.
    expect(shown()).toBe("week week 2026-08-15");

    await accepted;
    await settled();
    expect(shown()).toBe("agenda agenda 2026-08-15");
  });

  test("after its owner takes a new view, the triggers still navigate", async () => {
    const [view, setView] = createSignal<View>("week");
    const { part } = render({
      get view() {
        return view();
      },
      onViewChange: (next) => setView(next),
    });

    changeSelect(part<HTMLSelectElement>("view-switcher"), "agenda");
    await settled();
    part("next-trigger").click();
    await settled();

    expect(part("title").textContent).toBe("Agenda 2026-08-16");
  });

  test("a handler's cancel() keeps an uncontrolled slice as it was", async () => {
    const { container, part } = render({
      onViewChange: (_next, detail) => detail.cancel(),
    });
    const select = part<HTMLSelectElement>("view-switcher");

    changeSelect(select, "agenda");
    await settled();

    expect(container.querySelector("[data-active-view]")!.textContent).toBe("week 2026-08-15");
    expect(select.value).toBe("week");
  });

  test("the element's own handler runs first and can keep the view with preventDefault()", async () => {
    const seen: string[] = [];
    const { container, part } = render({}, () => [
      createComponent(Calendar.ViewSwitcher, {
        getViewLabel: (view: string) => view,
        onChange: (event: Event) => {
          seen.push((event.currentTarget as HTMLSelectElement).value);
          event.preventDefault();
        },
      }),
      createComponent(Calendar.ActiveView, {}),
    ]);

    changeSelect(part<HTMLSelectElement>("view-switcher"), "agenda");
    await settled();

    expect(seen).toEqual(["agenda"]);
    expect(container.querySelector("[data-active-view]")!.textContent).toBe("week 2026-08-15");
    expect(part<HTMLSelectElement>("view-switcher").value).toBe("week");
  });

  test("a controlled anchor date moves only when its owner passes the new one", async () => {
    const [anchor, setAnchor] = createSignal(Temporal.PlainDate.from("2026-08-15"));
    let accept = false;
    const { part } = render({
      get anchorDate() {
        return anchor();
      },
      onAnchorDateChange: (next) => {
        if (accept) setAnchor(next);
      },
    });

    part("next-trigger").click();
    await settled();
    expect(part("title").textContent).toBe("Week 2026-08-15");

    accept = true;
    part("next-trigger").click();
    await settled();
    expect(part("title").textContent).toBe("Week 2026-08-22");
  });

  test("the hooks read the state, a selection of it, the range and the projection", async () => {
    const reads: string[] = [];
    const handed: ReturnType<typeof Calendar.useCalendarActions>[] = [];
    function Other() {
      handed.push(Calendar.useCalendarActions());
      return null;
    }
    function Probe() {
      const state = Calendar.useCalendarState();
      const view = Calendar.useCalendarSelector((current) => current.view);
      const range = Calendar.useVisibleRange();
      const projection = Calendar.useViewProjection();
      const calendar = Calendar.useCalendar();
      handed.push(Calendar.useCalendarActions());
      expectTypeOf(view).returns.toEqualTypeOf<View>();
      createEffect(
        () =>
          `${state().anchorDate.toString()} ${view()} ${range()?.start.toString()} ${projection()?.view} ${calendar.state.view} ${calendar.meta.label}`,
        (line) => void reads.push(line),
      );
      return null;
    }
    render({}, () => [createComponent(Probe, {}), createComponent(Other, {})]);
    await settled();
    // One object for every reader of a root, so it can go in a dependency list.
    expect(handed).toHaveLength(2);
    expect(handed[0]).toBe(handed[1]);
    const actions = handed[0]!;

    actions.setView("agenda");
    await settled();
    actions.navigateNext();
    await settled();

    expect(reads).toEqual([
      "2026-08-15 week 2026-08-15 week week Team calendar",
      "2026-08-15 agenda 2026-08-15 agenda agenda Team calendar",
      "2026-08-16 agenda 2026-08-16 agenda agenda Team calendar",
    ]);
  });

  test("a selector re-runs only when its selection changes", async () => {
    let runs = 0;
    function Probe() {
      const view = Calendar.useCalendarSelector((state) => state.view);
      createEffect(view, () => void (runs += 1));
      return null;
    }
    const { part } = render({}, () => [createComponent(Probe, {}), createComponent(Chrome, {})]);
    await settled();
    expect(runs).toBe(1);

    part("next-trigger").click();
    await settled();
    expect(runs).toBe(1);

    changeSelect(part<HTMLSelectElement>("view-switcher"), "agenda");
    await settled();
    expect(runs).toBe(2);
  });

  test("a store passed to Root holds the state, and its actions run through the root's handlers", async () => {
    const store = createCalendarStore<View, CalendarSelection, CalendarFocus>({
      defaultAnchorDate: Temporal.PlainDate.from("2026-09-01"),
      defaultTimeZone: "UTC",
      defaultView: "agenda",
    });
    const heard: string[] = [];
    const view = render({
      onViewChange: (next) => void heard.push(next),
      store,
    });
    expect(view.part("title").textContent).toBe("Agenda 2026-09-01");

    store.actions.setView("week");
    await settled();
    expect(heard).toEqual(["week"]);
    expect(view.part("title").textContent).toBe("Week 2026-09-01");

    // Once the root is gone, the store's actions no longer reach its handlers.
    view.dispose();
    store.actions.setView("agenda");
    expect(heard).toEqual(["week"]);
    expect(store.getSnapshot().view).toBe("agenda");
  });

  test("store actions run through the root mounted last, however often another renders", async () => {
    const store = createCalendarStore<View, CalendarSelection, CalendarFocus>({
      defaultAnchorDate: Temporal.PlainDate.from("2026-08-15"),
      defaultTimeZone: "UTC",
      defaultView: "week",
    });
    const heard: string[] = [];
    const [events, setEvents] = createSignal<readonly Meeting[]>([review]);
    render({
      get events() {
        return events();
      },
      onViewChange: (next) => void heard.push(`first ${next}`),
      store,
    });
    render({ onViewChange: (next) => void heard.push(`second ${next}`), store });

    // The first root renders again for its own reasons; its binding stays where it was.
    setEvents([{ ...review, title: "Design review" }]);
    await settled();
    store.actions.setView("agenda");
    await settled();

    expect(heard).toEqual(["second agenda"]);
  });
});

describe("events", () => {
  test("an event source's updates reach the views, and its subscription ends with the root", async () => {
    let events: readonly Meeting[] = [review];
    const listeners = new Set<() => void>();
    const source: CalendarEventSource<Meeting> = {
      getServerSnapshot: () => events,
      getSnapshot: () => events,
      subscribe(listener) {
        listeners.add(listener);
        return () => void listeners.delete(listener);
      },
    };
    const titles: string[][] = [];
    function Probe() {
      const meta = Calendar.useCalendarMeta();
      createEffect(
        () => [...meta().eventSnapshot.events.values()].map((event) => event.title),
        (next) => void titles.push(next),
      );
      return null;
    }
    const view = render({ events: source }, () => createComponent(Probe, {}));
    await settled();
    expect(listeners.size).toBe(1);

    events = [{ ...review, title: "Design review" }];
    for (const listener of listeners) listener();
    await settled();
    expect(titles).toEqual([["Architecture review"], ["Design review"]]);

    view.dispose();
    expect(listeners.size).toBe(0);
  });

  test("pending changes show a slow save until it settles", async () => {
    let finish: (() => void) | undefined;
    const sizes: number[] = [];
    function Probe() {
      const count = Calendar.useCalendarPendingChanges((changes) => changes.size);
      createEffect(count, (size) => void sizes.push(size));
      return null;
    }
    let actions: ReturnType<typeof Calendar.useCalendarActions> | undefined;
    function Actions() {
      actions = Calendar.useCalendarActions();
      return null;
    }
    render(
      {
        onEventChange: () => new Promise<void>((resolve) => (finish = resolve)),
      },
      () => [createComponent(Probe, {}), createComponent(Actions, {})],
    );
    await settled();

    const result = actions!.proposeEventChange({
      cause: "move",
      eventId: review.id,
      proposed: {
        end: Temporal.Instant.from("2026-08-16T10:00:00Z"),
        kind: "timed",
        resourceIds: [],
        start: Temporal.Instant.from("2026-08-16T09:00:00Z"),
      },
    });
    await settled();
    expect(sizes).toEqual([0, 1]);

    finish!();
    await expect(result).resolves.toMatchObject({ status: "committed" });
    await settled();
    // Saved, but `events` doesn't show it yet: still pending until the application passes it.
    expect(sizes.at(-1)).toBe(1);
  });

  test("a switch between the engine's views renders the next view's projection", async () => {
    const container = mount(() =>
      createComponent(EngineCalendar.Root, {
        ...rootDefaults,
        defaultView: "month",
        events: [review],
        get children() {
          return [
            createComponent(EngineCalendar.ViewSwitcher, { getViewLabel: (view: string) => view }),
            createComponent(EngineCalendar.ActiveView, {}),
          ];
        },
      }),
    ).container;
    expect(container.querySelectorAll("[data-view='month'] [data-date]")).toHaveLength(42);

    changeSelect(container.querySelector("select")!, "agenda");
    await settled();

    expect(container.querySelector("[data-view='month']")).toBeNull();
    expect(container.querySelector("[data-view='agenda']")!.textContent).toBe(
      "2026-08-15 Architecture review",
    );
  });
});

describe("the factory", () => {
  test("refuses two views with one name", () => {
    expect(() =>
      createCalendar<Meeting>()({
        eventAdapter: adapter,
        views: [Calendar.views[0], Calendar.views[0]],
      }),
    ).toThrow("calendar-duplicate-view-name:week");
  });

  test("its hooks throw calendar-hook-outside-root outside its root", async () => {
    function Stray() {
      Calendar.useCalendarState();
      return null;
    }
    expect(() => mount(() => createComponent(Stray, {}))).toThrow("calendar-hook-outside-root");
    await recoverFromRenderError();
  });

  test("a calendar inside another's root reads its own", () => {
    const Other = createCalendar<Meeting>()({ eventAdapter: adapter, views: [Calendar.views[1]] });
    let inner: string | undefined;
    let outer: string | undefined;
    function Inner() {
      inner = untrack(Other.useCalendarState()).view;
      outer = untrack(Calendar.useCalendarState()).view;
      return null;
    }
    render({}, () =>
      createComponent(
        Other.Root,
        merge(rootDefaults, {
          defaultView: "agenda" as const,
          events: [],
          get children() {
            return createComponent(Inner, {});
          },
        }),
      ),
    );

    expect(inner).toBe("agenda");
    expect(outer).toBe("week");
  });
});

describe("disposal", () => {
  test("a disposed root lets go of its store, its clock and its events", async () => {
    vi.useFakeTimers();
    try {
      let samples = 0;
      const clock = {
        instant: () => {
          samples += 1;
          return Temporal.Instant.from("2026-08-14T08:00:00Z");
        },
      };
      const store = createCalendarStore<View, CalendarSelection, CalendarFocus>({
        defaultAnchorDate: Temporal.PlainDate.from("2026-08-15"),
        defaultTimeZone: "UTC",
        defaultView: "week",
      });
      // Counts the store's live subscriptions, the root's and its selectors'.
      let subscribed = 0;
      const subscribe = store.subscribe;
      vi.spyOn(store, "subscribe").mockImplementation((listener) => {
        subscribed += 1;
        const unsubscribe = subscribe(listener);
        return () => {
          subscribed -= 1;
          unsubscribe();
        };
      });
      const listeners = new Set<() => void>();
      const source: CalendarEventSource<Meeting> = {
        getServerSnapshot: () => [review],
        getSnapshot: () => [review],
        subscribe(listener) {
          listeners.add(listener);
          return () => void listeners.delete(listener);
        },
      };
      const heard: string[] = [];
      const view = render({
        clock,
        events: source,
        now: undefined,
        onViewChange: (next) => void heard.push(next),
        store,
      } as RootProps);
      flush();
      expect(listeners.size).toBe(1);
      expect(subscribed).toBeGreaterThan(0);
      vi.advanceTimersByTime(60_000);
      const sampled = samples;
      expect(sampled).toBeGreaterThan(0);

      view.dispose();
      vi.advanceTimersByTime(5 * 60_000);
      store.actions.setView("agenda");

      expect(samples).toBe(sampled);
      expect(listeners.size).toBe(0);
      expect(heard).toEqual([]);
      expect(subscribed).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
