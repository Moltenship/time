// #region button
import { Button } from "@ui-sdk/solid/button";

import { Calendar, type Meeting } from "./calendar";

// A button of your own, anywhere inside Root. It's a ui-sdk button, so an agent can press it.
export function RemoveMeeting(props: { readonly meeting: Meeting }) {
  const actions = Calendar.useCalendarActions();

  return (
    <Button
      // A person's click proposes the delete as your code: `input: "api"`. An agent's press
      // proposes the same delete as the agent: `input: "agent"`.
      onClick={() =>
        void actions.proposeEventChange({ cause: "delete", eventId: props.meeting.id })
      }
    >
      Remove {props.meeting.title}
    </Button>
  );
}
// #endregion button
