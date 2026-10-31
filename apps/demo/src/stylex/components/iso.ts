import type { DateInputProps } from "@astryxdesign/core/DateInput";
import type { TimeInputProps } from "@astryxdesign/core/TimeInput";

import { timeValue } from "../../event-form";

/** A date as Astryx's date fields take it, whose type only names the digits' places. */
export const isoDate = (date: Temporal.PlainDate) =>
  date.toString() as NonNullable<DateInputProps["value"]>;

/** A time as Astryx's time fields take it, a branded string. */
export const isoTime = (time: Temporal.PlainTime) =>
  timeValue(time) as NonNullable<TimeInputProps["value"]>;
