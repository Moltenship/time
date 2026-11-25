/// <reference types="vite/client" />
// #region window
import { agent } from "./agent";

// Vite sets `import.meta.env.DEV` in development.
if (import.meta.env.DEV) Object.assign(window, { agent });
// #endregion window

// #region console
agent.snapshot();
// [{ ref: "c1", component: "calendar", label: "Team calendar", view: "list", … }]

const calendar = { ref: "Team calendar" };

await agent.act({ steps: [{ ...calendar, action: "describeCalendar" }] });
// { ok: true, steps: [{ step: 0, ref: "c1", result: { today: "2026-10-06", views: […], … } }], … }

await agent.act({ steps: [{ ...calendar, action: "listEvents" }] });
// { ok: true, steps: [{ step: 0, ref: "c1", result: [{ id: "standup", title: "Standup", … }] }], … }

await agent.act({
  steps: [
    {
      ...calendar,
      action: "moveEvent",
      args: [{ eventId: "standup", start: "2026-10-09T10:00" }],
    },
  ],
});
// { ok: true, steps: [{ step: 0, ref: "c1", result: { changeId: "change-1", status: "saved", … } }], … }
// #endregion console
