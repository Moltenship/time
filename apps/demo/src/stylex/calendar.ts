import { createCalendar } from "@moltenship/calendar";

import { demoOccurrenceAdapter, type DemoOccurrence, type DemoView } from "../demo-model";
import type { DemoResource } from "../resources";
import { stylexDemoViews } from "./views";

export const StylexDemoCalendar = createCalendar<DemoOccurrence, DemoResource>()({
  eventAdapter: demoOccurrenceAdapter,
  views: stylexDemoViews satisfies readonly { readonly name: DemoView }[],
});
