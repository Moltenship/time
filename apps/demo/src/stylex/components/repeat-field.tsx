import * as stylex from "@stylexjs/stylex";
import { useId, useState } from "react";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@registry/stylex-calendar-ui/select";

import {
  repeatEndTypes as endTypes,
  repeatLabel,
  repeatOptions,
  withEndType,
  type RepeatDraft,
  type RepeatEnd,
  type RepeatFrequency,
} from "../../repeat";
import { Input, Label } from "../ui/field";

const styles = stylex.create({
  field: {
    display: "grid",
    gap: "0.5rem",
  },
  end: {
    alignItems: "center",
    columnGap: "0.5rem",
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
  },
  full: {
    width: "100%",
  },
  span: {
    gridColumn: "span 2 / span 2",
  },
  count: {
    alignItems: "center",
    display: "flex",
    gap: "0.5rem",
  },
  countInput: {
    width: "5rem",
  },
  times: {
    color: "var(--muted-foreground)",
    fontSize: "0.875rem",
    lineHeight: "calc(1.25 / 0.875)",
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
export function RepeatField({
  locale,
  minimumEnd,
  onChange,
  startDate,
  timeZone,
  value,
}: RepeatFieldProps) {
  const id = useId();
  const { end, frequency } = value;
  const label = (option: RepeatFrequency) =>
    repeatLabel(option, value, startDate, timeZone, locale);
  const options = repeatOptions(value);

  function changeEnd(type: RepeatEnd["type"]) {
    const next = withEndType(value, type, startDate);
    if (next !== undefined) onChange(next);
  }

  return (
    <div {...stylex.props(styles.field)}>
      <Label htmlFor={`${id}-repeat`}>Repeat</Label>
      <Select
        items={options.map((option) => ({ label: label(option), value: option }))}
        onValueChange={(next) => {
          if (options.includes(next)) onChange({ ...value, frequency: next });
        }}
        value={frequency}
      >
        <SelectTrigger id={`${id}-repeat`} xstyle={styles.full}>
          <SelectValue />
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
        <div {...stylex.props(styles.end)}>
          <Label htmlFor={`${id}-ends`}>End repeat</Label>
          <Select items={endTypes} onValueChange={changeEnd} value={end.type}>
            <SelectTrigger
              id={`${id}-ends`}
              xstyle={[styles.full, end.type === "never" && styles.span]}
            >
              <SelectValue />
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
              min={minimumEnd.toString()}
              onChange={(event) => {
                const date = parseDate(event.target.value);
                if (date !== undefined) onChange({ ...value, end: { date, type: "until" } });
              }}
              type="date"
              value={end.date.toString()}
            />
          )}
          {end.type === "count" && (
            <CountInput
              count={end.count}
              onChange={(count) => onChange({ ...value, end: { count, type: "count" } })}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * How many times the series happens. The text is the field's own while it's typed, so it can be
 * cleared on the way to another number; only a whole number from 1 reaches the draft.
 */
function CountInput({
  count,
  onChange,
}: {
  readonly count: number;
  readonly onChange: (count: number) => void;
}) {
  const [text, setText] = useState(String(count));
  return (
    <div {...stylex.props(styles.count)}>
      <Input
        aria-label="Number of times"
        inputMode="numeric"
        min={1}
        onBlur={() => setText(String(count))}
        onChange={(event) => {
          setText(event.target.value);
          const next = Number(event.target.value);
          if (Number.isInteger(next) && next >= 1) onChange(next);
        }}
        type="number"
        value={text}
        xstyle={styles.countInput}
      />
      <span {...stylex.props(styles.times)}>times</span>
    </div>
  );
}
