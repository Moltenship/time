"use client";

import { isEventId, isResourceId } from "@moltenship/calendar";
import { useMemo, useState } from "react";

const initialEventId = "meeting-204";
const initialResourceId = "studio-a";

export default function ContractLab() {
  const [eventId, setEventId] = useState(initialEventId);
  const [resourceId, setResourceId] = useState(initialResourceId);
  const result = useMemo(
    () => ({
      event: isEventId(eventId),
      resource: isResourceId(resourceId),
    }),
    [eventId, resourceId],
  );

  return (
    <section aria-labelledby="contract-lab-title" className="contract-lab not-prose">
      <div className="contract-lab-copy">
        <p className="section-kicker">Live public-contract check</p>
        <h2 id="contract-lab-title">Identifiers stay in your domain.</h2>
        <p>
          Event and resource identifiers may be finite numbers or non-empty strings. This lab calls
          the same guards exported to application consumers—no workspace internals.
        </p>
      </div>
      <div className="contract-lab-panel">
        <label>
          <span>Event ID</span>
          <input
            aria-describedby="event-id-status"
            onChange={(event) => setEventId(event.currentTarget.value)}
            spellCheck={false}
            value={eventId}
          />
        </label>
        <p className="contract-status" data-valid={result.event} id="event-id-status">
          <span aria-hidden="true" />
          {result.event ? "Valid event contract" : "Enter a non-empty identifier"}
        </p>
        <label>
          <span>Resource ID</span>
          <input
            aria-describedby="resource-id-status"
            onChange={(event) => setResourceId(event.currentTarget.value)}
            spellCheck={false}
            value={resourceId}
          />
        </label>
        <p className="contract-status" data-valid={result.resource} id="resource-id-status">
          <span aria-hidden="true" />
          {result.resource ? "Valid resource contract" : "Enter a non-empty identifier"}
        </p>
      </div>
    </section>
  );
}
