// @vitest-environment jsdom
import "./setup";

import {
  createEventHistory,
  createEventSnapshot,
  type CalendarDraft,
  type CalendarKeyboardSession,
} from "@moltenship/calendar-core";
import { instantInterval } from "@moltenship/calendar-temporal";
import { afterEach, expect, test, vi } from "vite-plus/test";

import {
  attachCalendarHistoryShortcuts,
  bindCalendarHistory,
  createAnnouncerLiveText,
  createBusyResourcesQuery,
  createResourceExpansionCommands,
  subscribeAnchorDateRequests,
} from "../src/index";
import { adapter, host, review, type Meeting } from "./harness";

// The interaction halves an integration binds, driven without a framework: the harness's host
// renders on every store change, as an integration does.

const hosts: ReturnType<typeof host>[] = [];
function mount(...args: Parameters<typeof host>) {
  const mounted = host(...args);
  hosts.push(mounted);
  return mounted;
}

afterEach(() => {
  for (const mounted of hosts.splice(0)) mounted.dispose();
  document.body.replaceChildren();
});

const instant = (value: string) => Temporal.Instant.from(value);
const date = (value: string) => Temporal.PlainDate.from(value);

test("the draft is the keyboard's session while there is one, else the pointer's draft", () => {
  const { draft, keyboard, pointerDraft } = mount({ onEventChange: () => undefined }).model
    .interaction;
  const heard = vi.fn();
  const stop = draft.subscribe(heard);
  expect(draft.getSnapshot()).toBeNull();
  expect(draft.getServerSnapshot?.()).toBeNull();

  const dragged: CalendarDraft<string, string> = {
    eventId: "meeting-1",
    proposed: {
      end: instant("2026-08-15T11:00:00Z"),
      kind: "timed",
      resourceIds: [],
      start: instant("2026-08-15T10:00:00Z"),
    },
  };
  pointerDraft.set(dragged);
  expect(draft.getSnapshot()).toBe(dragged);

  const session = {
    eventId: "meeting-1",
    proposed: {
      end: instant("2026-08-15T12:00:00Z"),
      kind: "timed",
      resourceIds: [],
      start: instant("2026-08-15T11:00:00Z"),
    },
  } as unknown as CalendarKeyboardSession;
  keyboard.set({ cell: {}, check: null, session } as never);
  const grabbed = draft.getSnapshot();
  expect(grabbed).toEqual({ eventId: "meeting-1", proposed: session.proposed });
  // The same object for as long as the session is, so a framework doesn't render again.
  expect(draft.getSnapshot()).toBe(grabbed);
  // The server and hydration never read a draft.
  expect(draft.getServerSnapshot?.()).toBeNull();

  keyboard.set(null);
  expect(draft.getSnapshot()).toBe(dragged);
  expect(heard).toHaveBeenCalledTimes(3);

  stop();
  pointerDraft.set(null);
  expect(heard).toHaveBeenCalledTimes(3);
});

test("a live region's text says a repeated message again, and is empty on the server", () => {
  const live = createAnnouncerLiveText();
  const heard = vi.fn();
  live.subscribe(heard);

  expect([live.getSnapshot(), live.getServerSnapshot?.()]).toEqual(["", ""]);
  live.speak("Moved");
  expect(live.getSnapshot()).toBe("Moved");
  live.speak("Moved");
  expect(live.getSnapshot()).toBe("Moved ");
  live.speak("Moved");
  expect(live.getSnapshot()).toBe("Moved");
  live.speak("Resized");
  expect(live.getSnapshot()).toBe("Resized");
  expect(heard).toHaveBeenCalledTimes(4);
  expect(live.getServerSnapshot?.()).toBe("");
});

test("a busy-resources query answers again only when the events, range or query change", () => {
  const query = createBusyResourcesQuery();
  const events = createEventSnapshot([review], adapter);
  const range = () =>
    instantInterval(instant("2026-08-15T09:15:00Z"), instant("2026-08-15T09:30:00Z"));

  const busy = query(events, range(), { resourceIds: ["room-1"], timeZone: "UTC" });
  // A range and IDs made inline are equal by value: the same answer, no query.
  expect(query(events, range(), { resourceIds: ["room-1"], timeZone: "UTC" })).toBe(busy);
  expect(query(events, range(), { resourceIds: ["room-2"], timeZone: "UTC" })).not.toBe(busy);
  expect(query(events, null, { timeZone: "UTC" }).size).toBe(0);
});

