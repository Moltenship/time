import { describe, expect, test } from "vite-plus/test";

import {
  boundsPolicy,
  createCanonicalEventAdapter,
  createEventSnapshot,
  minimumDurationPolicy,
  readOnlyPolicy,
  snapPolicy,
  type CalendarEvent,
  type CalendarEventChange,
  type CalendarEventPlacement,
  type CalendarPolicy,
  type CalendarPolicyContext,
  type CalendarPolicyDecision,
} from "../src/index";
import { runEventPolicies } from "../src/policies/pipeline";

type TestEvent = CalendarEvent<null, string, string>;
type Change = CalendarEventChange<TestEvent, string, string>;
type Policy = CalendarPolicy<TestEvent, string, string>;

const timeZone = "America/New_York";

function zoned(value: string, zone = timeZone): Temporal.ZonedDateTime {
  return Temporal.ZonedDateTime.from(`${value}[${zone}]`);
}

function timed(start: string, end: string, zone = timeZone): CalendarEventPlacement<string> {
  return {
    end: zoned(end, zone).toInstant(),
    kind: "timed",
    resourceIds: [],
    start: zoned(start, zone).toInstant(),
  };
}

const events: readonly TestEvent[] = [
  {
    data: null,
    id: "open",
    title: "Open",
    ...timed("2026-08-15T09:00", "2026-08-15T10:00"),
  },
  {
    data: null,
    id: "locked",
    title: "Locked",
    ...timed("2026-08-15T11:00", "2026-08-15T12:00"),
  },
];

const context: CalendarPolicyContext<TestEvent, string, string> = {
  events: createEventSnapshot(events, {
    ...createCanonicalEventAdapter<null, string, string>(),
    isReadOnly: (event) => event.id === "locked",
  }),
  timeZone,
};

function change(
  cause: Change["cause"],
  proposed: CalendarEventPlacement<string> | null,
  eventId = "open",
): Change {
  if (cause === "create") {
    return { cause, event: null, eventId: null, id: "change", original: null, proposed: proposed! };
  }
  const event = events.find(({ id }) => id === eventId)!;
  const original = timed("2026-08-15T09:00", "2026-08-15T10:00");
  return cause === "delete"
    ? { cause, event, eventId, id: "change", original, proposed: null }
    : { cause, event, eventId, id: "change", original, proposed: proposed! };
}

function decide(policy: Policy, value: Change) {
  return policy(value, context) as CalendarPolicyDecision<string>;
}

function localRange(placement: CalendarEventPlacement<string> | null) {
  if (placement?.kind !== "timed") return String(placement?.kind);
  const local = (instant: Temporal.Instant) =>
    instant.toZonedDateTimeISO(timeZone).toPlainTime().toString({ smallestUnit: "minute" });
  return `${local(placement.start)}-${local(placement.end)}`;
}

function wall(decision: CalendarPolicyDecision<string>) {
  return decision.type === "adjust" ? localRange(decision.proposed) : decision.type;
}

describe("policy pipeline", () => {
  test("runs policies in order, each seeing the previous adjustment", () => {
    const seen: string[] = [];
    const shiftEnd: Policy = (current) => {
      seen.push(`shift:${String(current.proposed?.end)}`);
      return current.proposed?.kind === "timed"
        ? {
            proposed: { ...current.proposed, end: current.proposed.end.add({ minutes: 30 }) },
            type: "adjust",
          }
        : { type: "accept" };
    };
    const record: Policy = (current) => {
      seen.push(`record:${String(current.proposed?.end)}`);
      return { type: "accept" };
    };

    const result = runEventPolicies(
      change("move", timed("2026-08-15T13:00", "2026-08-15T14:00")),
      [shiftEnd, record],
      context,
    );
    expect(result).not.toBeInstanceOf(Promise);
    expect(seen).toEqual(["shift:2026-08-15T18:00:00Z", "record:2026-08-15T18:30:00Z"]);
    expect(result).toMatchObject({ change: { id: "change" }, status: "accepted" });
  });

  test("stops at the first rejection", () => {
    let laterCalls = 0;
    const result = runEventPolicies(
      change("move", timed("2026-08-15T13:00", "2026-08-15T14:00")),
      [() => ({ reason: "closed", type: "reject" }), () => ((laterCalls += 1), { type: "accept" })],
      context,
    );
    expect(result).toMatchObject({ reason: "closed", status: "rejected" });
    expect(laterCalls).toBe(0);
  });

  test("continues asynchronously once a policy returns a promise", async () => {
    const order: string[] = [];
    const result = runEventPolicies(
      change("create", timed("2026-08-15T13:07", "2026-08-15T13:52")),
      [
        () => (order.push("sync"), { type: "accept" }),
        async () => (order.push("async"), { type: "accept" }),
        snapPolicy({ minutes: 15 }),
      ],
      context,
    );
    expect(result).toBeInstanceOf(Promise);
    const settled = await result;
    expect(order).toEqual(["sync", "async"]);
    expect(settled.status).toBe("accepted");
    expect(localRange(settled.change.proposed)).toBe("13:00-13:45");
  });

  test("refuses to adjust a deletion", () => {
    expect(() =>
      runEventPolicies(
        change("delete", null),
        [() => ({ proposed: timed("2026-08-15T13:00", "2026-08-15T14:00"), type: "adjust" })],
        context,
      ),
    ).toThrow(TypeError);
  });
});

