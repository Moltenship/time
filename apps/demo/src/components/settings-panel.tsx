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

import { settingFields, type DemoSettings, type SettingField } from "../settings";

export interface SettingsPanelProps {
  /** Makes every move, resize and delete fail after the simulated save delay. */
  readonly failSaves: boolean;
  readonly onChange: (settings: DemoSettings) => void;
  readonly onFailSavesChange: (failSaves: boolean) => void;
  readonly onReset: () => void;
  readonly settings: DemoSettings;
  readonly systemTimeZone: string;
}

function Setting({ items, label, onValueChange, value }: SettingField) {
  const id = useId();
  const description = items.find((item) => item.value === value)?.description;
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
        <SelectTrigger
          aria-describedby={description === undefined ? undefined : `${id}-description`}
          className="w-full"
          id={id}
          size="sm"
        >
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
      {description !== undefined && (
        <p className="text-xs text-muted-foreground" id={`${id}-description`}>
          {description}
        </p>
      )}
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
      {settingFields(settings, systemTimeZone, onChange).map((field) => (
        <Setting key={field.label} {...field} />
      ))}
      <Label className="mt-1 font-normal">
        <Checkbox
          checked={settings.scrolling}
          onCheckedChange={(checked) => onChange({ ...settings, scrolling: checked === true })}
        />
        Scroll days, weeks, months and agenda
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
