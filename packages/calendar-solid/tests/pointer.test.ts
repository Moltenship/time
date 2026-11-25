// @vitest-environment jsdom

import {
  createCanonicalEventAdapter,
  createEventSnapshot,
  timeGridColumns,
  type CalendarEventProposal,
  type EventSnapshot,
  type NormalizedCalendarEvent,
  type TimeGridColumn,
} from "@moltenship/calendar-core";
import * as dnd from "@moltenship/calendar-dnd";
import { plainDateInterval } from "@moltenship/calendar-temporal";
import { createComponent, type JSX } from "@solidjs/web";
import { createRenderEffect, createSignal } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { useCalendarPointer, type CalendarPointerOptions } from "../src";
import { keyedList, when } from "../src/flow";
import { element } from "../src/props";
import { mount, settled } from "./harness/render";
import {
  COLUMN_WIDTH,
  HOUR_HEIGHT,
  place,
  pointer,
  resetLayout,
  timedEvent,
  timeZone,
  yAt,
  type TestEvent,
} from "./harness/pointer-fixture";
import "./setup";

vi.mock("@moltenship/calendar-dnd", async (original) => {
  const module = await original<typeof import("@moltenship/calendar-dnd")>();
  return { ...module, attachCalendarPointer: vi.fn(module.attachCalendarPointer) };
});

type Propose = (proposal: CalendarEventProposal<string | number, string, TestEvent>) => void;
type Options = CalendarPointerOptions<TestEvent, string | number, string>;

const Div = element("div");
const Button = element("button");
const Span = element("span");

const columns = timeGridColumns(
  plainDateInterval(Temporal.PlainDate.from("2026-08-17"), Temporal.PlainDate.from("2026-08-18")),
  timeZone,
);
const snapshot = createEventSnapshot(
  [timedEvent("a", "2026-08-17T09:00Z", "2026-08-17T10:00Z")],
  createCanonicalEventAdapter<null, string | number, string>(),
);

interface FixtureProps {
  readonly columns: readonly TimeGridColumn[];
  readonly disabled?: boolean;
  readonly events: EventSnapshot<TestEvent, string | number, string>;
  readonly onPropose: Propose;
  /** Hears each time something in the view updates. */
  readonly onUpdate?: () => void;
}

/** The smallest view the hook supports: day columns with events and resize handles. */
function FixtureView(props: FixtureProps): JSX.Element {
  const ref = useCalendarPointer<TestEvent, string | number, string>(() => ({
    columns: props.columns,
    disabled: props.disabled,
    events: props.events,
    onPropose: props.onPropose,
    timeZone,
  }));
  createRenderEffect(
    () => [props.columns, props.events],
    () => props.onUpdate?.(),
  );
  return createComponent(Div, {
    ref,
    get children() {
      return keyedList(
        () => props.columns,
        (column: TimeGridColumn) =>
          createComponent(Div, {
            get "data-date"() {
              return column.date.toString();
            },
            get children() {
              return keyedList(
                () => props.events.events,
                (event: NormalizedCalendarEvent<TestEvent, string | number, string>) =>
                  createComponent(Button, {
                    get "data-event-id"() {
                      return String(event.id);
                    },
                    type: "button",
                    get children() {
                      return [event.title, createComponent(Span, { "data-resize": "end" })];
                    },
                  } as const),
              );
            },
          }),
      );
    },
  });
}

/** Gives the rendered fixture the time-grid geometry used by the DOM tests. */
function layOut(container: HTMLElement): HTMLElement {
  resetLayout();
  document.body.append(container);
  place(
    container.querySelector("[data-date]")!,
    { height: 24 * HOUR_HEIGHT, left: 0, top: yAt("00:00"), width: COLUMN_WIDTH },
    2,
  );
  return place(
    container.querySelector("[data-event-id]")!,
    { height: HOUR_HEIGHT, left: 0, top: yAt("09:00"), width: COLUMN_WIDTH },
    1,
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.mocked(dnd.attachCalendarPointer).mockClear();
});

