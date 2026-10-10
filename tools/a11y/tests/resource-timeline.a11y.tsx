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

describe.each(themes)("resource timeline, %s theme", (theme) => {
  test.each(Object.keys(spans) as (keyof typeof spans)[])("%s", async (span) => {
    setTheme(theme);
    const [start, end] = spans[span];
    await render(
      <div className="h-[600px]">
        <ResourceTimelineGrid
          environment={{
            direction: "ltr",
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
      </div>,
    );

    expect(document.querySelectorAll('[role="row"][data-resource-id]').length).toBeGreaterThan(0);
    expect(await seriousViolations()).toEqual([]);
  });
});
