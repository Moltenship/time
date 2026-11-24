"use client";

import { Button } from "@ui-sdk/react/button";

import { Calendar, type Meeting } from "./calendar";

// A button of your own, anywhere inside Root. It's a ui-sdk button, so an agent can press it.
export function RemoveMeeting({ meeting }: { readonly meeting: Meeting }) {
  const { proposeEventChange } = Calendar.useCalendarActions();

  return (
    <Button
      // A person's click proposes the delete as your code: `input: "api"`. An agent's press
      // proposes the same delete as the agent: `input: "agent"`.
      onClick={() => void proposeEventChange({ cause: "delete", eventId: meeting.id })}
    >
      Remove {meeting.title}
    </Button>
  );
}
