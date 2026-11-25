// @vitest-environment jsdom
import "./setup";

import { timeGridStrategy, type CalendarFocus } from "@moltenship/calendar-core";
import { afterEach, expect, test, vi } from "vite-plus/test";

import {
  calendarFocusKey,
  calendarViewEntry,
  createCalendarKeyboard,
  createCalendarViewRuntime,
  type CalendarKeyboardOptions,
} from "../src/index";
import { host, type HostProps } from "./harness";

// The bare keyboard controller, bound to a region's native `keydown` and `focusout` as a framework
// without its own event system binds it.

const hosts: ReturnType<typeof host>[] = [];
afterEach(() => {
  for (const mounted of hosts.splice(0)) mounted.dispose();
  document.body.replaceChildren();
  vi.useRealTimers();
});

const date = Temporal.PlainDate.from("2026-08-15");
const slot = (time: string): CalendarFocus => ({
  date,
  kind: "slot",
  time: Temporal.PlainTime.from(time),
});

const grid = timeGridStrategy<undefined, unknown>({ count: 7, kind: "days" });
const definition = Object.freeze({ defaultOptions: undefined, name: "grid", strategy: grid });

/**
 * A root whose active view is a seven-day time grid over the harness's range, with a region of
 * slot buttons from 09:00 to 12:00, the first focused.
 */
function setup(props: HostProps = { onEventChange: () => undefined }) {
  const mounted = host(props);
  hosts.push(mounted);
  const { interaction } = mounted.model;
  const getView = () => {
    const view = mounted.model.activeView!;
    return {
      ...view,
      definition,
      options: undefined,
      projection: grid.project({
        environment: view.environment,
        expandedResourceIds: [],
        instantRange: view.instantRange,
        loadRange: view.loadRange,
        options: undefined,
        range: view.range,
        resources: mounted.model.resourceTree,
        snapshot: view.events,
        today: view.range.start,
      }),
    } as never;
  };
  const viewRuntime = createCalendarViewRuntime(getView);
  let options: CalendarKeyboardOptions = {};
  const getOptions = vi.fn(() => options);
  const keyboard = createCalendarKeyboard(interaction, viewRuntime, getOptions, () => null);

  const region = document.createElement("div");
  const outside = document.createElement("button");
  const cells = new Map<string, HTMLButtonElement>();
  for (let minutes = 9 * 60; minutes < 12 * 60; minutes += 15) {
    const time = Temporal.PlainTime.from({ hour: 0 }).add({ minutes }).toString().slice(0, 5);
    const target = slot(time);
    const cell = document.createElement("button");
    cell.dataset.focus = calendarFocusKey(target);
    region.append(cell);
    viewRuntime.roving.register(cell, target, 1);
    cells.set(time, cell);
  }
  document.body.append(region, outside);
  region.addEventListener("keydown", (event) => keyboard.keyDown(event));
  const focusOut = new AbortController();
  region.addEventListener("focusout", (event) => keyboard.focusOut(event, region), {
    signal: focusOut.signal,
  });

  /** Keeps the roving store on the root's focus, as an integration does after each render. */
  const sync = () =>
    viewRuntime.roving.update(
      interaction.read().focus as CalendarFocus | null,
      calendarViewEntry(getView()),
    );
  interaction.actions.setFocus(slot("09:00"));
  sync();
  cells.get("09:00")!.focus();

  const press = (key: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...init });
    (document.activeElement ?? region).dispatchEvent(event);
    sync();
    return event;
  };
  return {
    cells,
    getOptions,
    interaction,
    keyboard,
    /** Leaves `focusout` to the test, which calls `keyboard.focusOut` itself. */
    stopFocusOut: () => focusOut.abort(),
    outside,
    press,
    region,
    setOptions: (next: CalendarKeyboardOptions) => (options = next),
  };
}

const focusOf = (interaction: ReturnType<typeof setup>["interaction"]) =>
  interaction.read().focus as CalendarFocus | null;

test("an arrow key while idle moves the calendar's focus and DOM focus, preventing its default", () => {
  const { cells, interaction, press } = setup();
  const outer = vi.fn();
  document.addEventListener("keydown", outer);

  const event = press("ArrowDown");

  expect(event.defaultPrevented).toBe(true);
  expect(focusOf(interaction)).toMatchObject({
    kind: "slot",
    time: Temporal.PlainTime.from("09:15"),
  });
  expect(document.activeElement).toBe(cells.get("09:15"));
  // Only Escape stops propagating.
  expect(outer).toHaveBeenCalledTimes(1);
  document.removeEventListener("keydown", outer);
});

