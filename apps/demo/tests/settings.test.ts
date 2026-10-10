import { expect, test } from "vite-plus/test";

import { parseSettings, timeZoneOptions } from "../src/settings";

const defaults = {
  locale: "en-US",
  scrolling: false,
  timeZone: "Europe/Berlin",
  weekStartsOn: 7,
} as const;

test("keeps valid stored settings and replaces each invalid field with its default", () => {
  expect(
    parseSettings(
      '{"locale":"de-DE","scrolling":true,"timeZone":"Asia/Tokyo","weekStartsOn":1}',
      defaults,
    ),
  ).toEqual({
    locale: "de-DE",
    scrolling: true,
    timeZone: "Asia/Tokyo",
    weekStartsOn: 1,
  });
  expect(
    parseSettings(
      '{"locale":"xx","scrolling":"yes","timeZone":"Mars/Base","weekStartsOn":3}',
      defaults,
    ),
  ).toEqual(defaults);
  expect(parseSettings("not json", defaults)).toEqual(defaults);
  expect(parseSettings(null, defaults)).toEqual(defaults);
});

test("lists the system zone first and always includes the selected zone once", () => {
  const options = timeZoneOptions("Asia/Tbilisi", "Pacific/Auckland");

  expect(options.slice(0, 2)).toEqual(["Asia/Tbilisi", "Pacific/Auckland"]);
  expect(new Set(options).size).toBe(options.length);
  expect(timeZoneOptions("UTC", "UTC").filter((zone) => zone === "UTC")).toHaveLength(1);
});
