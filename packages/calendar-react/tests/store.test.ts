import { describe, expect, test, vi } from "vite-plus/test";

import { createCalendarStore } from "../src/index";

type ViewName = "agenda" | "month" | "week";

interface Selection {
  readonly key: string;
}

function plainDate(value: string): Temporal.PlainDate {
  return Temporal.PlainDate.from(value);
}

function makeStore() {
  return createCalendarStore<ViewName, Selection, Selection, string>({
    defaultAnchorDate: plainDate("2026-08-15"),
    defaultExpandedResourceIds: ["team-a", "team-a"],
    defaultTimeZone: "Asia/Tbilisi",
    defaultView: "month",
  });
}

describe("createCalendarStore", () => {
  test("exposes one cached immutable snapshot and six semantic commands", () => {
    const store = makeStore();
    const first = store.getSnapshot();

    expect(store.getSnapshot()).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first).toMatchObject({
      expandedResourceIds: ["team-a"],
      focus: null,
      selection: null,
      timeZone: "Asia/Tbilisi",
      view: "month",
    });

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
  });

  test("notifies subscribers once per change and never for an equal value", () => {
    const store = makeStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.actions.setAnchorDate(plainDate("2026-08-15"));
    store.actions.setExpandedResourceIds(["team-a"]);
    store.actions.setView("month");
    expect(listener).not.toHaveBeenCalled();

    store.actions.setView("agenda");
    expect(listener).toHaveBeenCalledOnce();

    unsubscribe();
    store.actions.setView("week");
    expect(listener).toHaveBeenCalledOnce();
  });

  test("two stores stay isolated", () => {
    const first = makeStore();
    const second = makeStore();

    first.actions.setView("week");
    expect(first.getSnapshot().view).toBe("week");
    expect(second.getSnapshot().view).toBe("month");
  });
});
