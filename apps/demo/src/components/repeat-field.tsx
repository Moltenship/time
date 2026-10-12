import { useId } from "react";

import { Input } from "@registry/ui/input";
import { Label } from "@registry/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@registry/ui/select";

import {
  describeRule,
  presetLabel,
  repeatPresets,
  withoutEnd,
  type RepeatDraft,
  type RepeatEnd,
  type RepeatFrequency,
} from "../repeat";

export interface RepeatFieldProps {
  readonly locale: Intl.LocalesArgument;
  readonly onChange: (repeat: RepeatDraft) => void;
  /** The event's start, which names the presets: "Weekly on Tuesday". */
  readonly startDate: Temporal.PlainDate;
  /** The zone the series repeats in, which a custom rule's end is read in. */
  readonly timeZone: string;
  readonly value: RepeatDraft;
}

const endTypes = [
  { label: "Never", value: "never" },
  { label: "On date", value: "until" },
  { label: "After", value: "count" },
] as const satisfies readonly { readonly label: string; readonly value: RepeatEnd["type"] }[];

function parseDate(value: string): Temporal.PlainDate | undefined {
  try {
    return Temporal.PlainDate.from(value);
  } catch {
    return undefined;
  }
}

/**
 * "Repeat": the presets calendar apps offer, named after the event's start, and when the series
 * ends. A rule no preset matches, such as one a series edit moved, shows as a custom option and
 * is kept until another is picked.
 */
export function RepeatField({ locale, onChange, startDate, timeZone, value }: RepeatFieldProps) {
  const id = useId();
  const { end, frequency, rule } = value;
  const label = (option: RepeatFrequency) =>
    option === "custom"
      ? `Custom: ${rule === undefined ? "" : describeRule(withoutEnd(rule), startDate, timeZone, locale)}`
      : presetLabel(option, startDate, locale);
  const options: readonly RepeatFrequency[] =
    frequency === "custom" ? [...repeatPresets, "custom"] : repeatPresets;

  function changeEnd(type: RepeatEnd["type"]) {
    if (type === end.type) return;
    // Starting points calendar apps use: three months out, or ten times.
    const next: RepeatEnd =
      type === "never"
        ? { type }
        : type === "until"
          ? { date: startDate.add({ months: 3 }), type }
          : { count: 10, type };
    onChange({ ...value, end: next });
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={`${id}-repeat`}>Repeat</Label>
      <Select
        onValueChange={(next) => {
          if (options.includes(next as RepeatFrequency)) {
            onChange({ ...value, frequency: next as RepeatFrequency });
          }
        }}
        value={frequency}
      >
        <SelectTrigger className="w-full" id={`${id}-repeat`}>
          <SelectValue>{(selected) => label(selected as RepeatFrequency)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {label(option)}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {frequency !== "none" && (
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2">
          <Label htmlFor={`${id}-ends`}>Ends</Label>
          <Select
            onValueChange={(next) => {
              const type = endTypes.find((option) => option.value === next)?.value;
              if (type !== undefined) changeEnd(type);
            }}
            value={end.type}
          >
            <SelectTrigger
              className={end.type === "never" ? "col-span-2 w-full" : "w-full"}
              id={`${id}-ends`}
            >
              <SelectValue>
                {(selected) => endTypes.find((option) => option.value === selected)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {endTypes.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {end.type === "until" && (
            <Input
              aria-label="Last date"
              className="px-2.5"
              min={startDate.toString()}
              onChange={(event) => {
                const date = parseDate(event.target.value);
                if (date !== undefined) onChange({ ...value, end: { date, type: "until" } });
              }}
              type="date"
              value={end.date.toString()}
            />
          )}
          {end.type === "count" && (
            <div className="flex items-center gap-2">
              <Input
                aria-label="Number of times"
                className="w-20 px-2.5"
                inputMode="numeric"
                min={1}
                onChange={(event) => {
                  const count = Number.parseInt(event.target.value, 10);
                  if (Number.isInteger(count) && count >= 1) {
                    onChange({ ...value, end: { count, type: "count" } });
                  }
                }}
                type="number"
                value={end.count}
              />
              <span className="text-sm text-muted-foreground">times</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
