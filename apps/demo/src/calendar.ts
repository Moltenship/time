import { createCalendar } from "@moltenship/calendar";

import { demoOccurrenceAdapter, type DemoOccurrence, type DemoView } from "./demo-model";
import { demoViews } from "./views";
import type { DemoResource } from "./resources";

export { demoAdapters } from "./demo-model";
export type { DemoEvent, DemoOccurrence, DemoView } from "./demo-model";

export const DemoCalendar = createCalendar<DemoOccurrence, DemoResource>()({
  eventAdapter: demoOccurrenceAdapter,
  views: demoViews satisfies readonly { readonly name: DemoView }[],
});