describe("useCalendarPointer", () => {
  test("drags without updating the view and proposes through the latest callback", async () => {
    const stale = vi.fn<Propose>();
    const latest = vi.fn<Propose>();
    const onUpdate = vi.fn();
    // In an object: Solid 2 reads a function given to createSignal as a derivation.
    const [callback, setCallback] = createSignal({ onPropose: stale });
    const { container } = mount(() =>
      createComponent(FixtureView, {
        columns,
        events: snapshot,
        get onPropose() {
          return callback().onPropose;
        },
        onUpdate,
      }),
    );
    setCallback({ onPropose: latest });
    await settled();
    const event = layOut(container);
    const updates = onUpdate.mock.calls.length;

    pointer("pointerdown", event, 50, yAt("09:30"));
    for (const time of ["10:00", "10:30", "11:00", "11:30"])
      pointer("pointermove", event, 50, yAt(time));
    pointer("pointerup", event, 50, yAt("11:30"));
    await settled();

    expect(onUpdate).toHaveBeenCalledTimes(updates);
    expect(stale).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
    expect(latest.mock.calls[0]?.[0]).toMatchObject({ cause: "move", eventId: "a" });
    // A new callback reads through the same listeners: they were attached once.
    expect(dnd.attachCalendarPointer).toHaveBeenCalledTimes(1);
  });

  test("passes the options through untouched, as the pointer layer reads them", async () => {
    const options = {
      columns,
      events: snapshot,
      onPropose: () => undefined,
      preview: "free",
      // An option this package doesn't know of reaches the pointer layer as it was given.
      unknownOption: { kind: "later" },
      timeZone,
    } as Options;
    mount(() =>
      createComponent(() => {
        const ref = useCalendarPointer(options);
        return createComponent(Div, { ref });
      }, {}),
    );
    await settled();
    const [[, read]] = vi.mocked(dnd.attachCalendarPointer).mock.calls as unknown as [
      [HTMLElement, () => Options],
    ];
    expect(read()).toBe(options);
  });

  test("listens for touch moves only while enabled, attaching again when that changes", async () => {
    vi.useFakeTimers();
    const [disabled, setDisabled] = createSignal(true);
    const { container } = mount(() =>
      createComponent(FixtureView, {
        columns,
        get disabled() {
          return disabled();
        },
        events: snapshot,
        onPropose: () => undefined,
      }),
    );
    await settled();
    const region = container.firstElementChild!;
    const added = vi.spyOn(region, "addEventListener");
    const removed = vi.spyOn(region, "removeEventListener");
    const touchMoves = (spy: typeof added) =>
      spy.mock.calls.filter(([type]) => type === "touchmove").map(([, listener]) => listener);

    setDisabled(false);
    await settled();
    const event = layOut(container);
    pointer("pointerdown", event, 50, yAt("09:30"), { pointerType: "touch" });
    vi.advanceTimersByTime(450);
    // The region itself holds the page still.
    const scroll = new Event("touchmove", { cancelable: true });
    region.dispatchEvent(scroll);
    expect(scroll.defaultPrevented).toBe(true);
    pointer("pointerup", event, 50, yAt("09:30"), { pointerType: "touch" });

    setDisabled(true);
    await settled();
    // Added once, while enabled, and removed again.
    expect(touchMoves(added)).toHaveLength(1);
    expect(touchMoves(removed)).toContain(touchMoves(added)[0]);
  });

  test("removes the preview when the view unmounts mid-drag", async () => {
    const onPropose = vi.fn<Propose>();
    const [shown, setShown] = createSignal(true);
    const { container } = mount(() =>
      when(shown, () => createComponent(FixtureView, { columns, events: snapshot, onPropose })),
    );
    await settled();
    const event = layOut(container);
    const region = container.firstElementChild!;

    pointer("pointerdown", event, 50, yAt("09:30"));
    pointer("pointermove", event, 50, yAt("12:00"));
    expect(region.querySelector("[data-calendar-ghost]")).not.toBeNull();

    setShown(false);
    await settled();
    expect(region.querySelector("[data-calendar-ghost]")).toBeNull();
    expect(region.hasAttribute("data-interaction")).toBe(false);
    expect(onPropose).not.toHaveBeenCalled();
    // Moves after the view went away do nothing.
    pointer("pointermove", event, 50, yAt("13:00"));
    pointer("pointerup", event, 50, yAt("13:00"));
    expect(onPropose).not.toHaveBeenCalled();
  });
});
