import { createCalendar } from "@moltenship/calendar";

import { demoOccurrenceAdapter, type DemoOccurrence, type DemoView } from "./demo-model";
import { demoViews } from "./placeholder-views";
import type { DemoResource } from "./resources";

export { demoAdapters, demoEventAdapter } from "./demo-model";
export type { DemoEvent, DemoOccurrence, DemoView } from "./demo-model";

export const DemoCalendar = createCalendar<DemoOccurrence, DemoResource>()({
  eventAdapter: demoOccurrenceAdapter,
  views: demoViews satisfies readonly { readonly name: DemoView }[],
});
