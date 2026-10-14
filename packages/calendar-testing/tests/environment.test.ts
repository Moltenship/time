import { afterEach, expect, test, vi } from "vite-plus/test";

import {
  createTestClock,
  createTestEnvironment,
  requireTemporal,
  testDefaults,
  toInstant,
} from "../src/index";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("the default environment is Thursday 8 October 2026 at noon UTC, in US English", () => {
  const environment = createTestEnvironment();

  expect(environment.now.toString()).toBe("2026-10-08T12:00:00Z");
  expect(environment.today.toString()).toBe("2026-10-08");
  expect(environment.anchorDate.toString()).toBe("2026-10-08");
  expect(environment.rootProps).toMatchObject({
    defaultTimeZone: "UTC",
    direction: "ltr",
    locale: "en-US",
    weekRules: testDefaults.weekRules,
  });
  expect(environment.rootProps.now.toString()).toBe("2026-10-08T12:00:00Z");
});

test("a wall-clock now is read on the environment's zone, and today is its date there", () => {
  const environment = createTestEnvironment({ now: "2026-10-08T23:30", timeZone: "Asia/Tokyo" });

  expect(environment.now.toString()).toBe("2026-10-08T14:30:00Z");
  expect(environment.today.toString()).toBe("2026-10-08");
  expect(
    createTestEnvironment({ now: "2026-10-08T23:30Z", timeZone: "Asia/Tokyo" }).today.toString(),
  ).toBe("2026-10-09");
});

test("at() reads times as today's, wall times on the zone and exact text as it is", () => {
  const environment = createTestEnvironment({ timeZone: "America/New_York" });

  expect(environment.at("09:00").toString()).toBe("2026-10-08T13:00:00Z");
  expect(environment.at("2026-11-02T09:00").toString()).toBe("2026-11-02T14:00:00Z");
  expect(environment.at("2026-11-02T09:00Z").toString()).toBe("2026-11-02T09:00:00Z");
  expect(environment.at("2026-11-02T09:00+01:00").toString()).toBe("2026-11-02T08:00:00Z");
  expect(environment.at("2026-11-02T09:00[Europe/Berlin]").toString()).toBe("2026-11-02T08:00:00Z");
});

test("a wall time in a DST gap resolves later, as Root does", () => {
  expect(toInstant("2026-03-08T02:30", "America/New_York").toString()).toBe("2026-03-08T07:30:00Z");
});

test("a test clock moves only when told to", () => {
  const clock = createTestClock("2026-10-08T09:00:00Z");

  expect(clock.instant().toString()).toBe("2026-10-08T09:00:00Z");
  clock.advance({ minutes: 90 });
  expect(clock.instant().toString()).toBe("2026-10-08T10:30:00Z");
  clock.set("2026-12-31T23:59:00Z");
  expect(clock.instant().toString()).toBe("2026-12-31T23:59:00Z");
});

test("without Temporal, the error says how to install the polyfill", () => {
  vi.stubGlobal("Temporal", undefined);

  expect(() => requireTemporal()).toThrow(/temporal-polyfill\/global/);
  expect(() => createTestEnvironment()).toThrow(/needs Temporal/);
});
