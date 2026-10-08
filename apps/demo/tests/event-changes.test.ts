import type { CalendarEventPlacement } from "@moltenship/calendar";
import { describe, expect, test } from "vite-plus/test";

import { applyEventChange, demoEventPolicy } from "../src/event-changes";
import { createSeedEvents } from "../src/seed";

const events = createSeedEvents(Temporal.PlainDate.from("2026-10-08"), "UTC");
function timedSeedEvent(title: string) {
  const found = events.find((candidate) => candidate.title === title);
  if (found?.kind !== "timed") throw new Error(`the seed has a timed "${title}"`);
  return found;
}

const event = timedSeedEvent("Design review");
const original = { end: event.end, kind: "timed", resourceIds: [], start: event.start } as const;
const others = events.filter(({ id }) => id !== event.id);

function update(proposed: CalendarEventPlacement<never>) {
  return { cause: "move", event, eventId: event.id, id: "move", original, proposed } as const;
}

describe("event changes", () => {
  test("move a timed event and keep everything else", () => {
    const start = Temporal.Instant.from("2026-10-09T14:00:00Z");
    const end = Temporal.Instant.from("2026-10-09T15:30:00Z");
    const next = applyEventChange(events, update({ end, kind: "timed", resourceIds: [], start }));
    const moved = next.find(({ id }) => id === event.id);

    expect(moved).toMatchObject({ description: "Calendar views v2", title: "Design review" });
    expect([String(moved?.start), String(moved?.end)]).toEqual([String(start), String(end)]);
    expect(next.filter(({ id }) => id !== event.id)).toEqual(others);
  });

  test("turn a timed event into an all-day one", () => {
    const start = Temporal.PlainDate.from("2026-10-10");
    const next = applyEventChange(
      events,
      update({ end: start.add({ days: 1 }), kind: "all-day", resourceIds: [], start }),
    );

    expect(next.find(({ id }) => id === event.id)?.kind).toBe("all-day");
  });

  test("delete an event", () => {
    const next = applyEventChange(events, {
      cause: "delete",
      event,
      eventId: event.id,
      id: "delete",
      original,
      proposed: null,
    });

    expect(next).toEqual(others);
  });

  test("the policy rejects creates and floating times and accepts the rest", () => {
    const floating = Temporal.PlainDateTime.from("2026-10-09T09:00");
    const create = {
      cause: "create",
      event: null,
      eventId: null,
      id: "create",
      original: null,
      proposed: original,
    } as const;
    const floatingMove = update({
      end: floating.add({ hours: 1 }),
      kind: "floating",
      resourceIds: [],
      start: floating,
    });

    expect(demoEventPolicy(create).type).toBe("reject");
    expect(demoEventPolicy(floatingMove).type).toBe("reject");
    expect(demoEventPolicy(update(original))).toEqual({ type: "accept" });
  });
});