test("anchor date requests are heard with the range the view shows, until the cleanup runs", () => {
  const mounted = mount();
  const heard: string[] = [];
  const stop = subscribeAnchorDateRequests(mounted.model.interaction, (requested, range) =>
    heard.push(`${requested.toString()} ${range?.start.toString()}..${range?.end.toString()}`),
  );

  mounted.model.actions.setAnchorDate(date("2026-09-01"));
  // A date that is already the anchor still asks.
  mounted.model.actions.setAnchorDate(date("2026-09-01"));
  stop();
  mounted.model.actions.setAnchorDate(date("2026-10-01"));

  expect(heard).toEqual(["2026-09-01 2026-09-01..2026-09-08", "2026-09-01 2026-09-01..2026-09-08"]);
});

test("expansion commands compose, ask nothing that changes nothing, and pass a DOM event on", () => {
  const onExpandedResourceIdsChange = vi.fn();
  const mounted = mount({ handlers: { onExpandedResourceIdsChange } });
  const room = createResourceExpansionCommands(mounted.model.interaction, "room-1");
  const read = () => mounted.model.interaction.read().expandedResourceIds;

  const click = new MouseEvent("click");
  room.expand(click);
  room.expand();
  expect(read()).toEqual(["room-1"]);
  expect(onExpandedResourceIdsChange).toHaveBeenCalledTimes(1);
  expect(onExpandedResourceIdsChange.mock.calls[0]![1]).toMatchObject({
    event: click,
    reason: "resource-toggle",
  });

  // A switch's change handler passes a boolean, which reads as no cause.
  room.toggle(false);
  expect(read()).toEqual([]);
  room.collapse();
  expect(onExpandedResourceIdsChange).toHaveBeenCalledTimes(2);
});

test("a bound history keeps its snapshot while the history doesn't change", () => {
  const mounted = mount({ onEventChange: () => undefined });
  const history = createEventHistory<Meeting, string, string>();
  const bound = bindCalendarHistory(mounted.model.interaction, history, () => ({
    events: mounted.model.eventSnapshot,
  }));

  const snapshot = bound.getSnapshot();
  expect(snapshot).toMatchObject({ canRedo: false, canUndo: false, future: [], past: [] });
  expect(bound.getSnapshot()).toBe(snapshot);
  expect(bound.getServerSnapshot?.()).toMatchObject({ canRedo: false, canUndo: false });
  expect(bound.getServerSnapshot?.()?.undo).toBe(snapshot.undo);
});

test("history keys act inside their scope, not in a field, during a gesture or after cleanup", () => {
  const { keyboard, pointerDraft } = mount({ onEventChange: () => undefined }).model.interaction;
  const scope = document.createElement("div");
  const cell = document.createElement("button");
  const field = document.createElement("input");
  const outside = document.createElement("button");
  scope.append(cell, field);
  document.body.append(scope, outside);
  const history = { redo: vi.fn(), undo: vi.fn() };
  const stop = attachCalendarHistoryShortcuts({ keyboard, pointerDraft }, () => ({
    history,
    scope,
  }));
  const press = (target: Element, init: KeyboardEventInit) => {
    const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  };

  // jsdom's platform isn't Apple's, so Mod is Ctrl.
  expect(press(cell, { ctrlKey: true, key: "z" }).defaultPrevented).toBe(true);
  expect(history.undo).toHaveBeenCalledWith({ input: "keyboard" });
  press(cell, { ctrlKey: true, key: "y" });
  expect(history.redo).toHaveBeenCalledTimes(1);

  press(outside, { ctrlKey: true, key: "z" });
  press(field, { ctrlKey: true, key: "z" });
  pointerDraft.set({
    eventId: "meeting-1",
    proposed: {
      end: instant("2026-08-15T11:00:00Z"),
      kind: "timed",
      resourceIds: [],
      start: instant("2026-08-15T10:00:00Z"),
    },
  });
  press(cell, { ctrlKey: true, key: "z" });
  pointerDraft.set(null);
  stop();
  press(cell, { ctrlKey: true, key: "z" });

  expect(history.undo).toHaveBeenCalledTimes(1);
});
