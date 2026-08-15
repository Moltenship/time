import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { createCalendarStore, type CalendarStore } from "../src/index.ts";

type ViewName = "agenda" | "month" | "week";

interface Selection {
  readonly key: string;
}

interface FocusTarget {
  readonly key: string;
}

type TestStore = CalendarStore<ViewName, Selection, FocusTarget, string>;

const stores: TestStore[] = [];

function plainDate(value: string): Temporal.PlainDate {
  return Temporal.PlainDate.from(value);
}

function makeStore(defaultView: ViewName = "month"): TestStore {
  const store = createCalendarStore<ViewName, Selection, FocusTarget, string>({
    defaultAnchorDate: plainDate("2026-08-15"),
    defaultExpandedResourceIds: ["team-a", "team-a"],
    defaultFocus: null,
    defaultSelection: null,
    defaultTimeZone: "Asia/Tbilisi",
    defaultView,
  });
  stores.push(store);
  return store;
}

afterEach(() => {
  for (const store of stores.splice(0)) store.destroy();
});

describe("createCalendarStore", () => {
  test("exposes one cached immutable snapshot and six semantic commands", () => {
    const store = makeStore();
    const first = store.getSnapshot();

    expect(store.getSnapshot()).toBe(first);
    expect(store.getServerSnapshot()).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first).toMatchObject({
      anchorDate: plainDate("2026-08-15"),
      expandedResourceIds: ["team-a"],
      focus: null,
      selection: null,
      timeZone: "Asia/Tbilisi",
      view: "month",
    });
    expect(Object.isFrozen(first.expandedResourceIds)).toBe(true);

    store.actions.setView("week");
    store.actions.setAnchorDate(plainDate("2026-08-16"));
    store.actions.setSelection({ key: "event:event-1" });
    store.actions.setFocus({ key: "cell:2026-08-16T09:00" });
    store.actions.setTimeZone("America/New_York");
    store.actions.setExpandedResourceIds(["team-b", "team-b", "team-c"]);

    const next = store.getSnapshot();
    expect(next).not.toBe(first);
    expect(next.anchorDate.equals("2026-08-16")).toBe(true);
    expect(next).toMatchObject({
      expandedResourceIds: ["team-b", "team-c"],
      focus: { key: "cell:2026-08-16T09:00" },
      selection: { key: "event:event-1" },
      timeZone: "America/New_York",
      view: "week",
    });
    expect(store.actions).toBe(store.actions);
  });

  test("keeps every controlled slice synchronous and leaves its uncontrolled value untouched", () => {
    const store = makeStore();
    const onViewChange = vi.fn();
    const onAnchorDateChange = vi.fn();
    const onSelectionChange = vi.fn();
    const onFocusChange = vi.fn();
    const onTimeZoneChange = vi.fn();
    const onExpandedResourceIdsChange = vi.fn();
    const source = store.createStateSource({
      anchorDate: plainDate("2027-01-02"),
      expandedResourceIds: ["controlled-team"],
      focus: { key: "controlled-focus" },
      selection: null,
      timeZone: "UTC",
      view: "agenda",
    });
    const actions = store.createActions(source, {
      onAnchorDateChange,
      onExpandedResourceIdsChange,
      onFocusChange,
      onSelectionChange,
      onTimeZoneChange,
      onViewChange,
    });
    const controlledSnapshot = source.getSnapshot();

    actions.setView("week");
    actions.setAnchorDate(plainDate("2027-01-03"));
    actions.setSelection({ key: "next-selection" });
    actions.setFocus(null);
    actions.setTimeZone("Europe/Paris");
    actions.setExpandedResourceIds(["next-team"]);

    expect(source.getSnapshot()).toBe(controlledSnapshot);
    expect(store.getSnapshot()).toMatchObject({
      expandedResourceIds: ["team-a"],
      focus: null,
      selection: null,
      timeZone: "Asia/Tbilisi",
      view: "month",
    });
    expect(store.getSnapshot().anchorDate.equals("2026-08-15")).toBe(true);
    expect(onViewChange).toHaveBeenCalledWith("week", {
      controlled: true,
      previous: "agenda",
      slice: "view",
      source: "action",
    });
    expect(onAnchorDateChange.mock.calls[0]?.[1]).toMatchObject({
      controlled: true,
      slice: "anchorDate",
    });
    expect(onSelectionChange).toHaveBeenCalledOnce();
    expect(onFocusChange).toHaveBeenCalledOnce();
    expect(onTimeZoneChange).toHaveBeenCalledOnce();
    expect(onExpandedResourceIdsChange).toHaveBeenCalledOnce();
    expect(source.controlledSlices).toEqual([
      "view",
      "anchorDate",
      "selection",
      "focus",
      "timeZone",
      "expandedResourceIds",
    ]);
  });

  test("lets Jotai skip controlled backing atoms and rejects commands after destruction", () => {
    const store = makeStore();
    const controlledSource = store.createStateSource({ view: "agenda" });
    const controlledSnapshot = controlledSource.getSnapshot();

    store.actions.setAnchorDate(plainDate("2026-08-16"));
    expect(controlledSource.getSnapshot()).not.toBe(controlledSnapshot);
    const snapshotAfterAnchorChange = controlledSource.getSnapshot();

    store.actions.setView("week");
    expect(controlledSource.getSnapshot()).toBe(snapshotAfterAnchorChange);
    expect(controlledSource.getSnapshot().view).toBe("agenda");
    expect(store.getSnapshot().view).toBe("week");

    store.destroy();
    expect(store.meta.destroyed).toBe(true);
    expect(() => store.actions.setView("agenda")).toThrow("calendar-store-destroyed");
  });

  test("two stores stay isolated and reject a reader owned by another store", () => {
    const first = makeStore("month");
    const second = makeStore("agenda");

    first.actions.setView("week");
    expect(first.getSnapshot().view).toBe("week");
    expect(second.getSnapshot().view).toBe("agenda");

    const foreignActions = first.createActions(second.createStateSource());
    expect(() => foreignActions.setView("month")).toThrow(
      "calendar-state-source-belongs-to-another-store",
    );
  });
});
