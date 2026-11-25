import { Button } from "@registry/calendar-ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@registry/calendar-ui/select";
import { createUniqueId, For, Show } from "solid-js";

import { dragPreviewField, type DemoDragPreview } from "@demo/drag-preview";
import { settingFields, type DemoSettings, type SettingField } from "@demo/settings";

import { RotateCcwIcon } from "../icons";
import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/label";

function Setting(props: { readonly field: SettingField }) {
  const id = createUniqueId();
  const description = () =>
    props.field.items.find((item) => item.value === props.field.value)?.description;
  return (
    <div class="grid gap-1.5">
      <Label for={id} class="text-xs text-muted-foreground">
        {props.field.label}
      </Label>
      <Select
        items={props.field.items}
        onValueChange={(next) => props.field.onValueChange(next)}
        value={props.field.value}
      >
        <SelectTrigger
          aria-describedby={description() === undefined ? undefined : `${id}-description`}
          class="w-full"
          id={id}
          size="sm"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            <For each={props.field.items} keyed={(item) => item.value}>
              {(item) => (
                <SelectItem label={item().label} value={item().value}>
                  {item().label}
                  <Show when={item().hint}>
                    {(hint) => <span class="ml-auto text-xs text-muted-foreground">{hint()}</span>}
                  </Show>
                </SelectItem>
              )}
            </For>
          </SelectGroup>
        </SelectContent>
      </Select>
      <Show when={description()}>
        {(text) => (
          <p class="text-xs text-muted-foreground" id={`${id}-description`}>
            {text()}
          </p>
        )}
      </Show>
    </div>
  );
}

export function SettingsPanel(props: {
  /** How pointer drags preview where they land; mirrored in the URL as `?drag=free`. */
  readonly dragPreview: DemoDragPreview;
  /** Makes every change fail after the simulated save delay. */
  readonly failSaves: boolean;
  readonly onChange: (settings: DemoSettings) => void;
  readonly onDragPreviewChange: (preview: DemoDragPreview) => void;
  readonly onFailSavesChange: (failSaves: boolean) => void;
  readonly onReset: () => void;
  readonly settings: DemoSettings;
  readonly systemTimeZone: string;
}) {
  const headingId = createUniqueId();
  const fields = () => settingFields(props.settings, props.systemTimeZone, props.onChange);
  return (
    <section aria-labelledby={headingId} class="grid gap-3 px-2">
      <h2 id={headingId} class="text-sm font-medium">
        Settings
      </h2>
      <Setting field={dragPreviewField(props.dragPreview, props.onDragPreviewChange)} />
      <For each={fields()} keyed={(field) => field.label}>
        {(field) => <Setting field={field()} />}
      </For>
      <Label class="mt-1 font-normal">
        <Checkbox
          checked={props.settings.scrolling}
          onCheckedChange={(checked) => props.onChange({ ...props.settings, scrolling: checked })}
        />
        Scroll days, weeks, months and agenda
      </Label>
      <Label class="font-normal">
        <Checkbox
          checked={props.failSaves}
          onCheckedChange={(checked) => props.onFailSavesChange(checked)}
        />
        Simulate failing saves
      </Label>
      <Button class="w-fit" onClick={() => props.onReset()} size="sm" variant="ghost">
        <RotateCcwIcon />
        Reset demo data
      </Button>
    </section>
  );
}