test("keys with a modifier, or already handled, are left alone", () => {
  const { interaction, press } = setup();

  expect(press("ArrowDown", { altKey: true }).defaultPrevented).toBe(false);
  expect(press("ArrowDown", { ctrlKey: true }).defaultPrevented).toBe(false);
  expect(focusOf(interaction)).toMatchObject({ time: Temporal.PlainTime.from("09:00") });
});

test("Space on a cell starts a create; Escape cancels it, stops propagating and restores focus", () => {
  const { cells, interaction, press } = setup();
  press("ArrowDown");

  expect(press(" ").defaultPrevented).toBe(true);
  const grab = interaction.keyboard.get();
  expect(grab?.session.cause).toBe("create");
  // An hour from the cell by default: the cursor steps three slots later.
  expect(grab?.session.proposed).toMatchObject({
    end: Temporal.Instant.from("2026-08-15T10:15:00Z"),
    start: Temporal.Instant.from("2026-08-15T09:15:00Z"),
  });
  expect(document.activeElement).toBe(cells.get("10:00"));

  const outer = vi.fn();
  document.addEventListener("keydown", outer);
  const escape = press("Escape");
  document.removeEventListener("keydown", outer);

  expect(escape.defaultPrevented).toBe(true);
  expect(outer).not.toHaveBeenCalled();
  expect(interaction.keyboard.get()).toBeNull();
  expect(focusOf(interaction)).toMatchObject({ time: Temporal.PlainTime.from("09:15") });
  expect(document.activeElement).toBe(cells.get("09:15"));
});

test("Enter commits a create through the root's proposeEventChange", async () => {
  const onEventChange = vi.fn();
  const { interaction, press } = setup({ onEventChange });

  press(" ");
  press("ArrowDown");
  expect(press("Enter").defaultPrevented).toBe(true);
  expect(interaction.keyboard.get()).toBeNull();
  await vi.waitFor(() => expect(onEventChange).toHaveBeenCalledTimes(1));

  expect(onEventChange.mock.calls[0]![0]).toMatchObject({
    eventId: null,
    proposed: {
      end: Temporal.Instant.from("2026-08-15T10:15:00Z"),
      kind: "timed",
      start: Temporal.Instant.from("2026-08-15T09:00:00Z"),
    },
  });
});

test("a read-only root leaves Space to the element", () => {
  const { interaction, press } = setup({});

  expect(press(" ").defaultPrevented).toBe(false);
  expect(interaction.keyboard.get()).toBeNull();
});

test("focus moving within the region keeps a gesture, whatever has focus a task later", async () => {
  const { cells, interaction, keyboard, outside, press, region, stopFocusOut } = setup();
  press(" ");
  stopFocusOut();
  outside.focus();

  keyboard.focusOut(new FocusEvent("focusout", { relatedTarget: cells.get("11:00")! }), region);
  await new Promise((resolve) => setTimeout(resolve));

  expect(interaction.keyboard.get()).not.toBeNull();
});

test("focus leaving the region cancels a gesture a task later, unless it came back", async () => {
  const { cells, interaction, outside, press } = setup();
  const later = () => new Promise((resolve) => setTimeout(resolve));
  press(" ");

  // Focus that comes back before the task, as a grabbed event re-rendering does, keeps it.
  outside.focus();
  cells.get("09:30")!.focus();
  await later();
  expect(interaction.keyboard.get()).not.toBeNull();

  outside.focus();
  expect(interaction.keyboard.get()).not.toBeNull();
  await later();
  expect(interaction.keyboard.get()).toBeNull();
});

test("the options are read when a key arrives, not when the keyboard is made", () => {
  const { getOptions, interaction, press, setOptions } = setup();
  expect(getOptions).not.toHaveBeenCalled();

  setOptions({ createDuration: { minutes: 30 } });
  press(" ");
  expect(interaction.keyboard.get()?.session.proposed).toMatchObject({
    end: Temporal.Instant.from("2026-08-15T09:30:00Z"),
  });
  press("Escape");

  setOptions({ createDuration: { hours: 2 } });
  press(" ");
  expect(interaction.keyboard.get()?.session.proposed).toMatchObject({
    end: Temporal.Instant.from("2026-08-15T11:00:00Z"),
    start: Temporal.Instant.from("2026-08-15T09:00:00Z"),
  });
});
