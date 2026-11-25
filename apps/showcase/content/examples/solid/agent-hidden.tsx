// #region hidden
import { seed, weekRules } from "./app";
import { Calendar } from "./calendar";

export function PrivateCalendar() {
  return (
    // Everything inside is left out of what an agent sees and can act on.
    <section data-agent-hidden>
      <Calendar.Root
        label="Private calendar"
        events={seed}
        defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
        defaultTimeZone="Europe/Berlin"
        locale="en-US"
        weekRules={weekRules}
      >
        <Calendar.Frame>
          <Calendar.Viewport>
            <Calendar.ActiveView />
          </Calendar.Viewport>
        </Calendar.Frame>
      </Calendar.Root>
    </section>
  );
}
// #endregion hidden
