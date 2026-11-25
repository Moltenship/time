import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@registry/calendar-ui/select";
import { createSignal, createUniqueId, For, Show, untrack } from "solid-js";

import { parseDate } from "@demo/event-form";
import {
  repeatEndTypes as endTypes,
  repeatLabel,
  repeatOptions,
  withEndType,
  type RepeatDraft,
  type RepeatFrequency,
} from "@demo/repeat";

import { Input } from "../ui/input";
import { Label } from "../ui/label";

/**
 * "Repeat", as in React: the presets calendar apps offer, named after the event's start, and when
 * the series ends. A rule no preset matches shows as a custom option until another is picked.
 */
export function RepeatField(props: {
  readonly locale: Intl.LocalesArgument;
  /** The earliest the series can stop repeating: its first day. */
  readonly minimumEnd: Temporal.PlainDate;
  readonly onChange: (repeat: RepeatDraft) => void;
  /** The event's start, which names the presets: "Weekly on Tuesday". */
  readonly startDate: Temporal.PlainDate;
  /** The zone the series repeats in, which a custom rule's end is read in. */
  readonly timeZone: string;
  readonly value: RepeatDraft;
}) {
  const id = createUniqueId();
  const items = () =>
    repeatOptions(props.value).map((option) => ({
      label: repeatLabel(option, props.value, props.startDate, props.timeZone, props.locale),
      value: option,
    }));
  const end = () => props.value.end;
  const until = () => {
    const current = end();
    return current.type === "until" ? current : undefined;
  };
  const count = () => {
    const current = end();
    return current.type === "count" ? current : undefined;
  };

  return (
    <div class="grid gap-2">
      <Label for={`${id}-repeat`}>Repeat</Label>
      <Select<RepeatFrequency>
        items={items()}
        onValueChange={(frequency) => props.onChange({ ...props.value, frequency })}
        value={props.value.frequency}
      >
        <SelectTrigger class="w-full" id={`${id}-repeat`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <For each={items()} keyed={(item) => item.value}>
              {(item) => (
                <SelectItem label={item().label} value={item().value}>
                  {item().label}
                </SelectItem>
              )}
            </For>
          </SelectGroup>
        </SelectContent>
      </Select>
      <Show when={props.value.frequency !== "none"}>
        <div class="grid grid-cols-[auto_1fr_auto] items-center gap-x-2">
          <Label for={`${id}-ends`}>End repeat</Label>
          <Select
            items={endTypes}
            onValueChange={(type) => {
              const next = withEndType(props.value, type, props.startDate);
              if (next !== undefined) props.onChange(next);
            }}
            value={end().type}
          >
            <SelectTrigger
              class={end().type === "never" ? "col-span-2 w-full" : "w-full"}
              id={`${id}-ends`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <For each={endTypes}>
                  {(option) => (
                    <SelectItem label={option.label} value={option.value}>
                      {option.label}
                    </SelectItem>
                  )}
                </For>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Show when={until()}>
            {(ending) => (
              <Input
                aria-label="Last date"
                class="px-2.5"
                min={props.minimumEnd.toString()}
                onInput={(event) => {
                  const date = parseDate(event.currentTarget.value);
                  if (date !== undefined)
                    props.onChange({ ...props.value, end: { date, type: "until" } });
                }}
                type="date"
                value={ending().date.toString()}
              />
            )}
          </Show>
          <Show when={count()}>
            {(ending) => (
              <CountInput
                count={ending().count}
                onChange={(next) =>
                  props.onChange({ ...props.value, end: { count: next, type: "count" } })
                }
              />
            )}
          </Show>
        </div>
      </Show>
    </div>
  );
}

/**
 * How many times the series happens. The text is the field's own while it's typed, so it can be
 * cleared on the way to another number; only a whole number from 1 reaches the draft.
 */
function CountInput(props: { readonly count: number; readonly onChange: (count: number) => void }) {
  // Seeded from the count once; the field owns its text from then on.
  const [text, setText] = createSignal(untrack(() => String(props.count)));
  return (
    <div class="flex items-center gap-2">
      <Input
        aria-label="Number of times"
        class="w-20 px-2.5"
        inputmode="numeric"
        min={1}
        onBlur={() => setText(String(props.count))}
        onInput={(event) => {
          setText(event.currentTarget.value);
          const next = Number(event.currentTarget.value);
          if (Number.isInteger(next) && next >= 1) props.onChange(next);
        }}
        type="number"
        value={text()}
      />
      <span class="text-sm text-muted-foreground">times</span>
    </div>
  );
}
