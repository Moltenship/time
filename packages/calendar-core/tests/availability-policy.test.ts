import { describe, expect, test, vi } from "vite-plus/test";

import {
  availabilityPolicy,
  createAvailabilitySnapshot,
  createCanonicalEventAdapter,
  createEventSnapshot,
  createEventTransactions,
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
const time = (value: string) => Temporal.PlainTime.from(value);
const date = (value: string) => Temporal.PlainDate.from(value);

function timed(
  start: string,
  end: string,
  resourceIds: readonly string[] = [],
  zone = timeZone,
): Extract<CalendarEventPlacement<string>, { readonly kind: "timed" }> {
  const at = (value: string) => Temporal.ZonedDateTime.from(`${value}[${zone}]`).toInstant();
  return { end: at(end), kind: "timed", resourceIds, start: at(start) };
}

const availability = createAvailabilitySnapshot({
  availability: {
    exceptions: [{ date: date("2026-10-09"), label: "Offsite" }],
    weekly: [{ days: [1, 2, 3, 4, 5], end: time("17:00"), start: time("09:00") }],
  },
  resources: [
    { id: "london", timeZone: "Europe/London" },
    {
      availability: {
        weekly: [{ days: [1, 2, 3, 4, 5, 6, 7], end: time("00:00"), start: time("00:00") }],
      },
      id: "always",
    },
  ],
  timeZone,
});

const placements: Readonly<Record<string, CalendarEventPlacement<string>>> = {
  evening: timed("2026-10-08T19:00", "2026-10-08T20:00"),
  late: timed("2026-10-08T19:00", "2026-10-08T20:00", ["always"]),
  standup: timed("2026-10-08T09:00", "2026-10-08T10:00"),
};
const events: readonly TestEvent[] = Object.entries(placements).map(([id, placement]) => ({
  data: null,
  id,
  title: id,
  ...placement,
}));
const context: CalendarPolicyContext<TestEvent, string, string> = {
  availability,
  events: createEventSnapshot(events, createCanonicalEventAdapter<null, string, string>()),
  timeZone,
};

function change(
  cause: Change["cause"],
  proposed: CalendarEventPlacement<string> | null,
  eventId = "standup",
): Change {
  if (cause === "create") {
    return { cause, event: null, eventId: null, id: "change", original: null, proposed: proposed! };
  }
  const event = events.find(({ id }) => id === eventId)!;
  const original = placements[eventId]!;
  return cause === "delete"
    ? { cause, event, eventId, id: "change", original, proposed: null }
    : { cause, event, eventId, id: "change", original, proposed: proposed! };
}

function decide(policy: Policy, value: Change, overrides: Partial<typeof context> = {}) {
  return policy(value, { ...context, ...overrides }) as CalendarPolicyDecision<string>;
}

const block = availabilityPolicy<TestEvent, string, string>();
const warn = availabilityPolicy<TestEvent, string, string>({ mode: "warn" });
const outside = { reason: "outside-availability", type: "reject" } as const;

describe("availability policy", () => {
  test("blocks timed changes that leave the calendar's hours, and warns in warn mode", () => {
    const evening = timed("2026-10-08T16:30", "2026-10-08T17:30");
    expect(decide(block, change("move", evening))).toEqual(outside);
    expect(decide(warn, change("move", evening))).toEqual({ ...outside, type: "warn" });
    expect(decide(block, change("move", timed("2026-10-08T16:00", "2026-10-08T17:00")))).toEqual({
      type: "accept",
    });
    expect(decide(block, change("create", evening))).toEqual(outside);
    expect(decide(block, change("resize-end", evening))).toEqual(outside);
    // A closed exception date.
    expect(decide(block, change("move", timed("2026-10-09T10:00", "2026-10-09T11:00")))).toEqual(
      outside,
    );
  });

  test("checks each booked resource on its own time zone", () => {
    // 09:00 in New York is 14:00 in London: inside its hours. 13:00 is 18:00 there: outside.
    expect(
      decide(block, change("move", timed("2026-10-08T09:00", "2026-10-08T10:00", ["london"]))),
    ).toEqual({ type: "accept" });
    expect(
      decide(block, change("move", timed("2026-10-08T13:00", "2026-10-08T14:00", ["london"]))),
    ).toEqual(outside);
    // Every booked resource must be free.
    expect(
      decide(
        block,
        change("move", timed("2026-10-08T19:00", "2026-10-08T20:00", ["always", "london"])),
      ),
    ).toEqual(outside);
    expect(
      decide(block, change("move", timed("2026-10-08T19:00", "2026-10-08T20:00", ["always"]))),
    ).toEqual({ type: "accept" });
  });

  test("only checks what a change alters, and lets deletes through", () => {
    // Still outside the calendar's hours, at the same time: only the added resource is checked.
    const late = timed("2026-10-08T19:00", "2026-10-08T20:00", ["always", "london"]);
    expect(decide(block, change("update", late, "late"))).toEqual(outside);
    const unassigned = timed("2026-10-08T19:00", "2026-10-08T20:00");
    // Moving to the unassigned bucket brings in the calendar's hours.
    expect(decide(block, change("move", unassigned, "late"))).toEqual(outside);
    expect(
      decide(
        block,
        change("update", timed("2026-10-08T19:00", "2026-10-08T20:00", ["always"]), "late"),
      ),
    ).toEqual({ type: "accept" });
    expect(decide(block, change("delete", null, "late"))).toEqual({ type: "accept" });
    // A new source time zone keeps the instants, so an event outside the hours stays editable.
    expect(
      decide(
        block,
        change(
          "update",
          { ...timed("2026-10-08T19:00", "2026-10-08T20:00"), sourceTimeZone: "Europe/London" },
          "evening",
        ),
      ),
    ).toEqual({ type: "accept" });
  });

  test("all-day changes need open time on every date, and floating ones read the display wall clock", () => {
    const allDay = (start: string, end: string): CalendarEventPlacement<string> => ({
      end: date(end),
      kind: "all-day",
      resourceIds: [],
      start: date(start),
    });
    expect(decide(block, change("move", allDay("2026-10-07", "2026-10-09")))).toEqual({
      type: "accept",
    });
    expect(decide(block, change("move", allDay("2026-10-08", "2026-10-10")))).toEqual(outside);
    expect(decide(block, change("move", allDay("2026-10-10", "2026-10-11")))).toEqual(outside);

    const floating = (start: string, end: string): CalendarEventPlacement<string> => ({
      end: Temporal.PlainDateTime.from(end),
      kind: "floating",
      resourceIds: [],
      start: Temporal.PlainDateTime.from(start),
    });
    expect(decide(block, change("move", floating("2026-10-08T09:00", "2026-10-08T10:00")))).toEqual(
      { type: "accept" },
    );
    expect(decide(block, change("move", floating("2026-10-08T08:00", "2026-10-08T10:00")))).toEqual(
      outside,
    );
    // On the spring-forward Sunday, 02:30 never happens: the range starts when the clock jumps
    // to 03:00, and one wholly inside the skipped hour takes no time.
    const always = createAvailabilitySnapshot({ availability: {}, timeZone });
    const acrossGap = change("create", floating("2026-03-08T02:30", "2026-03-08T03:15"));
    expect(decide(warn, acrossGap, { availability: always })).toEqual({ type: "accept" });
    expect(decide(block, acrossGap)).toEqual(outside);
    expect(
      decide(block, change("create", floating("2026-03-08T02:15", "2026-03-08T02:45"))),
    ).toEqual({ type: "accept" });
  });

  test("an all-day date open only in its repeated hour after midnight fits", () => {
    // St. John's fell back from 00:01 NDT to 23:01 NST, so November 1's first minute includes
    // October 31's repeated hour.
    const stJohns = "America/St_Johns";
    const repeatOnly = createAvailabilitySnapshot({
      availability: {
        exceptions: [
          { date: date("2009-11-01"), hours: [{ end: time("00:01"), start: time("00:00") }] },
        ],
        weekly: [],
      },
      timeZone: stJohns,
    });
    const october31 = change("create", {
      end: date("2009-11-01"),
      kind: "all-day",
      resourceIds: [],
      start: date("2009-10-31"),
    });
    expect(decide(block, october31, { availability: repeatOnly, timeZone: stJohns })).toEqual({
      type: "accept",
    });
  });

  test("accepts everything without availability", () => {
    const evening = change("move", timed("2026-10-08T22:00", "2026-10-08T23:00"));
    expect(decide(block, evening, { availability: undefined })).toEqual({ type: "accept" });
    expect(
      decide(block, evening, {
        availability: createAvailabilitySnapshot({ timeZone }),
      }),
    ).toEqual({ type: "accept" });
  });
});

describe("warnings", () => {
  test("a warning lets the change through and flags it once", () => {
    const flag: Policy = () => ({ reason: "outside-availability", type: "warn" });
    const result = runEventPolicies(
      change("move", timed("2026-10-08T18:00", "2026-10-08T19:00")),
      [flag, warn, () => ({ type: "accept" })],
      context,
    );
    expect(result).toMatchObject({
      change: { warnings: ["outside-availability"] },
      status: "accepted",
    });
  });

  test("transactions hand a warned change to the handler and check proposals without saving them", async () => {
    const snapshot = createEventSnapshot(
      events,
      createCanonicalEventAdapter<null, string, string>(),
    );
    const transactions = createEventTransactions<TestEvent, string, string>();
    const onEventChange = vi.fn();
    const evening = timed("2026-10-08T18:00", "2026-10-08T19:00");
    const proposal = { cause: "move", eventId: "standup", proposed: evening } as const;
    const base = { availability, snapshot, timeZone };

    expect(transactions.check(proposal, { ...base, policies: [block] })).toMatchObject({
      reason: "outside-availability",
      status: "rejected",
    });
    expect(transactions.check(proposal, { ...base, policies: [warn] })).toMatchObject({
      change: { warnings: ["outside-availability"] },
      status: "accepted",
    });
    expect(
      transactions.check({ ...proposal, eventId: "missing" }, { ...base, policies: [block] }),
    ).toBeNull();
    expect(
      transactions.check(proposal, { ...base, policies: [async () => ({ type: "accept" })] }),
    ).toBeNull();
    // An adjustment that empties the placement is rejected, as committing it would be.
    const emptied: Policy = ({ proposed }) => ({
      proposed: { ...proposed!, end: proposed!.start } as CalendarEventPlacement<string>,
      type: "adjust",
    });
    expect(transactions.check(proposal, { ...base, policies: [emptied] })).toMatchObject({
      reason: "invalid-placement",
      status: "rejected",
    });
    expect(transactions.getPending().size).toBe(0);
    expect(onEventChange).not.toHaveBeenCalled();

    expect(
      await transactions.propose(proposal, { ...base, onEventChange, policies: [block] }),
    ).toMatchObject({ reason: "outside-availability", status: "rejected" });
    expect(onEventChange).not.toHaveBeenCalled();
    expect(
      await transactions.propose(proposal, { ...base, onEventChange, policies: [warn] }),
    ).toMatchObject({ change: { warnings: ["outside-availability"] }, status: "committed" });
    expect(onEventChange).toHaveBeenCalledWith(
      expect.objectContaining({ proposed: evening, warnings: ["outside-availability"] }),
    );
  });

  test("checks see the events proposals see, once new events replace a saved change", async () => {
    const adapter = createCanonicalEventAdapter<null, string, string>();
    const transactions = createEventTransactions<TestEvent, string, string>();
    const evening = timed("2026-10-08T19:00", "2026-10-08T20:00");
    const move = { cause: "move", eventId: "standup", proposed: evening } as const;
    const before = createEventSnapshot(events, adapter);
    // Saved, but the application's events don't show it yet, so it stays pending.
    await transactions.propose(move, {
      availability,
      onEventChange: () => Promise.resolve(),
      snapshot: before,
      timeZone,
    });
    expect(transactions.getPending().get("standup")).toEqual(evening);

    // The application moved the standup to 11:00 instead.
    const after = createEventSnapshot(
      events.map((event) =>
        event.id === "standup"
          ? { ...event, ...timed("2026-10-08T11:00", "2026-10-08T12:00") }
          : event,
      ),
      adapter,
    );
    const context = { availability, policies: [block], snapshot: after, timeZone };
    expect(transactions.check(move, context)).toMatchObject({
      reason: "outside-availability",
      status: "rejected",
    });
    expect(await transactions.propose(move, { ...context, onEventChange: () => {} })).toMatchObject(
      { reason: "outside-availability", status: "rejected" },
    );
  });
});
