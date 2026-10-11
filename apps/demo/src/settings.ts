import type { IsoDayOfWeek, OverlapLayout } from "@moltenship/calendar";

import { isRecord, usePersistentState } from "./storage";

export interface DemoSettings {
  readonly locale: string;
  /** How overlapping events share a column in the day, week and resource views. */
  readonly overlapLayout: OverlapLayout;
  /** Whether day, week, month, and agenda are the scrolling views, which scroll without end. */
  readonly scrolling: boolean;
  readonly timeZone: string;
  readonly weekStartsOn: IsoDayOfWeek;
  /** Whether views shade time outside working hours, and what a change into it does. */
  readonly workingHours: WorkingHours;
}

export type WorkingHours = (typeof workingHoursOptions)[number]["value"];

export const workingHoursOptions = [
  { label: "Hidden", value: "off" },
  { label: "Shown", value: "show" },
  { label: "Shown, warn outside", value: "warn" },
  { label: "Shown, block outside", value: "block" },
] as const;

export const localeOptions = [
  { label: "English (US)", value: "en-US" },
  { label: "English (UK)", value: "en-GB" },
  { label: "Deutsch", value: "de-DE" },
  { label: "Français", value: "fr-FR" },
  { label: "Português (Brasil)", value: "pt-BR" },
  { label: "日本語", value: "ja-JP" },
] as const;

export const overlapLayoutOptions = [
  { label: "Side by side", value: "columns" },
  { label: "Equal columns", value: "equal" },
  { label: "Stacked", value: "stack" },
] as const satisfies readonly { readonly label: string; readonly value: OverlapLayout }[];

export const weekStartOptions = [
  { label: "Sunday", value: 7 },
  { label: "Monday", value: 1 },
  { label: "Saturday", value: 6 },
] as const satisfies readonly { readonly label: string; readonly value: IsoDayOfWeek }[];

const commonTimeZones = [
  "America/Los_Angeles",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC",
];

/** The system zone first, then the selected zone, then a spread of common zones. */
export function timeZoneOptions(systemTimeZone: string, selected: string): readonly string[] {
  return [...new Set([systemTimeZone, selected, ...commonTimeZones])];
}

function isSupportedTimeZone(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    Temporal.Now.zonedDateTimeISO(value);
    return true;
  } catch {
    return false;
  }
}

export function parseSettings(stored: string | null, defaults: DemoSettings): DemoSettings {
  try {
    const value: unknown = JSON.parse(stored ?? "{}");
    if (!isRecord(value)) return defaults;
    const { locale, overlapLayout, scrolling, timeZone, weekStartsOn, workingHours } = value;
    return {
      locale: localeOptions.find((option) => option.value === locale)?.value ?? defaults.locale,
      overlapLayout:
        overlapLayoutOptions.find((option) => option.value === overlapLayout)?.value ??
        defaults.overlapLayout,
      scrolling: typeof scrolling === "boolean" ? scrolling : defaults.scrolling,
      timeZone: isSupportedTimeZone(timeZone) ? timeZone : defaults.timeZone,
      weekStartsOn:
        weekStartOptions.find((option) => option.value === weekStartsOn)?.value ??
        defaults.weekStartsOn,
      workingHours:
        workingHoursOptions.find((option) => option.value === workingHours)?.value ??
        defaults.workingHours,
    };
  } catch {
    return defaults;
  }
}

const serializeSettings = (settings: DemoSettings) => JSON.stringify(settings);

export function useDemoSettings() {
  return usePersistentState(
    "moltenship-demo:settings",
    (stored) =>
      parseSettings(stored, {
        locale: "en-US",
        overlapLayout: "columns",
        scrolling: false,
        timeZone: Temporal.Now.timeZoneId(),
        weekStartsOn: 7,
        workingHours: "warn",
      }),
    serializeSettings,
  );
}
