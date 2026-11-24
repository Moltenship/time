"use client";

import { Calendar } from "./calendar";

export function NextButton() {
  const actions = Calendar.useCalendarActions();

  return (
    // Before: onClick={actions.navigateNext}. The click isn't the options object.
    <button type="button" onClick={(event) => actions.navigateNext({ event: event.nativeEvent })}>
      Next
    </button>
  );
}
