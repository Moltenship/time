import { buildZonedDayGeometry } from "../src/native-temporal";

const cases = [
  {
    id: "spring-gap-hour",
    date: "2026-03-08",
    timeZone: "America/New_York",
    slotMinutes: 30,
  },
  {
    id: "fall-fold-hour",
    date: "2026-11-01",
    timeZone: "America/New_York",
    slotMinutes: 30,
  },
  {
    id: "spring-gap-half-hour",
    date: "2026-10-04",
    timeZone: "Australia/Lord_Howe",
    slotMinutes: 30,
  },
  {
    id: "midnight-gap",
    date: "2026-09-06",
    timeZone: "America/Santiago",
    slotMinutes: 30,
  },
] as const;

const fixture = {
  schemaVersion: 1,
  runtimeRequirement: "Node.js 24 --harmony-temporal (native V8 Temporal; no polyfill)",
  cases: cases.map(({ id, date, timeZone, slotMinutes }) => {
    const geometry = buildZonedDayGeometry(date, timeZone, slotMinutes);

    return {
      id,
      date,
      timeZone,
      slotMinutes,
      physicalMinutes: geometry.physicalMinutes,
      kindCounts: {
        unique: geometry.slots.filter((slot) => slot.kind === "unique").length,
        gap: geometry.slots.filter((slot) => slot.kind === "gap").length,
        fold: geometry.slots.filter((slot) => slot.kind === "fold").length,
      },
      anomalies: geometry.slots.filter((slot) => slot.kind !== "unique"),
    };
  }),
};

console.log(JSON.stringify(fixture, undefined, 2));
