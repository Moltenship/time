import { DateInput } from "@astryxdesign/core/DateInput";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector } from "@astryxdesign/core/Selector";
import * as stylex from "@stylexjs/stylex";

import { repeatEndTypes as endTypes, repeatLabel, repeatOptions, withEndType } from "../../repeat";
import { parseDate } from "../../event-form";
import type { RepeatDraft, RepeatFrequency } from "../../repeat";

import { isoDate } from "./iso";

const styles = stylex.create({
  end: {
    alignItems: "flex-end",
    display: "grid",
    gap: "0.5rem",
    gridAutoColumns: "minmax(0, 1fr)",
    gridAutoFlow: "column",
  },
  field: {
    display: "grid",
    gap: "0.5rem",
  },
});

export interface RepeatFieldProps {
  readonly locale: Intl.LocalesArgument;
  /** The earliest the series can stop repeating: its first day. */
  readonly minimumEnd: Temporal.PlainDate;
  readonly onChange: (repeat: RepeatDraft) => void;
  /** The event's start, which names the presets: "Weekly on Tuesday". */
  readonly startDate: Temporal.PlainDate;
  /** The zone the series repeats in, which a custom rule's end is read in. */
  readonly timeZone: string;
  readonly value: RepeatDraft;
}

/**
 * "Repeat": the presets calendar apps offer, named after the event's start, and when the series
 * ends. A rule no preset matches, such as one a series edit moved, shows as a custom option and
 * is kept until another is picked.
 */
export function RepeatField({
  locale,
  minimumEnd,
  onChange,
  startDate,
  timeZone,
  value,
}: RepeatFieldProps) {
  const { end, frequency } = value;
  const options = repeatOptions(value);

  return (
    <div {...stylex.props(styles.field)}>
      <Selector
        label="Repeat"
        onChange={(next) => {
          if (options.includes(next as RepeatFrequency)) {
            onChange({ ...value, frequency: next as RepeatFrequency });
          }
        }}
        options={options.map((option) => ({
          label: repeatLabel(option, value, startDate, timeZone, locale),
          value: option,
        }))}
        value={frequency}
        width="100%"
      />
      {frequency !== "none" && (
        <div {...stylex.props(styles.end)}>
          <Selector
            label="End repeat"
            onChange={(next) => {
              const type = endTypes.find((option) => option.value === next)?.value;
              const changed = type === undefined ? undefined : withEndType(value, type, startDate);
              if (changed !== undefined) onChange(changed);
            }}
            options={endTypes.map(({ label, value: type }) => ({ label, value: type }))}
            value={end.type}
            width="100%"
          />
          {end.type === "until" && (
            <DateInput
              label="Last date"
              min={isoDate(minimumEnd)}
              onChange={(text) => {
                const date = text === undefined ? undefined : parseDate(text);
                if (date !== undefined) onChange({ ...value, end: { date, type: "until" } });
              }}
              value={isoDate(end.date)}
              width="100%"
            />
          )}
          {end.type === "count" && (
            <NumberInput
              label="Number of times"
              min={1}
              onChange={(count) => {
                if (Number.isInteger(count) && count >= 1) {
                  onChange({ ...value, end: { count, type: "count" } });
                }
              }}
              units="times"
              value={end.count}
              width="100%"
            />
          )}
        </div>
      )}
    </div>
  );
}
