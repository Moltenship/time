// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vite-plus/test";

import {
  formatPlacementRange,
  type CalendarAnnouncer,
  type CalendarEventInterval,
  type CalendarInteractionUpdate,
  type CalendarTransactionResult,
} from "@moltenship/calendar-core";

import { attachCalendarPointer, type CalendarPointerOptions } from "../src/index";
import {
  cellCenter,
  mountMonth,
  mountTimeGrid,
  pointer,
  timedEvent,
  timeZone,
  xAt,
  yAt,
  type TestEvent,
} from "./dom-fixture";

type Options = CalendarPointerOptions<TestEvent, string | number, string>;
type Result = CalendarTransactionResult<TestEvent, string | number, string>;

const meeting = timedEvent("a", "2026-08-17T09:00Z", "2026-08-17T10:00Z", "Standup");
const formatRange = (placement: CalendarEventInterval) =>
  formatPlacementRange(placement, { locale: "en-US", timeZone });
/** Intl separates ranges and day periods with thin and narrow spaces. */
const plain = (text: string | null | undefined) => text?.replace(/\s/gu, " ");

let detach: (() => void) | undefined;
afterEach(async () => {
  detach?.();
  detach = undefined;
  // The guard that swallows a drag's trailing click expires on the next task.
  await new Promise((resolve) => setTimeout(resolve));
});

function setup(
  mount: { readonly region: HTMLElement; readonly snapshot: Options["events"] },
  extra: Partial<Options> = {},
) {
  const updates: CalendarInteractionUpdate[] = [];
  const announcer: CalendarAnnouncer = {
    announce: (update) => updates.push(update),
    formatRange,
  };
  detach = attachCalendarPointer(mount.region, () => ({
    announcer,
    events: mount.snapshot,
    onPropose: () => undefined,
    timeZone,
    ...extra,
  }));
  return updates;
}

/** Each update as `phase cause range`, with the range it would land on. */
function describeUpdate(update: CalendarInteractionUpdate): string {
  const range = update.proposed === null ? "nowhere" : formatRange(update.proposed);
  const reason = update.phase === "reject" ? ` (${update.reason})` : "";
  return plain(`${update.phase} ${update.cause} ${range}${reason}`)!;
}

function withTimeLabel(element: HTMLElement): HTMLElement {
  const time = document.createElement("span");
  time.setAttribute("data-event-time", "");
  time.textContent = "9:00 – 10:00 AM";
  element.append(time);
  return element;
}

describe("the drag preview's label", () => {
  test("shows the proposed range, with dates once the event crosses midnight", () => {
    const grid = mountTimeGrid([meeting]);
    setup(grid, { columns: grid.columns });
    const element = withTimeLabel(grid.elements.get("a")!);
    const label = () =>
      plain(grid.region.querySelector("[data-calendar-ghost] [data-event-time]")?.textContent);

    pointer("pointerdown", element, xAt("2026-08-17"), yAt("09:30"));
    pointer("pointermove", element, xAt("2026-08-17"), yAt("11:30"));
    expect(label()).toBe("11:00 AM – 12:00 PM");

    pointer("pointermove", element, xAt("2026-08-17"), yAt("23:45"));
    expect(label()).toBe("Aug 17, 11:15 PM – Aug 18, 12:15 AM");
    // The event itself keeps its range until the change is saved.
    expect(element.querySelector("[data-event-time]")?.textContent).toBe("9:00 – 10:00 AM");
  });

  test("uses the default range format without an announcer", () => {
    const grid = mountTimeGrid([meeting]);
    detach = attachCalendarPointer(grid.region, () => ({
      columns: grid.columns,
      events: grid.snapshot,
      onPropose: () => undefined,
      timeZone,
    }));
    const element = withTimeLabel(grid.elements.get("a")!);

    pointer("pointerdown", element, xAt("2026-08-17"), yAt("09:30"));
    pointer("pointermove", element, xAt("2026-08-18"), yAt("10:00"));
    expect(grid.region.querySelector("[data-calendar-ghost] [data-event-time]")?.textContent).toBe(
      formatPlacementRange(
        {
          end: Temporal.Instant.from("2026-08-18T10:30Z"),
          kind: "timed",
          start: Temporal.Instant.from("2026-08-18T09:30Z"),
        },
        { timeZone },
      ),
    );
  });
});

