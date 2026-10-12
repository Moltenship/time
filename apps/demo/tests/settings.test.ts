import { expect, test } from "vite-plus/test";

import { parseSettings, timeZoneOptions } from "../src/settings";

const defaults = {
  locale: "en-US",
  overlapLayout: "columns",
  scrolling: false,
  secondaryTimeZone: null,
  timeZone: "Europe/Berlin",
  weekStartsOn: 7,
  workingHours: "warn",
} as const;

test("keeps valid stored settings and replaces each invalid field with its default", () => {
  expect(
    parseSettings(
      '{"locale":"de-DE","overlapLayout":"stack","scrolling":true,"secondaryTimeZone":"Asia/Kolkata","timeZone":"Asia/Tokyo","weekStartsOn":1,"workingHours":"block"}',
      defaults,
    ),
  ).toEqual({
    locale: "de-DE",
    overlapLayout: "stack",
    scrolling: true,
    secondaryTimeZone: "Asia/Kolkata",
    timeZone: "Asia/Tokyo",
    weekStartsOn: 1,
    workingHours: "block",
  });
  expect(
    parseSettings(
      '{"locale":"xx","overlapLayout":"grid","scrolling":"yes","secondaryTimeZone":"Moon/Base","timeZone":"Mars/Base","weekStartsOn":3,"workingHours":"later"}',
      defaults,
    ),
  ).toEqual(defaults);
  expect(parseSettings('{"secondaryTimeZone":null}', defaults).secondaryTimeZone).toBeNull();
  expect(parseSettings("not json", defaults)).toEqual(defaults);
  expect(parseSettings(null, defaults)).toEqual(defaults);
});

test("lists the system zone first and always includes the selected zone once", () => {
  const options = timeZoneOptions("Asia/Tbilisi", "Pacific/Auckland");

  expect(options.slice(0, 2)).toEqual(["Asia/Tbilisi", "Pacific/Auckland"]);
  expect(new Set(options).size).toBe(options.length);
  expect(timeZoneOptions("UTC", "UTC").filter((zone) => zone === "UTC")).toHaveLength(1);
});
