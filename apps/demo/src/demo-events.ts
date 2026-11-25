import type { DemoEvent } from "./demo-model";
import { createRoutineEvents } from "./routine";
import { createSeedEvents } from "./seed";
import { createSeriesEvents } from "./seed-series";

/** Three detailed weeks around today, its series, and a year of routine either way. */
export function seedAroundToday(timeZone: string): readonly DemoEvent[] {
  const today = Temporal.Now.plainDateISO(timeZone);
  return [
    ...createSeedEvents(today, timeZone),
    ...createSeriesEvents(today, timeZone),
    ...createRoutineEvents(today, timeZone),
  ];
}

/** The storage key; a new one when the seed changes, so returning visitors get the new seed. */
export const eventsStorageKey = "moltenship-demo:events:v4";