describe("pointer announcements", () => {
  test("announce a drag's start, each new placement, and the saved change", async () => {
    const grid = mountTimeGrid([meeting]);
    const updates = setup(grid, {
      columns: grid.columns,
      onPropose: (proposal): Promise<Result> =>
        Promise.resolve({
          change: {
            cause: "move",
            event: meeting,
            eventId: "a",
            id: "change-1",
            original: { ...meeting, resourceIds: [] },
            proposed: {
              ...(proposal as Extract<typeof proposal, { proposed: unknown }>).proposed,
              resourceIds: [],
            },
          },
          status: "committed",
        } as Result),
    });
    const element = grid.elements.get("a")!;

    pointer("pointerdown", element, xAt("2026-08-17"), yAt("09:00"));
    pointer("pointermove", element, xAt("2026-08-17"), yAt("09:30"));
    pointer("pointermove", element, xAt("2026-08-17"), yAt("09:35"));
    pointer("pointermove", element, xAt("2026-08-17"), yAt("10:00"));
    pointer("pointerup", element, xAt("2026-08-17"), yAt("10:00"));
    await Promise.resolve();

    expect(updates.map(describeUpdate)).toEqual([
      "start move 9:30 – 10:30 AM",
      // 09:35 snaps to the same slot, so it says nothing new.
      "step move 10:00 – 11:00 AM",
      "commit move 10:00 – 11:00 AM",
    ]);
    expect(updates.every((update) => update.input === "pointer")).toBe(true);
    expect(updates[0]!.event?.title).toBe("Standup");
    expect(updates[0]!.original).toMatchObject({ kind: "timed" });
  });

  test("announce a rejected change with its reason", async () => {
    const grid = mountTimeGrid([meeting]);
    const updates = setup(grid, {
      columns: grid.columns,
      onPropose: () => Promise.resolve({ reason: "overlap", status: "rejected" } as Result),
    });
    const element = grid.elements.get("a")!;

    pointer("pointerdown", element, xAt("2026-08-17"), yAt("09:00"));
    pointer("pointermove", element, xAt("2026-08-18"), yAt("09:00"));
    pointer("pointerup", element, xAt("2026-08-18"), yAt("09:00"));
    await Promise.resolve();

    expect(updates.map(describeUpdate).at(-1)).toBe("reject move 9:00 – 10:00 AM (overlap)");
  });

  test("pass on what the change handler rejected with", async () => {
    const grid = mountTimeGrid([meeting]);
    const error = new DOMException("Cancelled", "AbortError");
    const updates = setup(grid, {
      columns: grid.columns,
      onPropose: () =>
        Promise.resolve({ error, reason: "handler-error", status: "rejected" } as Result),
    });
    const element = grid.elements.get("a")!;

    pointer("pointerdown", element, xAt("2026-08-17"), yAt("09:00"));
    pointer("pointermove", element, xAt("2026-08-18"), yAt("09:00"));
    pointer("pointerup", element, xAt("2026-08-18"), yAt("09:00"));
    await Promise.resolve();

    expect(updates.at(-1)).toMatchObject({ error, phase: "reject", reason: "handler-error" });
  });

  test("announce a cancel for Escape, a drop that changes nothing, and a pointercancel", () => {
    const month = mountMonth([meeting]);
    const updates = setup(month);
    const element = month.elements.get("a")!;
    const at = (date: string) => cellCenter(date);

    pointer("pointerdown", element, at("2026-08-17").x, at("2026-08-17").y);
    pointer("pointermove", element, at("2026-08-19").x, at("2026-08-19").y);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    pointer("pointerdown", element, at("2026-08-17").x, at("2026-08-17").y);
    pointer("pointermove", element, at("2026-08-17").x + 10, at("2026-08-17").y);
    pointer("pointerup", element, at("2026-08-17").x + 10, at("2026-08-17").y);

    pointer("pointerdown", element, at("2026-08-17").x, at("2026-08-17").y);
    pointer("pointermove", element, at("2026-08-18").x, at("2026-08-18").y);
    pointer("pointercancel", element, at("2026-08-18").x, at("2026-08-18").y);

    expect(updates.map((update) => update.phase)).toEqual([
      "start",
      "cancel",
      "start",
      "cancel",
      "start",
      "cancel",
    ]);
    // A click is not a drag, so it says nothing.
    pointer("pointerdown", element, at("2026-08-17").x, at("2026-08-17").y);
    pointer("pointerup", element, at("2026-08-17").x, at("2026-08-17").y);
    expect(updates).toHaveLength(6);
  });

  test("announce creates with no event", () => {
    const month = mountMonth([]);
    const updates = setup(month);
    const at = (date: string) => cellCenter(date);
    const cell = month.region.querySelector<HTMLElement>('[data-date="2026-08-18"]')!;

    pointer("pointerdown", cell, at("2026-08-18").x, at("2026-08-18").y);
    pointer("pointermove", cell, at("2026-08-20").x, at("2026-08-20").y);
    pointer("pointerup", cell, at("2026-08-20").x, at("2026-08-20").y);

    expect(updates.map(describeUpdate)).toEqual([
      "start create Aug 18 – 20",
      "commit create Aug 18 – 20",
    ]);
    expect(updates[0]!.event).toBeNull();
  });
});
