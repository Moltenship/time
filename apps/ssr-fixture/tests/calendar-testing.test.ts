// @vitest-environment jsdom

import {
  HydrationMismatchError,
  cleanup,
  createTestEnvironment,
  hydrateCalendar,
  normalizeText,
} from "@moltenship/calendar-testing";
import { Fragment, createElement } from "react";
import { afterEach, expect, test, vi } from "vite-plus/test";

import {
  FixtureCalendar,
  deterministicEnvironment,
  fixtureEvents,
  fixtureResources,
} from "../src/fixture";

// The fixture's calendar through @moltenship/calendar-testing, as an app's tests would render
// and hydrate it. `vp run release:artifacts` runs this on the dry run's tarballs.

afterEach(cleanup);

const environment = createTestEnvironment({
  anchorDate: deterministicEnvironment.anchorDate,
  locale: deterministicEnvironment.locale,
  now: deterministicEnvironment.now,
  timeZone: deterministicEnvironment.timeZone,
  weekRules: { firstDay: deterministicEnvironment.weekStartsOn, minimalDays: 4, weekend: [6, 7] },
});

const calendarParts = createElement(
  Fragment,
  null,
  createElement(FixtureCalendar.Title),
  createElement(FixtureCalendar.ActiveView),
);

test("the fixture's calendar renders on the server and hydrates without a mismatch", async () => {
  const calendar = await hydrateCalendar(FixtureCalendar, {
    children: calendarParts,
    environment,
    events: fixtureEvents,
    identifierPrefix: deterministicEnvironment.identifierPrefix,
    resources: fixtureResources,
  });

  expect(calendar.recoverableErrors).toEqual([]);
  expect(calendar.serverMarkup).toContain("Fixture event");
  expect(calendar.getEvent("Fixture event").textContent).toBe("Fixture event");
  expect(calendar.state()).toMatchObject({ timeZone: "Asia/Tbilisi", view: "fixture" });
  // Tbilisi is four hours ahead of UTC.
  expect(calendar.placementOf("fixture-event").wallRange).toBe("2026-08-15T13:00/2026-08-15T14:00");
  expect(
    normalizeText(calendar.container.querySelector('[data-calendar-part="title"]')?.textContent),
  ).toBe("Saturday, 15 August 2026");
});

test("a client that renders other text than the server fails with a HydrationMismatchError", async () => {
  let onClient = false;
  function Side() {
    return createElement("p", null, onClient ? "client" : "server");
  }
  // React logs the mismatch too; keep it out of the run's output.
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    // hydrateCalendar renders on the server before its first await, and hydrates after it.
    const hydrated = hydrateCalendar(FixtureCalendar, {
      children: createElement(Side),
      environment,
      events: fixtureEvents,
    });
    onClient = true;
    await expect(hydrated).rejects.toBeInstanceOf(HydrationMismatchError);
    await expect(hydrated).rejects.toThrow(/Hydration/);
  } finally {
    logged.mockRestore();
  }
});
