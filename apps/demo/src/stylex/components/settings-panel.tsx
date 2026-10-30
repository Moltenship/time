import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { Selector } from "@astryxdesign/core/Selector";
import { VStack } from "@astryxdesign/core/Stack";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import * as stylex from "@stylexjs/stylex";
import { RotateCcwIcon } from "lucide-react";
import { useId } from "react";

import { settingFields, type DemoSettings, type SettingField } from "../../settings";
import { SectionHeading } from "./section";

const styles = stylex.create({
  option: {
    display: "flex",
    flexGrow: 1,
    gap: "0.5rem",
    justifyContent: "space-between",
  },
});

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
  return (
    <Selector
      description={items.find((item) => item.value === value)?.description}
      label={label}
      onChange={onValueChange}
      options={items.map((item) => ({ label: item.label, value: item.value }))}
      renderOption={(option) => {
        const hint = items.find((item) => item.value === option.value)?.hint;
        return (
          <span {...stylex.props(styles.option)}>
            {option.label}
            {hint !== undefined && <Text type="supporting">{hint}</Text>}
          </span>
        );
      }}
      size="sm"
      value={value}
      width="100%"
    />
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
    <section aria-labelledby={headingId}>
      <SectionHeading id={headingId}>Settings</SectionHeading>
      <VStack gap={3}>
        {settingFields(settings, systemTimeZone, onChange).map((field) => (
          <Setting key={field.label} {...field} />
        ))}
        <Switch
          label="Scroll days, weeks, months and agenda"
          onChange={(scrolling) => onChange({ ...settings, scrolling })}
          size="sm"
          value={settings.scrolling}
        />
        <Switch
          label="Simulate failing saves"
          onChange={onFailSavesChange}
          size="sm"
          value={failSaves}
        />
        <div>
          <Button
            icon={<Icon icon={RotateCcwIcon} />}
            label="Reset demo data"
            onClick={onReset}
            size="sm"
            variant="ghost"
          />
        </div>
      </VStack>
    </section>
  );
}
