import { RotateCcwIcon } from "lucide-react";
import { useId, type ReactNode } from "react";

import { Button } from "@registry/ui/button";
import { Label } from "@registry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@registry/ui/select";

import { localeOptions, timeZoneOptions, weekStartOptions, type DemoSettings } from "../settings";

export interface SettingsPanelProps {
  readonly onChange: (settings: DemoSettings) => void;
  readonly onReset: () => void;
  readonly settings: DemoSettings;
  readonly systemTimeZone: string;
}

function offsetLabel(timeZone: string): string {
  return `UTC${Temporal.Now.zonedDateTimeISO(timeZone).offset}`;
}

function Setting({
  children,
  label,
  onValueChange,
  value,
}: {
  readonly children: ReactNode;
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
      <Select onValueChange={onValueChange} value={value}>
        <SelectTrigger className="w-full" id={id} size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  );
}

export function SettingsPanel({ onChange, onReset, settings, systemTimeZone }: SettingsPanelProps) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="grid gap-3 px-2">
      <h2 id={headingId} className="text-sm font-medium">
        Settings
      </h2>
      <Setting
        label="Time zone"
        onValueChange={(timeZone) => onChange({ ...settings, timeZone })}
        value={settings.timeZone}
      >
        {timeZoneOptions(systemTimeZone, settings.timeZone).map((timeZone) => (
          <SelectItem key={timeZone} hint={offsetLabel(timeZone)} value={timeZone}>
            {timeZone.replaceAll("_", " ")}
          </SelectItem>
        ))}
      </Setting>
      <Setting
        label="Week starts on"
        onValueChange={(value) => {
          const option = weekStartOptions.find((candidate) => String(candidate.value) === value);
          if (option !== undefined) onChange({ ...settings, weekStartsOn: option.value });
        }}
        value={String(settings.weekStartsOn)}
      >
        {weekStartOptions.map((option) => (
          <SelectItem key={option.value} value={String(option.value)}>
            {option.label}
          </SelectItem>
        ))}
      </Setting>
      <Setting
        label="Date format"
        onValueChange={(locale) => onChange({ ...settings, locale })}
        value={settings.locale}
      >
        {localeOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </Setting>
      <Button className="w-fit" onClick={onReset} size="sm" variant="ghost">
        <RotateCcwIcon />
        Reset demo data
      </Button>
    </section>
  );
}
