import { plainDateInterval } from "@moltenship/calendar";
import { describe, expect, test } from "vite-plus/test";

import { ResourceTimelineGrid } from "@registry/resource-timeline-view/resource-timeline-grid";

import { seriousViolations, setTheme, themes } from "./axe";
import { render } from "./render";

/** Ten sites of four rooms, the second site collapsed. */
const rows = Array.from({ length: 10 }, (_, site) => {
  const expanded = site !== 1;
  return [
    { depth: 0, expanded, id: `site-${site}`, title: `Site ${site + 1}` },
    ...(expanded
      ? Array.from({ length: 4 }, (_, room) => ({
          depth: 1,
          id: `site-${site}-room-${room}`,
          title: `Room ${site + 1}.${room + 1}`,
        }))
      : []),
  ];
}).flat();

const spans = {
  day: ["2026-10-08", "2026-10-09"],
  month: ["2026-10-01", "2026-11-01"],
  week: ["2026-10-05", "2026-10-12"],
} as const;

function Timeline({
  direction = "ltr",
  range: [start, end],
}: {
  readonly direction?: "ltr" | "rtl";
  readonly range: readonly [string, string];
}) {
  return (
    <div className="h-[600px] w-[1000px]">
      <ResourceTimelineGrid
        environment={{
          direction,
          disambiguation: "compatible",
          locale: "en-US",
          timeZone: "UTC",
          weekRules: { firstDay: 1, minimalDays: 4, weekend: [6, 7] },
        }}
        label="Resource timeline"
        onToggleResource={() => {}}
        range={plainDateInterval(Temporal.PlainDate.from(start), Temporal.PlainDate.from(end))}
        rows={rows}
        today={Temporal.PlainDate.from("2026-10-08")}
      />
    </div>
  );
}

describe.each(themes)("resource timeline, %s theme", (theme) => {
  test.each(Object.keys(spans) as (keyof typeof spans)[])("%s", async (span) => {
    setTheme(theme);
    await render(<Timeline range={spans[span]} />);

    expect(document.querySelectorAll('[role="row"][data-resource-id]').length).toBeGreaterThan(0);
    expect(await seriousViolations()).toEqual([]);
  });
});

test("RTL: hours run from the right, behind a resource column that stays there", async () => {
  await render(<Timeline direction="rtl" range={spans.day} />);
  const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
  const hour = (label: string) => box(`[role="columnheader"][aria-label$=" at ${label}"]`);
  const grid = box('[role="grid"]');
  const viewport = document.querySelector<HTMLElement>('[data-slot="resource-timeline-viewport"]')!;

  expect(box('[role="rowheader"]').right).toBe(grid.right);
  expect(hour("1:00 AM").right).toBe(hour("12:00 AM").left);
  expect(document.querySelector('[aria-label$=" at 9:00 AM"]')?.textContent).toBe("9 AM");

  viewport.scrollLeft = -300;
  await new Promise((resolve) => requestAnimationFrame(resolve));

  expect(box('[role="rowheader"]').right).toBe(grid.right);
  expect(hour("12:00 AM").right).toBe(grid.right - 208 + 300);
});
