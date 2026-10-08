import type { IsoDayOfWeek } from "@moltenship/calendar";

import { isRecord, usePersistentState } from "./storage";

export interface DemoSettings {
  readonly locale: string;
  readonly timeZone: string;
  readonly weekStartsOn: IsoDayOfWeek;
}

export const localeOptions = [
  { label: "English (US)", value: "en-US" },
  { label: "English (UK)", value: "en-GB" },
  { label: "Deutsch", value: "de-DE" },
  { label: "Français", value: "fr-FR" },
  { label: "Português (Brasil)", value: "pt-BR" },
  { label: "日本語", value: "ja-JP" },
] as const;

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
    const { locale, timeZone, weekStartsOn } = value;
    return {
      locale: localeOptions.find((option) => option.value === locale)?.value ?? defaults.locale,
      timeZone: isSupportedTimeZone(timeZone) ? timeZone : defaults.timeZone,
      weekStartsOn:
        weekStartOptions.find((option) => option.value === weekStartsOn)?.value ??
        defaults.weekStartsOn,
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
        timeZone: Temporal.Now.timeZoneId(),
        weekStartsOn: 7,
      }),
    serializeSettings,
  );
}
