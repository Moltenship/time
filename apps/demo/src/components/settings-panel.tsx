import { RotateCcwIcon } from "lucide-react";
import { useId } from "react";

import { Button } from "@registry/ui/button";
import { Checkbox } from "@registry/ui/checkbox";
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
  localeOptions,
  overlapLayoutOptions,
  timeZoneOptions,
  weekStartOptions,
  workingHoursOptions,
  type DemoSettings,
} from "../settings";

export interface SettingsPanelProps {
  /** Makes every move, resize and delete fail after the simulated save delay. */
  readonly failSaves: boolean;
  readonly onChange: (settings: DemoSettings) => void;
  readonly onFailSavesChange: (failSaves: boolean) => void;
  readonly onReset: () => void;
  readonly settings: DemoSettings;
  readonly systemTimeZone: string;
}

function offsetLabel(timeZone: string): string {
  return `UTC${Temporal.Now.zonedDateTimeISO(timeZone).offset}`;
}

interface SettingItem {
  /** Shown after the label in the list only, such as a UTC offset. */
  readonly hint?: string;
  readonly label: string;
  readonly value: string;
}

function Setting({
  items,
  label,
  onValueChange,
  value,
}: {
  readonly items: readonly SettingItem[];
  readonly label: string;
  readonly onValueChange: (value: string) => void;
  readonly value: string;
}) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select
        items={items}
        onValueChange={(next) => {
          if (next !== null) onValueChange(next);
        }}
        value={value}
      >
        <SelectTrigger className="w-full" id={id} size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
                {item.hint !== undefined && (
                  <span className="ml-auto text-xs text-muted-foreground">{item.hint}</span>
                )}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

export function SettingsPanel({
  failSaves,
  onChange,
  onFailSavesChange,
  onReset,
  settings,
  systemTimeZone,
}: SettingsPanelProps) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="grid gap-3 px-2">
      <h2 id={headingId} className="text-sm font-medium">
        Settings
      </h2>
      <Setting
        items={timeZoneOptions(systemTimeZone, settings.timeZone).map((timeZone) => ({
          hint: offsetLabel(timeZone),
          label: timeZone.replaceAll("_", " "),
          value: timeZone,
        }))}
        label="Time zone"
        onValueChange={(timeZone) => onChange({ ...settings, timeZone })}
        value={settings.timeZone}
      />
      <Setting
        items={weekStartOptions.map(({ label, value }) => ({ label, value: String(value) }))}
        label="Week starts on"
        onValueChange={(value) => {
          const option = weekStartOptions.find((candidate) => String(candidate.value) === value);
          if (option !== undefined) onChange({ ...settings, weekStartsOn: option.value });
        }}
        value={String(settings.weekStartsOn)}
      />
      <Setting
        items={localeOptions}
        label="Date format"
        onValueChange={(locale) => onChange({ ...settings, locale })}
        value={settings.locale}
      />
      <Setting
        items={overlapLayoutOptions}
        label="Overlapping events"
        onValueChange={(value) => {
          const option = overlapLayoutOptions.find((candidate) => candidate.value === value);
          if (option !== undefined) onChange({ ...settings, overlapLayout: option.value });
        }}
        value={settings.overlapLayout}
      />
      <Setting
        items={workingHoursOptions}
        label="Working hours"
        onValueChange={(value) => {
          const option = workingHoursOptions.find((candidate) => candidate.value === value);
          if (option !== undefined) onChange({ ...settings, workingHours: option.value });
        }}
        value={settings.workingHours}
      />
      <Label className="mt-1 font-normal">
        <Checkbox
          checked={settings.scrolling}
          onCheckedChange={(checked) => onChange({ ...settings, scrolling: checked === true })}
        />
        Scroll day, week, month and agenda
      </Label>
      <Label className="font-normal">
        <Checkbox
          checked={failSaves}
          onCheckedChange={(checked) => onFailSavesChange(checked === true)}
        />
        Simulate failing saves
      </Label>
      <Button className="w-fit" onClick={onReset} size="sm" variant="ghost">
        <RotateCcwIcon />
        Reset demo data
      </Button>
    </section>
  );
}
