// @vitest-environment jsdom

import type { CalendarSelection } from "@moltenship/calendar-core";
import { createComponent, type JSX } from "@solidjs/web";
import { createSignal, type Accessor } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import {
  eventIdAttributes,
  resourceIdAttributes,
  useCalendarFocus,
  useCalendarInteraction,
  useCalendarSelection,
  useNow,
  useRovingFocus,
  type CalendarEventRenderValue,
} from "../src";
import { element } from "../src/props";
import {
  allDay,
  KeyboardCalendar,
  KeyboardFixture,
  type FixtureEvent,
} from "./fixtures/interaction";
import { mount, settled } from "./harness/render";
import "./setup";

const Output = element("output");
const Span = element("span");

afterEach(() => {
  vi.useRealTimers();
});

function Text(props: { readonly name: string; readonly read: () => string }): JSX.Element {
  return createComponent(Output, {
    get [`data-${props.name}`]() {
      return "";
    },
    get children() {
      return props.read();
    },
  });
}

const text = (container: ParentNode, name: string) =>
  container.querySelector(`[data-${name}]`)?.textContent;

async function press(key: string, init: KeyboardEventInit = {}) {
  document.activeElement!.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...init }),
  );
  await settled();
  await settled();
}

describe("useNow", () => {
  test("ticks from the calendar's clock every interval, and stops with its owner", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
    let current = Temporal.Instant.from("2026-10-08T12:00:00Z");
    const clock = { instant: () => current };
    function Probe(): JSX.Element {
      const now = useNow({ intervalMs: 1000 });
      return createComponent(Text, { name: "now", read: () => now()?.toString() ?? "pending" });
    }
    const view = mount(() =>
      createComponent(KeyboardFixture, {
        clock,
        initialEvents: [],
        get children() {
          return createComponent(Probe, {});
        },
      }),
    );
    await settled();
    expect(text(view.container, "now")).toBe("2026-10-08T12:00:00Z");
    current = Temporal.Instant.from("2026-10-08T12:00:01Z");
    await vi.advanceTimersByTimeAsync(1000);
    await settled();
    expect(text(view.container, "now")).toBe("2026-10-08T12:00:01Z");
    view.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("a fixed now is the calendar's, and outside a calendar the system clock is", async () => {
    function Probe(): JSX.Element {
      const now = useNow();
      return createComponent(Text, { name: "now", read: () => now()?.toString() ?? "pending" });
    }
    const fixed = mount(() =>
      createComponent(KeyboardFixture, {
        initialEvents: [],
        get children() {
          return createComponent(Probe, {});
        },
      }),
    );
    const standalone = mount(() => createComponent(Probe, {}));
    await settled();
    expect(text(fixed.container, "now")).toBe("2026-10-08T12:00:00Z");
    const shown = Temporal.Instant.from(text(standalone.container, "now")!);
    expect(Math.abs(shown.epochMilliseconds - Date.now())).toBeLessThan(60_000);
  });
});

describe("Announcer", () => {
  function announcer(props: Record<string, unknown>) {
    const view = mount(() =>
      createComponent(KeyboardCalendar.Root, {
        defaultAnchorDate: Temporal.PlainDate.from("2026-10-08"),
        defaultTimeZone: "UTC",
        events: [],
        locale: "en-US",
        weekRules: { firstDay: 7, minimalDays: 1, weekend: [6, 7] },
        get children() {
          return createComponent(KeyboardCalendar.Announcer, {
            messages: {} as never,
            ...props,
          });
        },
      }),
    );
    return view.container.querySelector<HTMLElement>('[data-calendar-part="announcer"]')!;
  }

  test("is a polite status region, hidden from view, that passes the element's props on", () => {
    const region = announcer({ class: "spoken", id: "live" });
    expect(region.getAttribute("role")).toBe("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.getAttribute("aria-atomic")).toBe("true");
    expect(region.id).toBe("live");
    expect(region.className).toBe("spoken");
    expect(region.hasAttribute("messages")).toBe(false);
    expect(region.style.position).toBe("absolute");
    expect(region.textContent).toBe("");
  });

  test("adds a style of its own after the hidden one, as a string or an object", () => {
    expect(announcer({ style: "color: red" }).style.color).toBe("red");
    const styled = announcer({ style: { color: "blue", position: "static" } });
    expect(styled.style.color).toBe("blue");
    // The application's style wins, as it comes after.
    expect(styled.style.position).toBe("static");
    expect(styled.style.width).toBe("1px");
  });
});

describe("Event", () => {
  test("renders an event as the calendar shows it, pending changes included, or its fallback", async () => {
    const renders: string[] = [];
    const hold = Promise.withResolvers<void>();
    let actions!: ReturnType<typeof KeyboardCalendar.useCalendarActions>;
    function Probe(): JSX.Element {
      actions = KeyboardCalendar.useCalendarActions();
      return [
        createComponent(KeyboardCalendar.Event, {
          eventId: "trip",
          children: (value: Accessor<CalendarEventRenderValue<FixtureEvent, string, string>>) => {
            renders.push("trip");
            return createComponent(Span, {
              "data-trip": "",
              get children() {
                const { event, normalized } = value();
                return `${event.title} ${normalized.start.toString()}${normalized.isPending === true ? " pending" : ""}`;
              },
            });
          },
        }),
        createComponent(KeyboardCalendar.Event, {
          eventId: "missing",
          children: () => "never",
          get fallback() {
            return createComponent(Span, { "data-missing": "", children: "none" });
          },
        }),
      ] as unknown as JSX.Element;
    }
    const view = mount(() =>
      createComponent(KeyboardFixture, {
        initialEvents: [allDay("trip", "2026-10-07", "2026-10-09", "Trip")],
        persist: () => hold.promise,
        get children() {
          return createComponent(Probe, {});
        },
      }),
    );
    await settled();
    const shown = () => view.container.querySelector("[data-trip]");
    const first = shown();
    expect(first?.textContent).toBe("Trip 2026-10-07");
    expect(view.container.querySelector("[data-missing]")?.textContent).toBe("none");

    const saved = actions.proposeEventChange({
      cause: "move",
      eventId: "trip",
      proposed: {
        end: Temporal.PlainDate.from("2026-10-16"),
        kind: "all-day",
        start: Temporal.PlainDate.from("2026-10-14"),
      },
    });
    // The pending change shows while it saves, in the same element.
    await vi.waitFor(() => expect(shown()?.textContent).toBe("Trip 2026-10-14 pending"));
    expect(shown()).toBe(first);
    hold.resolve();
    await saved;
    await settled();
    expect(shown()?.textContent).toBe("Trip 2026-10-14");
    expect(renders).toEqual(["trip"]);
  });

  test("ID attributes keep numeric IDs apart from their strings", () => {
    expect(eventIdAttributes(1)).toEqual({ "data-event-id": "1", "data-event-id-type": "number" });
    expect(eventIdAttributes("1")).toEqual({ "data-event-id": "1" });
    expect(resourceIdAttributes(2)).toEqual({
      "data-resource-id": "2",
      "data-resource-id-type": "number",
    });
  });
});

describe("selectors", () => {
  test("useCalendarFocus and useCalendarSelection update only when their results change", async () => {
    const [selection, setSelection] = createSignal<{ value: CalendarSelection | null }>({
      value: null,
    });
    let focusReads = 0;
    let selectionReads = 0;
    function Probe(): JSX.Element {
      const onTrip = useCalendarFocus(
        (focus) => focus?.kind === "event" && focus.eventId === "trip",
      );
      const selected = useCalendarSelection(
        (current) => current?.kind === "event" && current.eventId === "trip",
      );
      return [
        createComponent(Text, {
          name: "focus",
          read: () => {
            focusReads += 1;
            return String(onTrip());
          },
        }),
        createComponent(Text, {
          name: "selected",
          read: () => {
            selectionReads += 1;
            return String(selected());
          },
        }),
      ] as unknown as JSX.Element;
    }
    const view = mount(() =>
      createComponent(KeyboardCalendar.Root, {
        defaultAnchorDate: Temporal.PlainDate.from("2026-10-08"),
        defaultTimeZone: "UTC",
        events: [allDay("trip", "2026-10-07", "2026-10-09", "Trip")],
        locale: "en-US",
        now: Temporal.Instant.from("2026-10-08T12:00:00Z"),
        get selection() {
          return selection().value;
        },
        weekRules: { firstDay: 7, minimalDays: 1, weekend: [6, 7] },
        get children() {
          return [createComponent(Probe, {}), createComponent(KeyboardCalendar.ActiveView, {})];
        },
      }),
    );
    await settled();
    expect(text(view.container, "focus")).toBe("false");
    expect(text(view.container, "selected")).toBe("false");
    const before = { focus: focusReads, selection: selectionReads };

    // Focus moves between days: still not on the trip.
    view.container.querySelector<HTMLElement>('[data-date="2026-10-08"]')!.focus();
    await settled();
    await press("ArrowRight");
    expect(focusReads).toBe(before.focus);

    view.container.querySelector<HTMLElement>('[data-event="trip"]')!.focus();
    await settled();
    expect(text(view.container, "focus")).toBe("true");
    setSelection({ value: { eventId: "trip", kind: "event" } as CalendarSelection });
    await settled();
    expect(text(view.container, "selected")).toBe("true");
    expect(selectionReads).toBe(before.selection + 1);
  });

  test("useCalendarInteraction follows a keyboard grab, with what the policies say", async () => {
    let sessions!: Accessor<string>;
    function Probe(): JSX.Element {
      const session = useCalendarInteraction();
      const verdict = useCalendarInteraction((current, check) =>
        current === null ? "idle" : (check?.status ?? "unchecked"),
      );
      sessions = () => `${session()?.cause ?? "none"} ${verdict()}`;
      return createComponent(Text, { name: "session", read: () => sessions() });
    }
    const view = mount(() =>
      createComponent(KeyboardFixture, {
        initialEvents: [allDay("trip", "2026-10-07", "2026-10-09", "Trip")],
        policies: [
          ({ proposed }) =>
            proposed !== null && "start" in proposed && proposed.start.toString() === "2026-10-08"
              ? { reason: "full", type: "reject" }
              : { type: "accept" },
        ],
        get children() {
          return createComponent(Probe, {});
        },
      }),
    );
    await settled();
    expect(text(view.container, "session")).toBe("none idle");
    view.container.querySelector<HTMLElement>('[data-event="trip"]')!.focus();
    await settled();
    await press(" ");
    expect(text(view.container, "session")).toBe("move unchecked");
    await press("ArrowRight");
    expect(text(view.container, "session")).toBe("move rejected");
    await press("Escape");
    expect(text(view.container, "session")).toBe("none idle");
  });

  test("a view's hooks throw inside a root but outside the active view", async () => {
    let thrown: unknown;
    function Stray(): JSX.Element {
      try {
        useRovingFocus({ date: Temporal.PlainDate.from("2026-10-08"), kind: "day" });
      } catch (error) {
        thrown = error;
      }
      return null;
    }
    mount(() =>
      createComponent(KeyboardCalendar.Root, {
        defaultAnchorDate: Temporal.PlainDate.from("2026-10-08"),
        defaultTimeZone: "UTC",
        events: [],
        locale: "en-US",
        weekRules: { firstDay: 7, minimalDays: 1, weekend: [6, 7] },
        get children() {
          return createComponent(Stray, {});
        },
      }),
    );
    await settled();
    expect(thrown).toEqual(new Error("calendar-view-hook-outside-active-view"));
  });
});