describe("built-in policies", () => {
  test("read-only rejects changes to read-only events only", () => {
    const policy = readOnlyPolicy<TestEvent, string, string>();
    const proposed = timed("2026-08-15T13:00", "2026-08-15T14:00");
    expect(decide(policy, change("move", proposed, "locked"))).toEqual({
      reason: "read-only",
      type: "reject",
    });
    expect(decide(policy, change("delete", null, "locked"))).toMatchObject({ type: "reject" });
    expect(decide(policy, change("move", proposed))).toEqual({ type: "accept" });
    expect(decide(policy, change("create", proposed))).toEqual({ type: "accept" });
  });

  test("bounds rejects placements outside the half-open range", () => {
    const policy = boundsPolicy<TestEvent, string, string>({
      end: zoned("2026-08-16T00:00").toInstant(),
      start: zoned("2026-08-15T08:00").toInstant(),
    });
    expect(decide(policy, change("move", timed("2026-08-15T08:00", "2026-08-16T00:00")))).toEqual({
      type: "accept",
    });
    expect(decide(policy, change("move", timed("2026-08-15T07:45", "2026-08-15T09:00")))).toEqual({
      reason: "out-of-bounds",
      type: "reject",
    });
    expect(
      decide(policy, change("move", timed("2026-08-15T23:30", "2026-08-16T00:30"))),
    ).toMatchObject({ type: "reject" });

    const allDay = (start: string, end: string): CalendarEventPlacement<string> => ({
      end: Temporal.PlainDate.from(end),
      kind: "all-day",
      resourceIds: [],
      start: Temporal.PlainDate.from(start),
    });
    // The all-day start resolves to midnight in the display zone, before the 08:00 bound.
    expect(decide(policy, change("move", allDay("2026-08-15", "2026-08-16")))).toMatchObject({
      type: "reject",
    });
    expect(decide(policy, change("delete", null))).toEqual({ type: "accept" });
  });

  test("minimum duration extends the end, or the start for start resizes", () => {
    const policy = minimumDurationPolicy<TestEvent, string, string>({ minutes: 30 });
    const short = timed("2026-08-15T09:00", "2026-08-15T09:10");
    expect(wall(decide(policy, change("create", short)))).toBe("09:00-09:30");
    expect(wall(decide(policy, change("resize-start", short)))).toBe("08:40-09:10");
    expect(decide(policy, change("move", timed("2026-08-15T09:00", "2026-08-15T09:30")))).toEqual({
      type: "accept",
    });
    expect(() => minimumDurationPolicy({ minutes: 0 })).toThrow(RangeError);
  });

  test("snap rounds on the display zone's wall clock", () => {
    const policy = snapPolicy<TestEvent, string, string>({ minutes: 15 });
    expect(
      wall(decide(policy, change("create", timed("2026-08-15T09:07", "2026-08-15T09:52")))),
    ).toBe("09:00-09:45");
    // Moves keep their duration; resizes snap only the dragged edge.
    expect(
      wall(decide(policy, change("move", timed("2026-08-15T09:07", "2026-08-15T10:00")))),
    ).toBe("09:00-09:53");
    expect(
      wall(decide(policy, change("resize-end", timed("2026-08-15T09:07", "2026-08-15T10:05")))),
    ).toBe("09:07-10:00");
    expect(decide(policy, change("create", timed("2026-08-15T09:00", "2026-08-15T09:15")))).toEqual(
      { type: "accept" },
    );
    // Snapping would empty this event, so it is left as proposed.
    expect(decide(policy, change("create", timed("2026-08-15T09:01", "2026-08-15T09:05")))).toEqual(
      { type: "accept" },
    );
    expect(() => snapPolicy({ minutes: 45 })).toThrow(RangeError);
  });

  test("snap uses the display zone rather than UTC", () => {
    const kolkata = "Asia/Kolkata";
    const policy = snapPolicy<TestEvent, string, string>({ hours: 1 });
    const decision = policy(
      change("create", timed("2026-08-15T09:20", "2026-08-15T10:20", kolkata)),
      {
        ...context,
        timeZone: kolkata,
      },
    ) as CalendarPolicyDecision<string>;
    expect(decision.type).toBe("adjust");
    if (decision.type === "adjust" && decision.proposed.kind === "timed") {
      expect(decision.proposed.start.toZonedDateTimeISO(kolkata).toPlainTime().toString()).toBe(
        "09:00:00",
      );
    }
  });
});
