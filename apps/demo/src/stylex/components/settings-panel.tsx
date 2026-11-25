import * as stylex from "@stylexjs/stylex";
import { RotateCcwIcon } from "lucide-react";
import { useId } from "react";

import { Button } from "@registry/stylex-calendar-ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@registry/stylex-calendar-ui/select";

import { dragPreviewField, type DemoDragPreview } from "../../drag-preview";
import { settingFields, type DemoSettings, type SettingField } from "../../settings";
import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/field";

const styles = stylex.create({
  panel: {
    display: "grid",
    gap: "0.75rem",
    paddingInline: "0.5rem",
  },
  heading: {
    fontSize: "0.875rem",
    fontWeight: 500,
    lineHeight: "calc(1.25 / 0.875)",
  },
  setting: {
    display: "grid",
    gap: "0.375rem",
  },
  muted: {
    color: "var(--muted-foreground)",
    fontSize: "0.75rem",
    lineHeight: "calc(1 / 0.75)",
  },
  hint: {
    marginLeft: "auto",
  },
  trigger: {
    width: "100%",
  },
  check: {
    fontWeight: 400,
  },
  firstCheck: {
    marginTop: "0.25rem",
  },
  reset: {
    width: "fit-content",
  },
});

export interface SettingsPanelProps {
  /** How pointer drags preview where they land; mirrored in the URL as `?drag=free`. */
  readonly dragPreview: DemoDragPreview;
  /** Makes every move, resize and delete fail after the simulated save delay. */
  readonly failSaves: boolean;
  readonly onChange: (settings: DemoSettings) => void;
  readonly onDragPreviewChange: (preview: DemoDragPreview) => void;
  readonly onFailSavesChange: (failSaves: boolean) => void;
  readonly onReset: () => void;
  readonly settings: DemoSettings;
  readonly systemTimeZone: string;
}

function Setting({ items, label, onValueChange, value }: SettingField) {
  const id = useId();
  const description = items.find((item) => item.value === value)?.description;
  return (
    <div {...stylex.props(styles.setting)}>
      <Label htmlFor={id} xstyle={styles.muted}>
        {label}
      </Label>
      <Select items={items} onValueChange={onValueChange} value={value}>
        <SelectTrigger
          aria-describedby={description === undefined ? undefined : `${id}-description`}
          id={id}
          size="sm"
          xstyle={styles.trigger}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} label={item.label} value={item.value}>
                {item.label}
                {item.hint !== undefined && (
                  <span {...stylex.props(styles.muted, styles.hint)}>{item.hint}</span>
                )}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {description !== undefined && (
        <p id={`${id}-description`} {...stylex.props(styles.muted)}>
          {description}
        </p>
      )}
    </div>
  );
}

export function SettingsPanel({
  dragPreview,
  failSaves,
  onChange,
  onDragPreviewChange,
  onFailSavesChange,
  onReset,
  settings,
  systemTimeZone,
}: SettingsPanelProps) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} {...stylex.props(styles.panel)}>
      <h2 id={headingId} {...stylex.props(styles.heading)}>
        Settings
      </h2>
      <Setting {...dragPreviewField(dragPreview, onDragPreviewChange)} />
      {settingFields(settings, systemTimeZone, onChange).map((field) => (
        <Setting key={field.label} {...field} />
      ))}
      <Label xstyle={[styles.check, styles.firstCheck]}>
        <Checkbox
          checked={settings.scrolling}
          onCheckedChange={(checked) => onChange({ ...settings, scrolling: checked === true })}
        />
        Scroll days, weeks, months and agenda
      </Label>
      <Label xstyle={styles.check}>
        <Checkbox
          checked={failSaves}
          onCheckedChange={(checked) => onFailSavesChange(checked === true)}
        />
        Simulate failing saves
      </Label>
      <Button onClick={onReset} size="sm" variant="ghost" xstyle={styles.reset}>
        <RotateCcwIcon aria-hidden />
        Reset demo data
      </Button>
    </section>
  );
}
