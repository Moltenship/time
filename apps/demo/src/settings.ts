import type { IsoDayOfWeek, OverlapLayout } from "@moltenship/calendar";

import { isRecord, usePersistentState } from "./storage";

export interface DemoSettings {
  readonly locale: string;
  /** How overlapping events share a column in the day, week and resource views. */
  readonly overlapLayout: OverlapLayout;
  /**
   * Whether rooms and people follow rules of their own: how resource columns lay out their
   * overlapping events, and what double-booking them does; see `resource-rules.ts`.
   */
  readonly resourceRules: ResourceRules;
  /**
   * Whether day, 3 days, week, month, and agenda are the scrolling views, which scroll without end.
   */
  readonly scrolling: boolean;
  /** Another zone the day, week and resource views label their hours in; `null` for none. */
  readonly secondaryTimeZone: string | null;
  readonly timeZone: string;
  readonly weekStartsOn: IsoDayOfWeek;
  /** Whether views shade time outside working hours, and what a change into it does. */
  readonly workingHours: WorkingHours;
}

export type WorkingHours = (typeof workingHoursOptions)[number]["value"];
export type ResourceRules = (typeof resourceRulesOptions)[number]["value"];

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

export const resourceRulesOptions = [
  {
    description: "Rooms and people follow the settings above, and double booking is flagged.",
    label: "Same rules",
    value: "same",
  },
  {
    description:
      "Rooms stack their bookings and can't be double-booked. People's events sit side by side, and double booking them is flagged.",
    label: "Rooms stack and block",
    value: "by-kind",
  },
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
    const { locale, overlapLayout, scrolling, secondaryTimeZone, timeZone, weekStartsOn } = value;
    const { resourceRules, workingHours } = value;
    return {
      locale: localeOptions.find((option) => option.value === locale)?.value ?? defaults.locale,
      overlapLayout:
        overlapLayoutOptions.find((option) => option.value === overlapLayout)?.value ??
        defaults.overlapLayout,
      resourceRules:
        resourceRulesOptions.find((option) => option.value === resourceRules)?.value ??
        defaults.resourceRules,
      scrolling: typeof scrolling === "boolean" ? scrolling : defaults.scrolling,
      secondaryTimeZone:
        secondaryTimeZone === null || isSupportedTimeZone(secondaryTimeZone)
          ? secondaryTimeZone
          : defaults.secondaryTimeZone,
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
        resourceRules: "same",
        scrolling: false,
        secondaryTimeZone: null,
        timeZone: Temporal.Now.timeZoneId(),
        weekStartsOn: 7,
        workingHours: "warn",
      }),
    serializeSettings,
  );
}

/** The select's value for no second time zone; no IANA zone is named this. */
const noSecondaryTimeZone = "none";

function offsetLabel(timeZone: string): string {
  return `UTC${Temporal.Now.zonedDateTimeISO(timeZone).offset}`;
}

export interface SettingItem {
  /** What the option does, shown under the select while it's chosen. */
  readonly description?: string;
  /** Shown after the label in the list only, such as a UTC offset. */
  readonly hint?: string;
  readonly label: string;
  readonly value: string;
}

export interface SettingField {
  readonly items: readonly SettingItem[];
  readonly label: string;
  readonly onValueChange: (value: string) => void;
  readonly value: string;
}

/** The settings each UI shows a select for, in order. */
export function settingFields(
  settings: DemoSettings,
  systemTimeZone: string,
  onChange: (settings: DemoSettings) => void,
): readonly SettingField[] {
  return [
    {
      items: timeZoneOptions(systemTimeZone, settings.timeZone).map((timeZone) => ({
        hint: offsetLabel(timeZone),
        label: timeZone.replaceAll("_", " "),
        value: timeZone,
      })),
      label: "Time zone",
      onValueChange: (timeZone) => onChange({ ...settings, timeZone }),
      value: settings.timeZone,
    },
    {
      items: [
        { label: "None", value: noSecondaryTimeZone },
        ...timeZoneOptions(systemTimeZone, settings.secondaryTimeZone ?? settings.timeZone).map(
          (timeZone) => ({
            hint: offsetLabel(timeZone),
            label: timeZone.replaceAll("_", " "),
            value: timeZone,
          }),
        ),
      ],
      label: "Second time zone",
      onValueChange: (value) =>
        onChange({
          ...settings,
          secondaryTimeZone: value === noSecondaryTimeZone ? null : value,
        }),
      value: settings.secondaryTimeZone ?? noSecondaryTimeZone,
    },
    {
      items: weekStartOptions.map(({ label, value }) => ({ label, value: String(value) })),
      label: "Week starts on",
      onValueChange: (value) => {
        const option = weekStartOptions.find((candidate) => String(candidate.value) === value);
        if (option !== undefined) onChange({ ...settings, weekStartsOn: option.value });
      },
      value: String(settings.weekStartsOn),
    },
    {
      items: localeOptions,
      label: "Date format",
      onValueChange: (locale) => onChange({ ...settings, locale }),
      value: settings.locale,
    },
    {
      items: overlapLayoutOptions,
      label: "Overlapping events",
      onValueChange: (value) => {
        const option = overlapLayoutOptions.find((candidate) => candidate.value === value);
        if (option !== undefined) onChange({ ...settings, overlapLayout: option.value });
      },
      value: settings.overlapLayout,
    },
    {
      items: resourceRulesOptions,
      label: "Rooms and people",
      onValueChange: (value) => {
        const option = resourceRulesOptions.find((candidate) => candidate.value === value);
        if (option !== undefined) onChange({ ...settings, resourceRules: option.value });
      },
      value: settings.resourceRules,
    },
    {
      items: workingHoursOptions,
      label: "Working hours",
      onValueChange: (value) => {
        const option = workingHoursOptions.find((candidate) => candidate.value === value);
        if (option !== undefined) onChange({ ...settings, workingHours: option.value });
      },
      value: settings.workingHours,
    },
  ];
}
