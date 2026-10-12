import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
  type CalendarResource,
  type OverlapLayout,
} from "@moltenship/calendar";
import { act } from "react";
import { describe, expect, test, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { createResourceColumnsView } from "@registry/resource-columns-view/resource-columns-view";
import { createWeekView } from "@registry/time-grid-view/time-grid-view";
import { TooltipProvider } from "@registry/ui/tooltip";

import { seriousViolations, setTheme, themes } from "./axe";
import { render } from "./render";

type Fixture = CalendarEvent<{ readonly color: CalendarEventColor }, string>;

const getEventColor = (event: Fixture) => event.data.color;
const Calendar = createCalendar<Fixture, CalendarResource<null>>()({
  eventAdapter: createCanonicalEventAdapter<{ readonly color: CalendarEventColor }, string>(),
  views: [
    createWeekView<Fixture>({ getEventColor }),
    createResourceColumnsView<Fixture>({ getEventColor }),
  ],
});

const policies = ["columns", "equal", "stack"] as const satisfies readonly OverlapLayout[];
const resources: readonly CalendarResource<null>[] = [
  { data: null, id: "ada", title: "Ada" },
  { data: null, id: "grace", title: "Grace" },
];

function timed(color: CalendarEventColor, title: string, start: string, end: string) {
  return {
    data: { color },
    end: Temporal.Instant.from(`2026-10-08T${end}:00Z`),
    id: title,
    kind: "timed",
    resourceIds: ["ada"],
    start: Temporal.Instant.from(`2026-10-08T${start}:00Z`),
    title,
  } as const;
}

/**
 * A busy Thursday for Ada: a workshop under a talk and a call, three reviews at once, and a
 * half-hour meeting whose title can't fit.
 */
const events: readonly Fixture[] = [
  timed("blue", "Workshop", "09:00", "12:00"),
  timed("green", "Talk", "09:30", "10:30"),
  timed("orange", "Call", "10:00", "10:30"),
  timed("purple", "Review 1", "13:00", "14:00"),
  timed("red", "Review 2", "13:00", "14:00"),
  timed("teal", "Review 3", "13:00", "14:00"),
  timed("green", "Quarterly planning with the infrastructure and platform teams", "16:00", "16:30"),
];

function OverlapScreen({
  dir,
  onEventChange,
  overlapLayout,
  view = "week",
}: {
  readonly dir?: "ltr" | "rtl";
  readonly onEventChange?: () => void;
  readonly overlapLayout: OverlapLayout;
  readonly view?: "resources" | "week";
}) {
  return (
    <TooltipProvider>
      <Calendar.Root
        defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
        defaultTimeZone="UTC"
        defaultView={view}
        events={events}
        locale="en-US"
        now={Temporal.Instant.from("2026-10-08T08:30:00Z")}
        onEventChange={onEventChange}
        resources={resources}
        viewOptions={{ resources: { overlapLayout }, week: { overlapLayout } }}
        weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
      >
        <Calendar.Frame className="flex h-dvh flex-col" dir={dir}>
          <Calendar.Viewport className="min-h-0 flex-1">
            <Calendar.ActiveView />
          </Calendar.Viewport>
        </Calendar.Frame>
      </Calendar.Root>
    </TooltipProvider>
  );
}

const eventElement = (title: string) =>
  document.querySelector<HTMLElement>(`[data-slot="time-grid-body"] [data-event-id="${title}"]`)!;
/** The event drawn on top at a viewport point. */
const eventAt = (x: number, y: number) =>
  document.elementFromPoint(x, y)?.closest("[data-event-id]") ?? null;

describe.each(themes)("overlap layouts, %s theme", (theme) => {
  test.each(
    policies.flatMap((policy) =>
      (["week", "resources"] as const).map((view) => [policy, view] as const),
    ),
  )("%s layout in the %s view", async (overlapLayout, view) => {
    setTheme(theme);
    await render(<OverlapScreen overlapLayout={overlapLayout} view={view} />);

    expect(document.querySelectorAll('[data-event-id="Review 3"]')).toHaveLength(1);
    expect(await seriousViolations()).toEqual([]);
  });
});

describe.each(policies)("%s layout", (overlapLayout) => {
  /** Each event's distance from the inline start and end of the area events share, in pixels. */
  function insets(dir: "ltr" | "rtl") {
    return Object.fromEntries(
      events.map(({ title }) => {
        const event = eventElement(title);
        const box = event.getBoundingClientRect();
        const area = event.parentElement!.getBoundingClientRect();
        const [start, end] =
          dir === "ltr"
            ? [box.left - area.left, area.right - box.right]
            : [area.right - box.right, box.left - area.left];
        return [title, [Math.round(start), Math.round(end)]];
      }),
    );
  }

  test("mirrors right to left", async () => {
    await render(<OverlapScreen overlapLayout={overlapLayout} />);
    const ltr = insets("ltr");
    await render(<OverlapScreen dir="rtl" overlapLayout={overlapLayout} />);

    expect(insets("rtl")).toEqual(ltr);
    // The first event of each group starts at the inline start under every layout.
    expect(ltr["Workshop"]![0]).toBe(0);
    expect(ltr["Review 1"]![0]).toBe(0);
  });
});

describe.each(["ltr", "rtl"] as const)("stacked events, %s", (dir) => {
  test("each later event is indented past the one under it and drawn on top", async () => {
    await render(<OverlapScreen dir={dir} overlapLayout="stack" />);
    const workshop = eventElement("Workshop").getBoundingClientRect();
    const talk = eventElement("Talk").getBoundingClientRect();
    const indent = dir === "ltr" ? talk.left - workshop.left : workshop.right - talk.right;
    const area = eventElement("Workshop").parentElement!.getBoundingClientRect();

    expect(indent).toBeCloseTo(0.15 * area.width, 0);
    // Both reach the inline end; the talk covers the workshop where they overlap.
    expect(dir === "ltr" ? talk.right : talk.left).toBeCloseTo(
      dir === "ltr" ? workshop.right : workshop.left,
      0,
    );
    expect(eventAt(talk.x + talk.width / 2, talk.y + 8)).toBe(eventElement("Talk"));
  });

  test("a covered event rises while hovered or focused, so its title shows", async () => {
    await render(<OverlapScreen dir={dir} overlapLayout="stack" />);
    const reviews = ["Review 1", "Review 2", "Review 3"].map(eventElement);
    const first = reviews[0]!;
    const box = first.getBoundingClientRect();
    // The middle of its title line, under the other two reviews.
    const title = [box.x + box.width / 2, box.y + 8] as const;
    expect(eventAt(...title)).toBe(reviews[2]);

    // Its visible strip at the inline start.
    await userEvent.hover(first, { position: { x: dir === "ltr" ? 4 : box.width - 4, y: 8 } });
    expect(getComputedStyle(first).zIndex).toBe("10");
    expect(eventAt(...title)).toBe(first);
    await userEvent.unhover(first);

    await act(async () => reviews[1]!.focus());
    expect(eventAt(...title)).toBe(reviews[1]);
  });

  test("a focused event stays over one the pointer rests on", async () => {
    await render(<OverlapScreen dir={dir} overlapLayout="stack" />);
    const reviews = ["Review 1", "Review 2", "Review 3"].map(eventElement);
    const box = reviews[0]!.getBoundingClientRect();
    const title = [box.x + box.width / 2, box.y + 8] as const;

    // The pointer rests on the top review while the keyboard focuses the one under it.
    await userEvent.hover(reviews[2]!);
    await act(async () => reviews[0]!.focus());

    expect(eventAt(...title)).toBe(reviews[0]);
    await userEvent.unhover(reviews[2]!);
  });

  test("an event whose title doesn't fit shows it in full while hovered or focused", async () => {
    await render(<OverlapScreen dir={dir} overlapLayout="stack" />);
    const long = eventElement("Quarterly planning with the infrastructure and platform teams");
    const tooltip = () => document.querySelector('[data-slot="tooltip-content"]');

    await userEvent.hover(eventElement("Review 3"));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(tooltip()).toBeNull();

    await userEvent.hover(long);
    await vi.waitFor(() =>
      expect(tooltip()?.textContent).toBe(
        "Quarterly planning with the infrastructure and platform teams",
      ),
    );
    expect(await seriousViolations()).toEqual([]);
    await userEvent.unhover(long);
    await vi.waitFor(() => expect(tooltip()).toBeNull());

    await act(async () => long.focus());
    await vi.waitFor(() => expect(tooltip()).not.toBeNull());
  });

  test("Escape still reaches the calendar while the title tooltip is open", async () => {
    const onEventChange = vi.fn();
    await render(<OverlapScreen dir={dir} onEventChange={onEventChange} overlapLayout="stack" />);
    const title = "Quarterly planning with the infrastructure and platform teams";
    // Open, not on its way out: a closing tooltip stays in the page while it fades.
    const tooltip = () => document.querySelector('[data-slot="tooltip-content"][data-open]');

    // Picked up and moved, Escape cancels the move.
    await act(async () => eventElement(title).focus());
    await vi.waitFor(() => expect(tooltip()).not.toBeNull());
    await userEvent.keyboard(" ");
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard("{Enter}");
    expect(document.querySelector("[data-grabbed]")).toBeNull();
    expect(onEventChange).not.toHaveBeenCalled();

    // Focused, Escape leaves the event for the slot it starts in. The gesture closed the tooltip
    // and the event kept focus, so focus comes back to it to open the tooltip again.
    await act(async () => eventElement(title).blur());
    await act(async () => eventElement(title).focus());
    await vi.waitFor(() => expect(tooltip()).not.toBeNull());
    await userEvent.keyboard("{Escape}");
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Thursday, October 8 at 4:00 PM",
    );
  });
});
